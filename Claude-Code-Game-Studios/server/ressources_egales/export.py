"""Export d'un jeu de démonstration : les réponses de l'API, figées dans un fichier JSON.

Le site sait lire ce fichier à la place de l'API. Il sert au fichier unique
ouvert depuis le disque, aux essais automatiques et aux démonstrations sans serveur.
"""
from __future__ import annotations

import json
from pathlib import Path

from .api import routes_lecture
from .service import Service
from .stockage import Base


def exporter(db: Base, ids: list[str], sortie: Path) -> dict:
    """Écrit les vues des mondes `ids` dans `sortie` et retourne le nombre de routes par monde."""
    service = Service(db)
    donnees: dict[str, dict] = {}

    def ajouter(chemin: str, q: dict | None = None) -> dict:
        cle = chemin + ("?" + "&".join(f"{k}={v}" for k, v in q.items()) if q else "")
        donnees[cle] = routes_lecture(service, chemin, q or {})
        return donnees[cle]

    tous = ajouter("/api/mondes")
    tous["mondes"] = [m for m in tous["mondes"] if m["id"] in ids]
    ajouter("/api/hypotheses")
    ajouter("/api/comparaison", {"mondes": ",".join(ids)})
    compte = {}
    for m in ids:
        avant = len(donnees)
        base = f"/api/mondes/{m}"
        region = ajouter(f"{base}/region")
        ajouter(f"{base}/chronologie")
        ajouter(f"{base}/observation")
        ajouter(f"{base}/lieux/region/evenements")
        ajouter(f"{base}/humains", {"limite": 200})
        for c in region["communes"]:
            ajouter(f"{base}/lieux/{c['id']}/evenements")
            ajouter(f"{base}/humains", {"commune": c["id"], "limite": 60})
        for b in region["biens"]:
            ajouter(f"{base}/biens/{b['id']}")
        for hi in range(len(service._monde(m)["etat"]["humains"]["prenom"])):
            ajouter(f"{base}/humains/{hi}")
        for (eid,) in db.lire("SELECT id FROM evenements WHERE monde = ?", (m,)):
            ajouter(f"{base}/evenements/{eid}")
        compte[m] = len(donnees) - avant
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(donnees, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return compte
