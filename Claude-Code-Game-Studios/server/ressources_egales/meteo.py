"""Série météo journalière : débit entrant de la rivière et pluie.

La série est tirée une fois, à la création du monde, puis enregistrée avec lui.
Rejouer un scénario recharge la même série.
"""
from __future__ import annotations

import math
import random


def _facteur_episode(ep: dict, jour: int, cle: str) -> float:
    """Facteur d'un épisode pour `jour`, avec une entrée et une sortie progressives."""
    t = max(1, ep.get("transition_jours", 1))
    if jour < ep["debut_jour"] or jour > ep["fin_jour"]:
        return 1.0
    poids = min(1.0, (jour - ep["debut_jour"] + 1) / t, (ep["fin_jour"] - jour + 1) / t)
    return 1.0 + (ep[cle] - 1.0) * poids


def generer_serie(meteo: dict, jours: int, graine: int) -> dict:
    """Tire `jours + 1` valeurs de débit (m³/jour) et de pluie (mm/jour).

    L'indice 0 n'est pas simulé : il garde les séries alignées sur les numéros de jour.
    """
    rng = random.Random(graine * 7919 + 17)
    d, p = meteo["debit_m3_jour"], meteo["pluie"]
    debits, pluies = [], []
    for j in range(jours + 1):
        an = j % 365
        saison = math.cos(2 * math.pi * (an - d["jour_creux"]) / 365)
        debit = d["moyen"] * (1 - d["amplitude_saison"] * saison) * (1 + d["bruit"] * (rng.random() * 2 - 1))
        pluie_moy = p["mm_jour_moyen"] * (1 - p["amplitude_saison"] * saison)
        proba = p["probabilite_jour_pluvieux"]
        f_debit = f_pluie = 1.0
        for ep in meteo["episodes"]:
            f_debit *= _facteur_episode(ep, j, "facteur_debit")
            f_pluie *= _facteur_episode(ep, j, "facteur_pluie")
        tirage_jour, tirage_hauteur = rng.random(), rng.expovariate(1.0)
        pluie = tirage_hauteur * pluie_moy / proba if tirage_jour < proba * f_pluie else 0.0
        debits.append(round(debit * f_debit, 3))
        pluies.append(round(pluie, 3))
    return {"debit_m3": debits, "pluie_mm": pluies}
