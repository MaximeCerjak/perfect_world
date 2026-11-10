"""Vies des habitants : étapes d'âge, naissances, décès, liens et changements d'activité.

Les tirages d'un jour ne dépendent que de la graine du monde et du numéro du
jour : une reprise après interruption retrouve les mêmes vies.
"""
from __future__ import annotations

import random

from .parametres import METIERS
from .population import PRENOMS

ETAPES = {6: "vie.ecole", 16: "vie.premier_metier", 65: "vie.travail_allege", 75: "vie.retrait", 80: "vie.grand_age"}


def _metier_pour(rng: random.Random, parts: dict) -> int:
    x, cumul = rng.random(), 0.0
    for i, nom in enumerate(METIERS[1:], start=1):
        cumul += parts[nom]
        if x < cumul:
            return i
    return len(METIERS) - 1


def _foyer_d_accueil(etat: dict, ctx, rng: random.Random, jour: int, commune: int | None = None) -> int | None:
    """Tire un foyer pouvant accueillir une naissance : deux adultes de 20 à 42 ans, moins de six personnes."""
    f, h = etat["foyers"], etat["humains"]
    nf = len(f["commune"])
    for _ in range(60):
        fi = rng.randrange(nf)
        membres = f["membres"][fi]
        if not 2 <= len(membres) < 6 or (commune is not None and f["commune"][fi] != commune):
            continue
        if sum(1 for hi in membres if 20 <= (jour - h["naissance"][hi]) // 365 <= 42) >= 2:
            return fi
    return None


def _naissance(etat: dict, ctx, rng: random.Random, jour: int, fi: int) -> int:
    h, f = etat["humains"], etat["foyers"]
    hi = len(h["prenom"])
    h["prenom"].append(rng.choice(PRENOMS))
    h["naissance"].append(jour)
    h["foyer"].append(fi)
    h["metier"].append(0)
    h["debut_metier"].append(0)
    h["vivant"].append(1)
    h["liens"].append([])
    f["membres"][fi].append(hi)
    ctx.sale = True
    return hi


def appliquer(etat: dict, ctx, jour: int, entrees: list[dict], evt, rattachements: list) -> None:
    """Applique les événements de vie du jour ; `evt` enregistre un événement daté."""
    hyp, h, f = ctx.hyp, etat["humains"], etat["foyers"]
    rng = random.Random(ctx.graine * 1_000_003 + jour)
    ids = ctx.ids
    pop = sum(ctx.pop)

    # Étapes d'âge.
    for hi in ctx.anniversaires.get(jour % 365, ()):
        if not h["vivant"][hi]:
            continue
        age = (jour - h["naissance"][hi]) // 365
        if age in ETAPES:
            fi = h["foyer"][hi]
            ci = f["commune"][fi]
            mesure = {"age": age}
            if age == 16:
                h["metier"][hi] = _metier_pour(rng, ctx.communes[ci]["metiers"])
                h["debut_metier"][hi] = jour
                mesure["metier"] = h["metier"][hi]
            evt(ETAPES[age], ids[ci], mesure, foyer=fi, humain=hi)
            ctx.sale = True

    # Naissances d'inscription (parcours « une naissance par abonné »).
    capacite = hyp["vie.capacite_logement_facteur"]
    for e in entrees:
        if e["type"] != "inscription.naissance":
            continue
        places = [ctx.communes[ci]["part_population"] * ctx.scenario["population"] * capacite - ctx.pop[ci]
                  for ci in range(len(ids))]
        ci = max(range(len(ids)), key=lambda i: places[i])
        fi = _foyer_d_accueil(etat, ctx, rng, jour, ci) or _foyer_d_accueil(etat, ctx, rng, jour)
        if fi is None:
            continue
        hi = _naissance(etat, ctx, rng, jour, fi)
        ctx.pop[f["commune"][fi]] += 1
        evt("vie.naissance", ids[f["commune"][fi]], {}, foyer=fi, humain=hi)
        rattachements.append((e["participant"], hi))

    def nombre(taux_annuel: float, base: int) -> int:
        attendu = taux_annuel * base / 365
        return int(attendu) + (1 if rng.random() < attendu - int(attendu) else 0)

    # Naissances.
    for _ in range(nombre(hyp["vie.natalite_par_an"], pop)):
        fi = _foyer_d_accueil(etat, ctx, rng, jour)
        if fi is None:
            continue
        ci = f["commune"][fi]
        if ctx.pop[ci] >= ctx.communes[ci]["part_population"] * ctx.scenario["population"] * capacite:
            continue
        hi = _naissance(etat, ctx, rng, jour, fi)
        evt("vie.naissance", ids[ci], {}, foyer=fi, humain=hi)

    # Décès, concentrés sur les âges élevés.
    nh = len(h["prenom"])
    for _ in range(nombre(hyp["vie.mortalite_par_an"], pop)):
        for _ in range(40):
            hi = rng.randrange(nh)
            if not h["vivant"][hi]:
                continue
            age = (jour - h["naissance"][hi]) // 365
            if rng.random() < (1.0 if age >= 80 else 0.3 if age >= 65 else 0.01):
                fi = h["foyer"][hi]
                h["vivant"][hi] = 0
                f["membres"][fi].remove(hi)
                evt("vie.deces", ids[f["commune"][fi]], {"age": age}, foyer=fi, humain=hi)
                ctx.sale = True
                break

    # Nouveaux liens, entre habitants d'une même commune et d'âges proches.
    for _ in range(nombre(hyp["vie.liens_par_personne_an"], pop)):
        a = rng.randrange(nh)
        if not h["vivant"][a] or (jour - h["naissance"][a]) // 365 < 6 or len(h["liens"][a]) >= 8:
            continue
        ci = f["commune"][h["foyer"][a]]
        voisins = ctx.foyers_de[ci]
        membres = f["membres"][voisins[rng.randrange(len(voisins))]]
        if not membres:
            continue
        b = membres[rng.randrange(len(membres))]
        if (b == a or h["foyer"][b] == h["foyer"][a] or b in h["liens"][a] or len(h["liens"][b]) >= 8
                or abs(h["naissance"][a] - h["naissance"][b]) > 15 * 365 or (jour - h["naissance"][b]) // 365 < 6):
            continue
        h["liens"][a].append(b)
        h["liens"][b].append(a)
        evt("lien.noue", ids[ci], {"contexte": "travail" if h["metier"][a] and h["metier"][a] == h["metier"][b]
                                   else "voisinage"}, foyer=h["foyer"][a], humain=a, humain2=b)

    # Changements d'activité.
    for _ in range(nombre(hyp["vie.changement_activite_par_an"], int(pop * 0.55))):
        hi = rng.randrange(nh)
        age = (jour - h["naissance"][hi]) // 365
        if not h["vivant"][hi] or not h["metier"][hi] or not 17 <= age < 64:
            continue
        fi = h["foyer"][hi]
        ci = f["commune"][fi]
        nouveau = _metier_pour(rng, ctx.communes[ci]["metiers"])
        if nouveau != h["metier"][hi]:
            evt("activite.change", ids[ci], {"avant": h["metier"][hi], "apres": nouveau}, foyer=fi, humain=hi)
            h["metier"][hi] = nouveau
            h["debut_metier"][hi] = jour
            ctx.sale = True
