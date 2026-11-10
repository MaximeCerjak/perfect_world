"""Vues de lecture du monde : carte, communes, fiches, journaux, biens et comparaison.

Chaque méthode retourne un dictionnaire sérialisable. L'API HTTP et l'export
de démonstration appellent les mêmes méthodes : les deux servent les mêmes vues.
"""
from __future__ import annotations

import json

from . import monde as mondes
from . import moteur, parametres, recit
from .entrees import hacher_code
from .population import TYPES_FOYER
from .stockage import Base

CLES_COMMUNE = ("jours_reserve", "ration", "pompe_etat", "irrigation_satisfaction", "eau_domestique_couverture",
                "non_servi_depot_kg", "non_couvert_kg", "secours_kg", "entretien_reporte_h", "arriere_h",
                "heures_tournee_secours", "heures_livraison", "heures_trajet_foyers", "temps_libre_moyen_h",
                "stock_kg", "demande_depot_kg", "servi_depot_kg", "secours_h_pretees")
CLES_REGION = ("debit_m3", "pluie_mm", "reserve_m3", "depot_kg", "secours_kg", "depot_demande_kg", "depot_servi_kg",
               "depot_passage_commun_kg", "part_reservee", "energie_reste_kwh", "energie_budget_kwh", "population")
ETAPES = ((6, "petite enfance"), (16, "école"), (65, "vie active"), (75, "travail allégé"), (200, "grand âge"))


def _arrondi(x):
    return round(x, 3) if isinstance(x, float) else x


class Service:
    """Lit un ou plusieurs mondes dans la base et construit les vues du site."""

    def __init__(self, db: Base) -> None:
        self.db = db
        self._cache: dict[str, dict] = {}

    # ------------------------------------------------------------------ chargement
    def _monde(self, monde: str) -> dict:
        jour = self.db.lire_un("SELECT jour FROM mondes WHERE id = ?", (monde,))
        if jour is None:
            raise KeyError(f"monde inconnu : {monde}")
        c = self._cache.get(monde)
        if not c or c["jour"] != jour[0]:
            c = mondes.charger(self.db, monde)
            ctx = moteur.Contexte(c["scenario"], c["serie"], c["graine"])
            ctx.recalculer(c["etat"], c["jour"])
            c["ctx"] = ctx
            c["rattaches"] = {h for (h,) in self.db.lire("SELECT humain FROM rattachements WHERE monde = ?", (monde,))}
            self._cache[monde] = c
        return c

    def _noms(self, c: dict) -> dict:
        region, h, f = c["scenario"]["region"], c["etat"]["humains"], c["etat"]["foyers"]
        lieux = {x["id"]: x["nom"] for x in region["communes"]}
        lieux["region"] = "la région"
        return {"lieu": lambda i: lieux.get(i, i), "bien": lambda i: region["biens"][i]["nom"],
                "humain": lambda i: f"{h['prenom'][i]} {f['nom'][h['foyer'][i]]}", "foyer": lambda i: f["nom"][i]}

    def _evenements(self, c: dict, where: str, params: tuple, limite: int | None = None) -> list[dict]:
        sql = ("SELECT id, jour, lieu, type, foyer, humain, humain2, data FROM evenements WHERE monde = ? AND "
               + where + " ORDER BY id")
        noms, jz = self._noms(c), c["scenario"]["region"]["jour_zero"]
        sortie = []
        for eid, jour, lieu, type_, foyer, humain, humain2, data in self.db.lire(sql, (c["id"],) + params):
            d = json.loads(data)
            e = {"id": eid, "jour": jour, "date": recit.date(jour, jz), "lieu": lieu, "lieu_nom": noms["lieu"](lieu),
                 "type": type_, "foyer": foyer, "humain": humain, "humain2": humain2, "mesure": d["mesure"],
                 "causes": d["causes"]}
            e["titre"], e["texte"] = recit.decrire(e, noms)
            sortie.append(e)
        return sortie[-limite:] if limite else sortie

    # ------------------------------------------------------------------ mondes et carte
    def mondes(self) -> dict:
        """Liste des mondes, avec leur jour courant."""
        jeux = parametres.charger_cas()["cas"]
        return {"mondes": [dict(m, description=jeux.get(m["cas"], {}).get("description")) for m in mondes.lister(self.db)]}

    def region(self, monde: str) -> dict:
        """Carte régionale : communes, routes, rivière, biens et champs."""
        c = self._monde(monde)
        region, ctx, etat = c["scenario"]["region"], c["ctx"], c["etat"]
        jz = region["jour_zero"]
        return {
            "monde": {"id": c["id"], "nom": c["nom"], "cas": c["cas"], "jour": c["jour"], "jours_max": c["jours_max"],
                      "population": sum(ctx.pop), "date": recit.date(c["jour"], jz), "jour_zero": jz,
                      "mode_inscription": c["mode_inscription"], "participants": len(c["rattaches"])},
            "communes": [{"id": x["id"], "nom": x["nom"], "role": x["role"], "carte": x["carte"],
                          "population": ctx.pop[i], "foyers": len(ctx.foyers_de[i])}
                         for i, x in enumerate(region["communes"])],
            "ordre_eau": region["ordre_eau"],
            "routes": [{k: r[k] for k in ("id", "nom", "de", "vers", "duree_h", "capacite_kg_jour")} for r in region["routes"]],
            "biens": [{"id": k, "nom": b["nom"], "type": b["type"], "commune": b["commune"]} for k, b in region["biens"].items()],
            "champs": [{k: ch[k] for k in ("id", "nom", "commune", "culture", "surface_ha", "plantation_jour", "maturite_jour")}
                       for ch in region["champs"]],
            "episodes": region["meteo"]["episodes"],
            "droits": etat["droits"],
        }

    def chronologie(self, monde: str) -> dict:
        """Mesures jour par jour, pour faire défiler le temps sur la carte et tracer les courbes."""
        c = self._monde(monde)
        ids = c["ctx"].ids
        communes = {cid: {k: [] for k in CLES_COMMUNE} for cid in ids}
        region = {k: [] for k in CLES_REGION}
        champs: dict[str, dict] = {}
        jz = c["scenario"]["region"]["jour_zero"]
        saisons = []
        dernier = 0
        for jour, lieu, data in self.db.lire("SELECT jour, lieu, data FROM mesures WHERE monde = ? ORDER BY jour", (monde,)):
            d = json.loads(data)
            if lieu == "region":
                for k in CLES_REGION:
                    region[k].append(_arrondi(d[k]))
                for fid, ch in d["champs"].items():
                    s = champs.setdefault(fid, {"phase": [], "avancement": [], "eau": []})
                    s["phase"].append({"croissance": 1, "recolte": 2, "repos": 0}[ch["phase"]])
                    s["avancement"].append(round(ch["avancement"], 2))
                    s["eau"].append(round(ch["eau"], 2))
                if jour != dernier:
                    saisons.append(recit.saison(jour, jz))
                    dernier = jour
            else:
                for k in CLES_COMMUNE:
                    communes[lieu][k].append(_arrondi(d.get(k, 0.0)))
        return {"jours": len(region["debit_m3"]), "communes": communes, "region": region, "champs": champs,
                "saisons": saisons, "dates": [recit.date(j, jz) for j in range(1, len(saisons) + 1)]}

    def evenements_lieu(self, monde: str, lieu: str) -> dict:
        """Faits publics d'une commune (ou de la région), routine regroupée."""
        c = self._monde(monde)
        liste = self._evenements(c, "lieu = ? AND foyer IS NULL", (lieu,))
        for e in liste:
            e["journal"] = e["type"] in recit.POUR_JOURNAL
            e["partout"] = e["type"] in recit.PARTOUT
        return {"lieu": lieu, "evenements": recit.regrouper(liste)}

    # ------------------------------------------------------------------ humains
    def _fiche_courte(self, c: dict, hi: int) -> dict:
        h, f, hyp = c["etat"]["humains"], c["etat"]["foyers"], c["scenario"]["hypotheses"]
        fi = h["foyer"][hi]
        age = (c["jour"] - h["naissance"][hi]) // 365
        etape = next(nom for limite, nom in ETAPES if age < limite)
        metier = h["metier"][hi] if 16 <= age < 75 else 0
        return {"id": hi, "prenom": h["prenom"][hi], "nom": f["nom"][fi], "age": age, "etape": etape,
                "metier": metier, "metier_nom": recit.METIERS[metier], "foyer": fi, "ilot": f["ilot"][fi],
                "commune": c["ctx"].ids[f["commune"][fi]], "vivant": bool(h["vivant"][hi]),
                "suivi": hi in c["rattaches"]}

    def humains(self, monde: str, commune: str | None = None, q: str | None = None, limite: int = 60) -> dict:
        """Habitants d'une commune (ou recherche par nom), en commençant par ceux qui sont suivis."""
        c = self._monde(monde)
        h, f, ctx = c["etat"]["humains"], c["etat"]["foyers"], c["ctx"]
        ci = ctx.index.get(commune) if commune else None
        q = (q or "").strip().lower()
        trouves = []
        for hi in range(len(h["prenom"])):
            if not h["vivant"][hi]:
                continue
            fi = h["foyer"][hi]
            if ci is not None and f["commune"][fi] != ci:
                continue
            if q and q not in f"{h['prenom'][hi]} {f['nom'][fi]}".lower():
                continue
            trouves.append(hi)
        total = len(trouves)
        trouves.sort(key=lambda hi: (hi not in c["rattaches"], (hi * 2654435761) % 4294967296))
        return {"total": total, "humains": [self._fiche_courte(c, hi) for hi in trouves[:limite]]}

    def humain(self, monde: str, hi: int) -> dict:
        """Fiche d'un humain : foyer, activité, liens, journée type et faits marquants personnels."""
        c = self._monde(monde)
        h, f, ctx, hyp = c["etat"]["humains"], c["etat"]["foyers"], c["ctx"], c["scenario"]["hypotheses"]
        if not 0 <= hi < len(h["prenom"]):
            raise KeyError("humain inconnu")
        fiche = self._fiche_courte(c, hi)
        fi = fiche["foyer"]
        age, adultes = fiche["age"], max(1, ctx.f_adultes[fi])
        ess = hyp["temps.heures_essentielles"]
        if age < 6:
            journee = {"essentiel": ess, "soins_recus": hyp["temps.soin_petit_enfant_h"], "libre": 24 - ess - hyp["temps.soin_petit_enfant_h"]}
        elif age < 16:
            journee = {"essentiel": ess, "etude": hyp["temps.etude_h"], "libre": 24 - ess - hyp["temps.etude_h"]}
        else:
            travail = (hyp["temps.travail_actif_h"] if age < 65 else hyp["temps.travail_aine_h"] if age < 75 else 0.0) \
                if fiche["metier"] else 0.0
            travail *= ctx.f_facteur[fi]
            soin = ctx.f_soin[fi] / adultes
            ravit = hyp["temps.ravitaillement_courant_h"] / adultes
            libre = 24 - ess - travail - soin - ravit
            if libre < 0:  # les soins dépassent le temps de cette personne : le reste du foyer les porte
                soin, libre = soin + libre, 0.0
            journee = {"essentiel": ess, "travail": round(travail, 2), "soins_au_foyer": round(soin, 2),
                       "ravitaillement": round(ravit, 2), "libre": round(libre, 2)}
        fiche.update(
            journee=journee,
            foyer_detail={"id": fi, "nom": f["nom"][fi], "type": TYPES_FOYER[ctx.f_type[fi]],
                          "membres": [self._fiche_courte(c, x) for x in f["membres"][fi]],
                          "trajets": f["trajets"][fi], "heures_trajet": round(f["heures_trajet"][fi], 1),
                          "non_couvert_kg": round(f["non_couvert_kg"][fi], 1),
                          "garde_manger_kg": round(f["garde_manger"][fi], 1)},
            liens=[self._fiche_courte(c, x) for x in h["liens"][hi]],
            journal=recit.regrouper(self._evenements(c, "(humain = ? OR humain2 = ? OR foyer = ?)", (hi, hi, fi))))
        return fiche

    def moi(self, code: str) -> dict:
        """Espace personnel : retrouve le participant, son humain et le jour de sa dernière visite."""
        ligne = self.db.lire_un("SELECT monde, id, pseudo, statut, derniere_visite_jour FROM participants "
                                "WHERE code_hash = ?", (hacher_code(code),))
        if not ligne:
            raise PermissionError("code d'accès inconnu")
        monde, pid, pseudo, statut, derniere = ligne
        humain = self.db.lire_un("SELECT humain FROM rattachements WHERE monde = ? AND participant = ?", (monde, pid))
        jour = self.db.lire_un("SELECT jour FROM mondes WHERE id = ?", (monde,))[0]
        with self.db.transaction():
            self.db.executer("UPDATE participants SET derniere_visite_jour = ? WHERE monde = ? AND id = ?", (jour, monde, pid))
        return {"monde": monde, "participant": pid, "pseudo": pseudo, "statut": statut,
                "humain": humain[0] if humain else None, "derniere_visite_jour": derniere, "jour": jour}

    # ------------------------------------------------------------------ biens et causes
    def bien(self, monde: str, bien: str) -> dict:
        """Fiche d'un bien : usage, état, conditions d'accès et changements datés."""
        c = self._monde(monde)
        region, etat = c["scenario"]["region"], c["etat"]
        if bien not in region["biens"]:
            raise KeyError("bien inconnu")
        b = dict(region["biens"][bien], id=bien)
        reservee, comptes = moteur.part_reservee(etat, bien, c["jour"])
        droits = [d for d in etat["droits"] if d["bien"] == bien]
        fiche = {"bien": b, "commune_nom": self._noms(c)["lieu"](b["commune"]), "droits": droits,
                 "part_reservee": reservee, "comptes": comptes,
                 "acces": "commun" if reservee == 0 else "en partie réservé",
                 "changements": recit.regrouper(self._evenements(
                     c, "(type LIKE ? OR type LIKE ?)",
                     ("droit.%", "depot.%") if bien == "depot" else ("secours.%", "secours.%")
                     if bien == "secours" else ("aucun", "aucun")))}
        if "capacite_passage_kg_jour" in b:
            passage = b["capacite_passage_kg_jour"]
            fiche["passage"] = {"capacite_kg_jour": passage, "commun_kg_jour": passage * (1 - reservee)}
            if bien == "depot":
                lignes = self.db.lire("SELECT data FROM mesures WHERE monde = ? AND lieu = 'region' AND jour > ? ORDER BY jour",
                                      (monde, c["jour"] - 30))
                demandes = [json.loads(d)["depot_demande_kg"] for (d,) in lignes]
                servis = [json.loads(d)["depot_servi_kg"] for (d,) in lignes]
                demande = sum(servis) / len(servis) if servis else 0.0
                fiche["usage"] = {"servi_moyen_kg_jour": demande,
                                  "demande_moyenne_kg_jour": sum(demandes) / len(demandes) if demandes else 0.0}
                libre = 1 - sum(d["part"] for d in droits if d["annule_jour"] is None)
                fiche["offre"] = {
                    "disponible": libre > 1e-9, "part_proposee": min(0.4, libre),
                    "droit": "Droit sur une part de la capacité de passage de l'entrepôt. Le titulaire peut la laisser "
                             "en accès commun ou la réserver à certains usages.",
                    "effet_si_reserve": {"commun_kg_jour": passage * (1 - reservee - min(0.4, libre)),
                                         "servi_moyen_kg_jour": demande,
                                         "a_couvrir_ailleurs_kg_jour": max(0.0, demande - passage * (1 - reservee - min(0.4, libre)))},
                    "note": "Phase 2. Pendant le prototype, des événements de test déclenchent les mêmes changements "
                            "de droits qu'un achat confirmé."}
        if bien == "depot":
            fiche["stock_kg"] = etat["depot_kg"]
        elif bien == "secours":
            fiche["stock_kg"] = etat["secours_kg"]
        elif bien == "reserve_eau":
            fiche["volume_m3"] = etat["reserve_m3"]
        return fiche

    def evenement(self, monde: str, eid: str) -> dict:
        """Un événement, la chaîne de ses causes et les faits qui le citent comme cause."""
        c = self._monde(monde)
        vus: dict[str, dict] = {}

        def charger(i: str, profondeur: int):
            if i in vus or profondeur > 8:
                return
            trouve = self._evenements(c, "id = ?", (i,))
            if not trouve:
                return
            vus[i] = trouve[0]
            for cause in trouve[0]["causes"]:
                charger(cause, profondeur + 1)

        charger(eid, 0)
        if eid not in vus:
            raise KeyError("événement inconnu")
        suites = self._evenements(c, "data LIKE ?", (f'%"{eid}"%',), limite=40)
        return {"evenement": vus[eid], "causes": {i: e for i, e in vus.items() if i != eid},
                "consequences": recit.regrouper(suites)}

    # ------------------------------------------------------------------ observation et comparaison
    def observation(self, monde: str) -> dict:
        """Tableau d'observation : répartition par commune et par type de foyer, foyers les plus touchés."""
        c = self._monde(monde)
        ctx, f = c["ctx"], c["etat"]["foyers"]
        jours = max(1, c["jour"])
        groupes: dict[tuple, dict] = {}
        foyers = []
        for ci, cid in enumerate(ctx.ids):
            for fi in ctx.foyers_de[ci]:
                adultes = ctx.f_adultes[fi]
                libre = ctx.f_libre[fi] / adultes if adultes else 0.0
                perdu = (f["heures_trajet"][fi] - f["travail_perdu_h"][fi]) / jours / max(1, adultes)
                couverture = 1 - f["non_couvert_kg"][fi] / (ctx.f_besoin[fi] * jours) if ctx.f_besoin[fi] else 1.0
                g = groupes.setdefault((cid, ctx.f_type[fi]), {"foyers": 0, "personnes": 0, "libre": 0.0, "couverture": 0.0,
                                                               "heures_trajet": 0.0, "non_couvert_kg": 0.0})
                g["foyers"] += 1
                g["personnes"] += ctx.f_n[fi]
                g["libre"] += libre - perdu
                g["couverture"] += couverture
                g["heures_trajet"] += f["heures_trajet"][fi]
                g["non_couvert_kg"] += f["non_couvert_kg"][fi]
                foyers.append((f["non_couvert_kg"][fi], f["heures_trajet"][fi], -(libre - perdu), fi, cid, libre - perdu, couverture))
        repartition = [{"commune": cid, "type": TYPES_FOYER[t], "foyers": g["foyers"], "personnes": g["personnes"],
                        "temps_libre_h": round(g["libre"] / g["foyers"], 2),
                        "couverture_besoins": round(g["couverture"] / g["foyers"], 4),
                        "heures_trajet": round(g["heures_trajet"], 1), "non_couvert_kg": round(g["non_couvert_kg"], 1)}
                       for (cid, t), g in sorted(groupes.items())]
        foyers.sort(reverse=True)
        touches = [{"foyer": fi, "nom": f["nom"][fi], "commune": cid, "type": TYPES_FOYER[ctx.f_type[fi]],
                    "personnes": ctx.f_n[fi], "non_couvert_kg": round(nc, 1), "heures_trajet": round(ht, 1),
                    "temps_libre_h": round(libre, 2), "couverture_besoins": round(couv, 4),
                    "humain": f["membres"][fi][0]} for nc, ht, _, fi, cid, libre, couv in foyers[:12]]
        return {"jour": c["jour"], "repartition": repartition, "plus_touches": touches}

    def bilan(self, monde: str) -> dict:
        """Bilan d'un monde : totaux par commune et pour la région, sur toute la période simulée."""
        c = self._monde(monde)
        ids = c["ctx"].ids
        somme = ("non_couvert_kg", "non_servi_depot_kg", "secours_kg", "entretien_reporte_h", "heures_livraison",
                 "heures_tournee_secours", "heures_trajet_foyers", "secours_h_pretees", "recolte_kg")
        communes = {cid: dict({k: 0.0 for k in somme}, jours_reserve_min=1e9, jours_reserve_moy=0.0, jours_ration_reduite=0,
                              temps_libre_moyen_h=0.0) for cid in ids}
        region = {"jours": 0, "jours_limites_par_droits": 0, "part_reservee_max": 0.0, "concentration_max": 0.0,
                  "depot_fin_kg": 0.0, "secours_fin_kg": 0.0, "depot_non_servi_kg": 0.0}
        for jour, lieu, data in self.db.lire("SELECT jour, lieu, data FROM mesures WHERE monde = ? ORDER BY jour", (monde,)):
            d = json.loads(data)
            if lieu == "region":
                region["jours"] += 1
                region["jours_limites_par_droits"] += 1 if d["limite_par_droits"] else 0
                region["part_reservee_max"] = max(region["part_reservee_max"], d["part_reservee"])
                region["concentration_max"] = max([region["concentration_max"]] + list(d["comptes"].values()))
                region["depot_fin_kg"], region["secours_fin_kg"] = d["depot_kg"], d["secours_kg"]
                region["depot_non_servi_kg"] += d["depot_non_servi_kg"]
            else:
                x = communes[lieu]
                for k in somme:
                    x[k] += d.get(k, 0.0)
                x["jours_reserve_min"] = min(x["jours_reserve_min"], d["jours_reserve"])
                x["jours_reserve_moy"] += d["jours_reserve"]
                x["jours_ration_reduite"] += 1 if d["ration"] < 1 - 1e-6 else 0
                x["temps_libre_moyen_h"] += d["temps_libre_moyen_h"]
                x["pompe_etat_fin"], x["arriere_fin_h"] = d["pompe_etat"], d["arriere_h"]
        n = max(1, region["jours"])
        for x in communes.values():
            x["jours_reserve_moy"] /= n
            x["temps_libre_moyen_h"] /= n
            for k, v in x.items():
                x[k] = _arrondi(v)
        obs = self.observation(monde)
        types = [(e["type"], e["lieu"]) for e in self._evenements(c, "foyer IS NULL", ())]
        return {"monde": monde, "nom": c["nom"], "cas": c["cas"], "communes": communes,
                "region": {k: _arrondi(v) for k, v in region.items()}, "plus_touches": obs["plus_touches"][:5],
                "types_evenements": sorted(set(types))}

    def comparaison(self, ids: list[str]) -> dict:
        """Compare plusieurs trajectoires d'une même année ; le premier monde sert de référence."""
        bilans = [self.bilan(m) for m in ids]
        ref = bilans[0]
        ecarts = []
        for b in bilans[1:]:
            c = self._monde(b["monde"])
            nouveaux = sorted(set(map(tuple, b["types_evenements"])) - set(map(tuple, ref["types_evenements"])))
            premiers = []
            for type_, lieu in nouveaux:
                e = self._evenements(c, "type = ? AND lieu = ? AND foyer IS NULL", (type_, lieu))
                if e:
                    premiers.append(dict(e[0], occurrences=len(e)))
            premiers.sort(key=lambda e: e["id"])
            mesures = []
            for cid, x in b["communes"].items():
                for k, v in x.items():
                    r = ref["communes"][cid][k]
                    if isinstance(v, (int, float)) and abs(v - r) > 1e-6 * max(1.0, abs(r)):
                        mesures.append({"commune": cid, "mesure": k, "reference": r, "valeur": v})
            ecarts.append({"monde": b["monde"], "reference": ref["monde"], "identique": not mesures and not [
                k for k, v in b["region"].items() if k not in ("part_reservee_max", "concentration_max")
                and abs(v - ref["region"][k]) > 1e-6 * max(1.0, abs(ref["region"][k]))],
                "mesures": mesures, "evenements_nouveaux": premiers})
        for b in bilans:
            del b["types_evenements"]
        return {"mondes": bilans, "ecarts": ecarts}

    def hypotheses(self) -> dict:
        """Hypothèses du prototype, avec unité, nature, effet attendu et plage à tester."""
        return {"hypotheses": parametres.charger_fiches_hypotheses()}
