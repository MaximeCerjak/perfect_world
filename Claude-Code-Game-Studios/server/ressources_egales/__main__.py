"""Ligne de commande : `python -m ressources_egales <commande>`.

    comparer   crée et simule les trajectoires A, B et C, puis affiche leurs écarts
    creer      crée un monde au jour 0
    avancer    fait avancer un monde de N jours (reprend au dernier jour validé)
    inscrire   injecte des inscriptions de test, avec répétitions
    acheter    injecte un achat de test, une annulation ou un changement d'accès
    servir     lance l'API et le site, avec une cadence facultative
    exporter   écrit le jeu de démonstration lu par le site sans serveur
    recette    déroule la recette minimale du prototype et mesure les durées
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

from . import entrees, monde as mondes, parametres
from .service import Service
from .stockage import Base

RACINE = parametres.RACINE


def _surcharges(liste: list[str] | None) -> dict:
    sortie = {}
    for item in liste or []:
        cle, _, valeur = item.partition("=")
        sortie[cle] = json.loads(valeur)
    return sortie


def comparer(db: Base, population: int, jours: int, surcharges: dict, prefixe: str = "") -> dict:
    """Crée et simule les cas A, B et C sur la même année, puis retourne leur comparaison."""
    jeux = parametres.charger_cas()["cas"]
    ids = []
    for cas, jeu in jeux.items():
        mid = prefixe + cas
        if any(m["id"] == mid for m in mondes.lister(db)):
            mondes.supprimer(db, mid)
        mondes.creer_monde(db, mid, f"Cas {cas} — {jeu['nom']}", population, jours_max=jours, surcharges=surcharges, cas=cas)
        d = mondes.avancer(db, mid, jours)
        print(f"cas {cas} : {d['jours']} jours, calcul {d['calcul_s']:.1f} s, écriture {d['ecriture_s']:.1f} s, "
              f"{d['evenements']} événements", file=sys.stderr)
        ids.append(mid)
    return Service(db).comparaison(ids)


def afficher_comparaison(c: dict) -> None:
    """Affiche le tableau de comparaison et les écarts reliés à leurs événements."""
    libelles = [("non_couvert_kg", "demande non couverte (kg)"), ("non_servi_depot_kg", "non servi par l'entrepôt (kg)"),
                ("jours_reserve_min", "jours de réserve, minimum"), ("secours_kg", "reçu de la réserve de secours (kg)"),
                ("heures_tournee_secours", "heures de tournée de secours"), ("heures_trajet_foyers", "heures de trajet des foyers"),
                ("entretien_reporte_h", "entretien reporté (h)"), ("pompe_etat_fin", "état de la pompe en fin d'année"),
                ("temps_libre_moyen_h", "temps libre moyen (h/jour)")]
    noms = [m["monde"] for m in c["mondes"]]
    print(f"{'':44}" + "".join(f"{n:>12}" for n in noms))
    for cid in c["mondes"][0]["communes"]:
        print(f"\n{cid}")
        for cle, libelle in libelles:
            print(f"  {libelle:42}" + "".join(f"{m['communes'][cid][cle]:>12.2f}" for m in c["mondes"]))
    print("\nrégion")
    for cle in ("jours_limites_par_droits", "part_reservee_max", "concentration_max", "depot_fin_kg", "secours_fin_kg"):
        print(f"  {cle:42}" + "".join(f"{m['region'][cle]:>12.2f}" for m in c["mondes"]))
    for e in c["ecarts"]:
        print(f"\n{e['monde']} par rapport à {e['reference']} : "
              + ("mêmes conditions d'usage, mêmes résultats" if e["identique"] else f"{len(e['mesures'])} mesures diffèrent"))
        for ev in e["evenements_nouveaux"][:12]:
            print(f"  {ev['id']} {ev['date']:>22} · {ev['lieu_nom']} · {ev['titre']} (×{ev['occurrences']}) ← {', '.join(ev['causes']) or 'événement daté'}")


def recette(db_url: str, population: int, inscriptions: int) -> int:
    """Déroule la recette minimale du dossier de cadrage et affiche les mesures."""
    db = Base(db_url)
    ok = True

    def point(nom: str, reussi: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and reussi
        print(f"[{'OK' if reussi else 'ÉCHEC'}] {nom}" + (f" — {detail}" if detail else ""))

    for m in mondes.lister(db):
        mondes.supprimer(db, m["id"])
    t = time.perf_counter()
    c = comparer(db, population, 365, {})
    duree = time.perf_counter() - t
    point(f"{population} habitants × 365 jours × 3 trajectoires, bilans et capacités vérifiés chaque jour", True,
          f"{duree:.1f} s au total, {duree / (3 * 365) * 1000:.0f} ms par journée (calcul et écriture)")
    b, cc = c["ecarts"]
    point("cas A et B : mêmes conditions d'usage, mêmes résultats", b["identique"])
    point("cas C : écarts lisibles dans les comptes et reliés à des événements",
          not cc["identique"] and bool(cc["evenements_nouveaux"]),
          f"{len(cc['mesures'])} mesures diffèrent, {len(cc['evenements_nouveaux'])} types de faits nouveaux")
    mondes.creer_monde(db, "rejeu", "Rejeu du cas C", population, cas="C")
    mondes.avancer(db, "rejeu", 365)
    point("même scénario relancé : mêmes bilans et mêmes événements", mondes.empreinte(db, "rejeu") == mondes.empreinte(db, "C"))
    mondes.creer_monde(db, "reprise", "Reprise du cas C", population, cas="C")

    def couper(jour: int) -> None:
        if jour == 200:
            raise KeyboardInterrupt
    try:
        mondes.avancer(db, "reprise", 365, arret_apres=couper)
    except KeyboardInterrupt:
        pass
    mondes.avancer(db, "reprise", 365)
    point("exécution interrompue au jour 200 puis reprise : même résultat", mondes.empreinte(db, "reprise") == mondes.empreinte(db, "C"))
    rng = random.Random(7)
    evs = [{"cle": f"ig-evt-{i}", "type": "abonnement", "compte": f"ig-{i}", "pseudo": f"abonne_{i}"} for i in range(inscriptions)]
    rafale = evs + [rng.choice(evs) for _ in range(inscriptions // 2)]
    rng.shuffle(rafale)
    t = time.perf_counter()
    bilan = entrees.traiter_inscriptions(db, "A", rafale)
    duree = time.perf_counter() - t
    n = db.lire_un("SELECT COUNT(*), COUNT(DISTINCT humain) FROM rattachements WHERE monde = 'A'")
    point(f"{inscriptions} inscriptions distinctes en rafale avec {inscriptions // 2} répétitions : une association par abonné",
          bilan["inscrits"] == inscriptions and n[0] == n[1] == min(inscriptions, population),
          f"{duree:.2f} s, {bilan['doublons']} doublons écartés, {n[0]} humains rattachés")
    encore = entrees.traiter_inscriptions(db, "A", [
        {"cle": "ig-des-1", "type": "desabonnement", "compte": "ig-1"},
        {"cle": "ig-re-1", "type": "abonnement", "compte": "ig-1"}])
    premier = next(r for r in bilan["resultats"] if r.get("participant") == encore["resultats"][1].get("participant"))
    point("désabonnement puis réabonnement : même compte, même humain",
          encore["resultats"][1]["statut"] == "retrouve" and encore["resultats"][1]["humain"] == premier.get("humain"))
    t = time.perf_counter()
    s = Service(db)
    s.region("C"), s.chronologie("C"), s.humain("C", 0), s.observation("C")
    point("lecture des vues (carte, chronologie, fiche, observation)", True, f"{time.perf_counter() - t:.2f} s à froid")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée de la ligne de commande."""
    ap = argparse.ArgumentParser(prog="ressources_egales", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default="ressources-egales.db", help="fichier SQLite ou URL postgresql://")
    sp = ap.add_subparsers(dest="commande", required=True)
    p = sp.add_parser("comparer")
    p.add_argument("--population", type=int, default=1000)
    p.add_argument("--jours", type=int, default=365)
    p.add_argument("--hypothese", action="append", metavar="cle=valeur")
    p.add_argument("--json", action="store_true")
    p = sp.add_parser("creer")
    p.add_argument("monde")
    p.add_argument("--nom")
    p.add_argument("--population", type=int, default=1000)
    p.add_argument("--jours-max", type=int, default=365)
    p.add_argument("--cas", choices=["A", "B", "C"])
    p.add_argument("--inscription", choices=entrees.MODES, default="humain_disponible")
    p.add_argument("--hypothese", action="append", metavar="cle=valeur")
    p = sp.add_parser("avancer")
    p.add_argument("monde")
    p.add_argument("--jours", type=int, default=1)
    p = sp.add_parser("inscrire")
    p.add_argument("monde")
    p.add_argument("--nombre", type=int, default=10)
    p.add_argument("--repetitions", type=int, default=0)
    p = sp.add_parser("acheter")
    p.add_argument("monde")
    p.add_argument("evenement", help='JSON, par exemple {"cle":"a1","type":"achat.confirme","compte":"c1","bien":"depot","part":0.4,"acces":"reserve"}')
    p = sp.add_parser("servir")
    p.add_argument("--hote", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--monde", help="monde à faire avancer en cadence")
    p.add_argument("--cadence", type=float, default=0, help="secondes réelles par journée simulée (0 : monde à l'arrêt)")
    p.add_argument("--entrees-test", action="store_true", help="ouvre les routes d'inscription et d'achat de test")
    p = sp.add_parser("exporter")
    p.add_argument("mondes", nargs="+")
    p.add_argument("--sortie", default=str(RACINE / "data" / "demo" / "demo.json"))
    p = sp.add_parser("recette")
    p.add_argument("--population", type=int, default=10000)
    p.add_argument("--inscriptions", type=int, default=5000)
    a = ap.parse_args(argv)
    if a.commande == "recette":
        return recette(a.db, a.population, a.inscriptions)
    db = Base(a.db)
    if a.commande == "comparer":
        c = comparer(db, a.population, a.jours, _surcharges(a.hypothese))
        print(json.dumps(c, ensure_ascii=False, indent=1)) if a.json else afficher_comparaison(c)
    elif a.commande == "creer":
        mondes.creer_monde(db, a.monde, a.nom or a.monde, a.population, jours_max=a.jours_max, cas=a.cas,
                           surcharges=_surcharges(a.hypothese), mode_inscription=a.inscription)
        print(f"monde {a.monde} créé au jour 0")
    elif a.commande == "avancer":
        print(json.dumps(mondes.avancer(db, a.monde, a.jours)))
    elif a.commande == "inscrire":
        rng = random.Random(1)
        debut = db.lire_un("SELECT COUNT(*) FROM participants WHERE monde = ?", (a.monde,))[0]
        evs = [{"cle": f"test-{debut + i}", "type": "abonnement", "compte": f"test-{debut + i}", "pseudo": f"abonne_{debut + i}"}
               for i in range(a.nombre)]
        bilan = entrees.traiter_inscriptions(db, a.monde, evs + [rng.choice(evs) for _ in range(a.repetitions)])
        for r in bilan.pop("resultats")[:10]:
            print(r)
        print(bilan)
    elif a.commande == "acheter":
        print(entrees.recevoir_achat(db, a.monde, json.loads(a.evenement)))
    elif a.commande == "exporter":
        from .export import exporter
        print(exporter(db, a.mondes, Path(a.sortie)), "->", a.sortie)
    elif a.commande == "servir":
        from .api import creer_serveur, lancer_cadence
        site = RACINE / "dist"
        serveur = creer_serveur(db, a.hote, a.port, site if site.is_dir() else None, a.entrees_test)
        if a.monde and a.cadence > 0:
            lancer_cadence(db, serveur, a.monde, a.cadence)
        print(f"http://{a.hote}:{a.port}/ — Ctrl+C pour arrêter")
        try:
            serveur.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
