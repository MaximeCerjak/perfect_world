"""Chargement des données de scénario : territoire, hypothèses et cas de droits.

Les fichiers de `data/scenario/` sont la seule source des valeurs de jeu. Le
territoire est décrit pour 1 000 habitants ; `charger_scenario` le met à
l'échelle de la population demandée.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
DOSSIER_SCENARIO = RACINE / "data" / "scenario"

METIERS = ("aucun", "agriculture", "technique", "services")
AGRICULTURE, TECHNIQUE, SERVICES = 1, 2, 3

# Champs du territoire proportionnels à la population.
_ECHELLE_GRENIER = ("capacite_kg", "stock_initial_kg")
_ECHELLE_POMPE = ("capacite_m3_jour", "entretien_h_jour")
_ECHELLE_BIEN = ("capacite_stockage_kg", "stock_initial_kg", "capacite_passage_kg_jour",
                 "capacite_m3", "volume_initial_m3", "volume_minimal_m3", "lacher_max_m3_jour")
_ECHELLE_HYPOTHESES = ("eau.seuil_ecologique_m3_jour", "energie.budget_kwh_jour")


def _lire(nom: str, dossier: Path | None = None) -> dict:
    with open((dossier or DOSSIER_SCENARIO) / nom, encoding="utf-8") as f:
        return json.load(f)


def charger_scenario(population: int = 1000, surcharges: dict | None = None,
                     dossier: Path | None = None) -> dict:
    """Retourne le scénario complet, mis à l'échelle de `population`.

    `surcharges` remplace des hypothèses par leur clé (`{"entraide.active": False}`)
    pour les essais de sensibilité. Le résultat est un dictionnaire sérialisable,
    enregistré tel quel avec le monde pour pouvoir le rejouer.
    """
    region = copy.deepcopy(_lire("region-pilote.json", dossier))
    hyp = {cle: h["valeur"] for cle, h in _lire("hypotheses.json", dossier)["hypotheses"].items()}
    for cle, valeur in (surcharges or {}).items():
        if cle not in hyp:
            raise KeyError(f"hypothèse inconnue : {cle}")
        hyp[cle] = valeur
    e = population / region["population_reference"]
    for c in region["communes"]:
        for k in _ECHELLE_GRENIER:
            c["grenier"][k] *= e
        for k in _ECHELLE_POMPE:
            c["pompe"][k] *= e
    for r in region["routes"]:
        r["capacite_kg_jour"] *= e
    for b in region["biens"].values():
        for k in _ECHELLE_BIEN:
            if k in b:
                b[k] *= e
    for ch in region["champs"]:
        ch["surface_ha"] *= e
    region["meteo"]["debit_m3_jour"]["moyen"] *= e
    for k in _ECHELLE_HYPOTHESES:
        hyp[k] *= e
    return {"population": population, "echelle": e, "region": region, "hypotheses": hyp}


def charger_cas(dossier: Path | None = None) -> dict:
    """Retourne les cas de comparaison A, B et C (droits sur l'entrepôt)."""
    return _lire("cas.json", dossier)


def charger_fiches_hypotheses(dossier: Path | None = None) -> dict:
    """Retourne les hypothèses avec unité, nature, effet attendu et plage à tester."""
    return _lire("hypotheses.json", dossier)["hypotheses"]
