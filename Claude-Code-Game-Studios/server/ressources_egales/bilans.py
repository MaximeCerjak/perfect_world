"""Bilans de conservation et contrôles de capacité d'une journée.

Un stock ne change que par des mouvements enregistrés : chaque sortie est un
usage, une perte ou un transfert. Ces contrôles tournent à chaque journée.
"""
from __future__ import annotations

TOLERANCE = 1e-6


def stocks(etat: dict) -> dict[str, float]:
    """Stocks physiques de l'état, par compte du registre."""
    s = {"depot": etat["depot_kg"], "secours": etat["secours_kg"], "reserve": etat["reserve_m3"],
         "transit": sum(t["kg"] for t in etat["transit"])}
    for cid, c in etat["communes"].items():
        s[f"grenier:{cid}"] = c["stock_kg"]
        s[f"foyers:{cid}"] = c.get("garde_manger_kg", 0.0)
    return s


def verifier_jour(avant: dict[str, float], apres: dict[str, float], resultat: dict, ctx) -> list[str]:
    """Retourne les écarts de la journée ; une liste vide signifie que tout est équilibré."""
    ecarts = []
    variation = {k: 0.0 for k in apres}
    riviere = 0.0
    for (ressource, de, vers, _nature), q in resultat["mouvements"].items():
        if q < 0:
            ecarts.append(f"mouvement négatif {de}->{vers}")
        if de in variation:
            variation[de] -= q
        if vers in variation:
            variation[vers] += q
        riviere += q if vers == "riviere" else -q if de == "riviere" else 0.0
    for compte, valeur in apres.items():
        attendu = avant.get(compte, 0.0) + variation[compte]
        if abs(attendu - valeur) > TOLERANCE * max(1.0, abs(valeur)):
            ecarts.append(f"stock {compte}: attendu {attendu:.6f}, trouvé {valeur:.6f}")
        if valeur < -TOLERANCE:
            ecarts.append(f"stock négatif {compte}: {valeur}")
    if abs(riviere) > TOLERANCE * 1000:
        ecarts.append(f"rivière non équilibrée: {riviere}")
    m = resultat["mesures"]
    region = ctx.region
    for c in region["communes"]:
        mc = m[c["id"]]
        if mc["stock_kg"] > c["grenier"]["capacite_kg"] * (1 + TOLERANCE) + mc.get("en_transit_kg", 0) + 1e-3 and mc.get("recolte_kg"):
            ecarts.append(f"grenier {c['id']} au-delà de sa capacité")
        for cle in ("marge_technique_h", "marge_agricole_h"):
            if mc[cle] < -TOLERANCE:
                ecarts.append(f"budget horaire dépassé {c['id']} {cle}: {mc[cle]}")
        if mc["eau_domestique_m3"] + mc["irrigation_m3"] > mc["pompe_capacite_m3"] + TOLERANCE:
            ecarts.append(f"pompe {c['id']} au-delà de sa capacité")
    r = m["region"]
    if r["depot_servi_kg"] > r["depot_passage_commun_kg"] + TOLERANCE:
        ecarts.append("sorties de l'entrepôt au-delà de la capacité commune")
    if r["energie_reste_kwh"] < -TOLERANCE:
        ecarts.append("budget d'énergie dépassé")
    if r["depot_kg"] > region["biens"]["depot"]["capacite_stockage_kg"] * (1 + TOLERANCE):
        ecarts.append("entrepôt au-delà de sa capacité de stockage")
    return ecarts
