"""Population de départ et état initial du monde.

Les habitants sont rangés en colonnes (une liste par attribut) : l'état reste
compact à 10 000 habitants et se sérialise tel quel en JSON.
"""
from __future__ import annotations

import random

from .parametres import METIERS

PRENOMS = (
    "Adèle Aimé Alba Albin Aline Ambre Anselme Anouk Armel Aubin Aurore Basile Bérénice Blaise Brune "
    "Camille Capucine Célestin Charlie Clément Colombe Côme Constance Cyprien Daphné Diane Eden Edmée "
    "Élie Éloi Émeline Esther Étienne Eudes Fanny Félix Flore Florian Gaël Garance Gaspard Hélie Hermine "
    "Honoré Inès Iris Isaure Jeanne Joachim Josse Judith Jules Léonie Lilou Lior Louison Lucie Ludivine "
    "Maël Mahaut Marin Mathilde Maxence Mélisande Nell Nils Noé Noémie Octave Odile Orane Oriane Pacôme "
    "Perrine Philémon Prune Quentin Rémi Romane Rosalie Sacha Salomé Sévère Sidonie Solal Soline Tanguy "
    "Thaïs Théo Tiphaine Ulysse Valentin Victoire Violette Yaël Yann Zélie Zoé"
).split()

NOMS = (
    "Aubrac Bastide Bellecombe Bosquet Brissac Castan Chantelou Combe Courtil Delorme Desrives Duclos "
    "Dupré Escande Fabrègue Falguière Ferrand Fontanel Gaillac Garrigue Jonquière Labarthe Lacoste Lafarge "
    "Lagarde Lavigne Malaval Marsan Mazel Montaud Noguier Pradel Puech Ricard Rieutort Roqueplan Roussel "
    "Sabatier Salvan Sauvage Serre Soulier Teissier Valat Valette Verdier Vernet Vidal Viguier Villaret"
).split()

TYPES_FOYER = ("personne seule", "couple", "famille", "parent seul", "foyer d'aînés")


def _tirer_metier(rng: random.Random, parts: dict) -> int:
    x, cumul = rng.random(), 0.0
    for i, nom in enumerate(METIERS[1:], start=1):
        cumul += parts[nom]
        if x < cumul:
            return i
    return len(METIERS) - 1


def _composer_foyer(rng: random.Random, taille: int) -> list[int]:
    """Âges (en années) des membres d'un foyer de `taille` personnes, adultes d'abord."""
    if taille == 1:
        return [rng.randint(66, 90) if rng.random() < 0.34 else rng.randint(20, 64)]
    if taille == 2:
        x = rng.random()
        if x < 0.30:
            a = rng.randint(66, 88)
            return [a, max(62, a - rng.randint(0, 6))]
        if x < 0.78:
            a = rng.randint(22, 64)
            return [a, max(20, a - rng.randint(0, 5))]
        parent = rng.randint(24, 50)
        return [parent, rng.randint(0, min(17, parent - 20))]
    adultes = 1 if rng.random() < 0.18 else 2
    parent = rng.randint(26, 52)
    ages = [parent] + ([max(22, parent - rng.randint(0, 5))] if adultes == 2 else [])
    for _ in range(taille - adultes):
        ages.append(rng.randint(0, min(17, parent - 21)))
    return ages


def creer_etat_initial(scenario: dict, graine: int) -> dict:
    """Construit l'état du jour 0 : habitants, foyers, stocks, champs et équipements."""
    rng = random.Random(graine * 104729 + 3)
    region, hyp = scenario["region"], scenario["hypotheses"]
    tailles = hyp["vie.tailles_foyers"]
    h = {"prenom": [], "naissance": [], "foyer": [], "metier": [], "debut_metier": [], "vivant": [], "liens": []}
    f = {"commune": [], "nom": [], "membres": [], "ilot": [], "garde_manger": [], "dette": [],
         "trajets": [], "heures_trajet": [], "non_couvert_kg": [], "travail_perdu_h": []}
    for ci, c in enumerate(region["communes"]):
        cible = round(c["part_population"] * scenario["population"])
        debut_foyers, pop = len(f["commune"]), 0
        while pop < cible:
            x, cumul, taille = rng.random(), 0.0, len(tailles)
            for t, part in enumerate(tailles, start=1):
                cumul += part
                if x < cumul:
                    taille = t
                    break
            taille = min(taille, cible - pop)
            fi = len(f["commune"])
            membres = []
            for age in _composer_foyer(rng, taille):
                hi = len(h["prenom"])
                h["prenom"].append(rng.choice(PRENOMS))
                h["naissance"].append(-(age * 365 + rng.randrange(365)))
                h["foyer"].append(fi)
                if 16 <= age < 75:
                    h["metier"].append(-1)  # réparti par quota une fois la commune peuplée
                    h["debut_metier"].append(-rng.randrange(0, max(1, (age - 16) * 365 + 1)))
                else:
                    h["metier"].append(0)
                    h["debut_metier"].append(0)
                h["vivant"].append(1)
                h["liens"].append([])
                membres.append(hi)
            f["commune"].append(ci)
            f["nom"].append(rng.choice(NOMS))
            f["membres"].append(membres)
            f["ilot"].append(fi - debut_foyers)
            for k in ("garde_manger", "dette", "heures_trajet", "non_couvert_kg", "travail_perdu_h"):
                f[k].append(0.0)
            f["trajets"].append(0)
            pop += taille
        habitants = [hi for fi in range(debut_foyers, len(f["commune"])) for hi in f["membres"][fi]]
        # Métiers répartis par quota : les parts de la commune sont tenues à toute échelle.
        actifs = [hi for hi in habitants if h["metier"][hi] == -1]
        rng.shuffle(actifs)
        seuils, cumul = [], 0.0
        for nom in METIERS[1:]:
            cumul += c["metiers"][nom]
            seuils.append(cumul)
        for rang, hi in enumerate(actifs):
            x = (rang + 0.5) / len(actifs)
            h["metier"][hi] = next((i for i, s in enumerate(seuils, start=1) if x < s), len(seuils))
        # Quelques liens de départ entre voisins de la même commune.
        for _ in range(len(habitants) // 2):
            a, b = rng.choice(habitants), rng.choice(habitants)
            if a != b and h["foyer"][a] != h["foyer"][b] and b not in h["liens"][a] and len(h["liens"][a]) < 4:
                h["liens"][a].append(b)
                h["liens"][b].append(a)
    biens = region["biens"]
    return {
        "jour": 0,
        "seq": 0,
        "communes": {c["id"]: {"stock_kg": c["grenier"]["stock_initial_kg"], "arriere_h": 0.0}
                     for c in region["communes"]},
        "depot_kg": biens["depot"]["stock_initial_kg"],
        "secours_kg": biens["secours"]["stock_initial_kg"],
        "reserve_m3": biens["reserve_eau"]["volume_initial_m3"],
        "champs": {ch["id"]: {"sol_m3_ha": hyp["alimentation.reserve_sol_max_m3_ha"] * 0.6, "eau_ok": 0.0,
                              "eau_besoin": 0.0, "soin_ok": 0.0, "soin_besoin": 0.0, "a_recolter_kg": 0.0,
                              "mur_depuis": None, "recolte_kg": 0.0, "perdu_kg": 0.0, "evenement_recolte": None}
                   for ch in region["champs"]},
        "transit": [],
        "droits": [],
        "episodes": {},
        "humains": h,
        "foyers": f,
    }
