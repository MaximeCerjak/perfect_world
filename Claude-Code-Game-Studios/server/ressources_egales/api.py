"""API HTTP et service des fichiers du site.

Bibliothèque standard uniquement. Les routes de lecture sont celles de
`Service` ; les routes d'écriture reçoivent les entrées de test (inscriptions,
achats) et ne sont ouvertes qu'avec `entrees_test=True`.
"""
from __future__ import annotations

import json
import mimetypes
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import entrees, monde as mondes
from .service import Service
from .stockage import Base

CORPS_MAX = 2_000_000


def routes_lecture(service: Service, chemin: str, q: dict) -> dict:
    """Résout une route de lecture `/api/...` ; lève `KeyError` si elle n'existe pas."""
    p = [x for x in chemin.split("/") if x][1:]
    if p == ["mondes"]:
        return service.mondes()
    if p == ["hypotheses"]:
        return service.hypotheses()
    if p == ["comparaison"]:
        return service.comparaison(q["mondes"].split(","))
    if len(p) >= 3 and p[0] == "mondes":
        m, vue = p[1], p[2]
        if vue == "region":
            return service.region(m)
        if vue == "chronologie":
            return service.chronologie(m)
        if vue == "observation":
            return service.observation(m)
        if vue == "lieux" and len(p) == 5 and p[4] == "evenements":
            return service.evenements_lieu(m, p[3])
        if vue == "humains" and len(p) == 3:
            return service.humains(m, q.get("commune"), q.get("q"), min(200, int(q.get("limite", 60))))
        if vue == "humains" and len(p) == 4:
            return service.humain(m, int(p[3]))
        if vue == "biens" and len(p) == 4:
            return service.bien(m, p[3])
        if vue == "evenements" and len(p) == 4:
            return service.evenement(m, p[3])
    raise KeyError("route inconnue")


def creer_serveur(db: Base, hote: str = "127.0.0.1", port: int = 8000, site: Path | None = None,
                  entrees_test: bool = False) -> ThreadingHTTPServer:
    """Construit le serveur HTTP ; `serve_forever()` le démarre."""
    service = Service(db)
    verrou = threading.Lock()

    class Requete(BaseHTTPRequestHandler):
        server_version = "RessourcesEgales/0.1"

        def log_message(self, *args) -> None:  # journal d'accès silencieux
            pass

        def _json(self, code: int, objet: dict) -> None:
            corps = json.dumps(objet, ensure_ascii=False, separators=(",", ":")).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corps)

        def _traiter(self, action) -> None:
            try:
                with verrou:
                    resultat = action()
                self._json(200, resultat)
            except PermissionError as e:
                self._json(401, {"erreur": str(e)})
            except (KeyError, ValueError, IndexError) as e:
                self._json(404 if isinstance(e, KeyError) else 400, {"erreur": str(e).strip("'\"")})

        def do_GET(self) -> None:
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/api/moi":
                code = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
                return self._traiter(lambda: service.moi(code))
            if url.path.startswith("/api/"):
                return self._traiter(lambda: routes_lecture(service, url.path, q))
            if not site:
                return self._json(404, {"erreur": "site non construit : lancer npm run build"})
            fichier = (site / url.path.lstrip("/")).resolve()
            if not str(fichier).startswith(str(site.resolve())) or not fichier.is_file():
                fichier = site / "index.html"
            corps = fichier.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(fichier.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)

        def do_POST(self) -> None:
            url = urlparse(self.path)
            p = [x for x in url.path.split("/") if x]
            taille = int(self.headers.get("Content-Length", 0))
            if not entrees_test:
                return self._json(403, {"erreur": "entrées de test fermées"})
            if taille > CORPS_MAX or len(p) != 4 or p[:2] != ["api", "mondes"]:
                return self._json(400, {"erreur": "requête invalide"})
            try:
                corps = json.loads(self.rfile.read(taille) or b"{}")
            except json.JSONDecodeError:
                return self._json(400, {"erreur": "JSON invalide"})
            if p[3] == "inscriptions":
                return self._traiter(lambda: entrees.traiter_inscriptions(db, p[2], corps.get("evenements", [])))
            if p[3] == "achats":
                return self._traiter(lambda: entrees.recevoir_achat(db, p[2], corps))
            self._json(404, {"erreur": "route inconnue"})

    serveur = ThreadingHTTPServer((hote, port), Requete)
    serveur.verrou = verrou  # partagé avec la cadence du monde
    return serveur


def lancer_cadence(db: Base, serveur: ThreadingHTTPServer, monde: str, secondes: float) -> threading.Thread:
    """Fait avancer `monde` d'une journée toutes les `secondes`, indépendamment des lectures."""
    def boucle() -> None:
        while True:
            time.sleep(secondes)
            with serveur.verrou:
                try:
                    mondes.avancer(db, monde, 1)
                except Exception as e:  # la cadence continue ; l'état reste au dernier jour validé
                    print(f"cadence : {e}")
    fil = threading.Thread(target=boucle, daemon=True)
    fil.start()
    return fil
