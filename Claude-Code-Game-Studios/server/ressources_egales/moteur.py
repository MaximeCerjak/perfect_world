"""Calcul d'une journée simulée.

`avancer_jour` applique, dans l'ordre du dossier de cadrage :

1. les événements datés, la météo, l'eau et les équipements ;
2. les besoins et l'affectation des heures, de l'eau et de l'énergie ;
3. la production, les transferts et la répartition selon les droits d'accès ;
4. les usages, les pertes, les travaux et l'état du lendemain.

La fonction ne lit ni horloge ni base de données : mêmes entrées, mêmes sorties.
Chaque sortie de stock passe par le registre des mouvements (`Registre`), qui
sert ensuite aux bilans de conservation.
"""
from __future__ import annotations

import math
import random

from . import vie
from .parametres import AGRICULTURE, SERVICES, TECHNIQUE

EPS = 1e-9
JOURS_FIN_EPISODE = 3


class Registre:
    """Mouvements d'une journée, agrégés par (ressource, origine, destination, nature)."""

    def __init__(self) -> None:
        self.lignes: dict[tuple[str, str, str, str], float] = {}

    def mv(self, ressource: str, de: str, vers: str, nature: str, quantite: float) -> None:
        """Enregistre un mouvement positif ; les quantités nulles sont ignorées."""
        if quantite <= EPS:
            return
        cle = (ressource, de, vers, nature)
        self.lignes[cle] = self.lignes.get(cle, 0.0) + quantite


class Contexte:
    """Données dérivées du scénario et de l'état, recalculées à la demande.

    Le contexte ne porte aucune information absente de l'état : le reconstruire
    après une reprise donne les mêmes valeurs qu'une exécution continue.
    """

    def __init__(self, scenario: dict, serie: dict, graine: int) -> None:
        self.scenario, self.serie, self.graine = scenario, serie, graine
        self.hyp = scenario["hypotheses"]
        region = scenario["region"]
        self.region = region
        self.communes = region["communes"]
        self.ids = [c["id"] for c in self.communes]
        self.index = {cid: i for i, cid in enumerate(self.ids)}
        self.routes = {r["vers"]: r for r in region["routes"]}
        self.champs = region["champs"]
        self.biens = region["biens"]
        self.debit_reference = region["meteo"]["debit_m3_jour"]["moyen"]
        self.jour_calcul = None
        self.sale = True

    def duree_vers_rives(self, cid: str) -> float:
        """Durée d'un aller entre `cid` et Les Rives, par Le Bourg."""
        d = self.routes["rives"]["duree_h"]
        return d if cid == "bourg" else d + self.routes[cid]["duree_h"]

    def recalculer(self, etat: dict, jour: int) -> None:
        """Recalcule foyers, besoins et offres de travail pour `jour`."""
        hyp, h, f = self.hyp, etat["humains"], etat["foyers"]
        jour_ref = jour - jour % 7  # l'apprentissage est relu une fois par semaine
        n_c = len(self.ids)
        besoin_kg = hyp["alimentation.besoin_kg_personne_jour"]
        ess, t_actif, t_aine = hyp["temps.heures_essentielles"], hyp["temps.travail_actif_h"], hyp["temps.travail_aine_h"]
        s_petit, s_enfant, s_aine = hyp["temps.soin_petit_enfant_h"], hyp["temps.soin_enfant_h"], hyp["temps.soin_grand_aine_h"]
        ravit, deb, appr = hyp["temps.ravitaillement_courant_h"], hyp["temps.efficacite_debutant"], hyp["temps.apprentissage_jours"]
        self.pop = [0] * n_c
        self.offre = [[0.0, 0.0, 0.0, 0.0] for _ in range(n_c)]
        self.foyers_de = [[] for _ in range(n_c)]
        nf = len(f["commune"])
        self.f_n = [0] * nf
        self.f_besoin = [0.0] * nf
        self.f_voyageur = [-1] * nf
        self.f_travail_voyageur = [0.0] * nf
        self.f_libre = [0.0] * nf
        self.f_adultes = [0] * nf
        self.f_soin = [0.0] * nf
        self.f_facteur = [1.0] * nf
        self.f_type = [0] * nf
        naissance, metier, debut = h["naissance"], h["metier"], h["debut_metier"]
        for fi in range(nf):
            membres = f["membres"][fi]
            if not membres:
                continue
            ci = f["commune"][fi]
            soin, travail, dispo, adultes, enfants, aines = 0.0, [], 0.0, 0, 0, 0
            for hi in membres:
                age = (jour - naissance[hi]) // 365
                if age < 6:
                    soin += s_petit
                    enfants += 1
                elif age < 16:
                    soin += s_enfant
                    enfants += 1
                else:
                    adultes += 1
                    dispo += 24 - ess
                    if age >= 80:
                        soin += s_aine
                    if age >= 65:
                        aines += 1
                    heures = t_actif if age < 65 else (t_aine if age < 75 else 0.0)
                    if heures > 0 and metier[hi]:
                        travail.append((hi, heures))
            # Les soins et le ravitaillement passent avant le travail quand le temps manque.
            voulu = sum(t for _, t in travail)
            facteur = 1.0
            if voulu > 0 and voulu + soin + ravit > dispo:
                facteur = max(0.0, (dispo - soin - ravit) / voulu)
            for hi, heures in travail:
                anciennete = max(0, jour_ref - debut[hi])
                eff = deb + (1 - deb) * (1 - math.exp(-anciennete / appr))
                self.offre[ci][metier[hi]] += heures * facteur * eff
            n = len(membres)
            self.pop[ci] += n
            self.foyers_de[ci].append(fi)
            self.f_n[fi] = n
            self.f_besoin[fi] = n * besoin_kg
            self.f_adultes[fi] = adultes
            self.f_soin[fi] = soin
            self.f_facteur[fi] = facteur
            self.f_libre[fi] = max(0.0, dispo - voulu * facteur - soin - ravit)
            if travail:
                self.f_voyageur[fi] = travail[0][0]
                self.f_travail_voyageur[fi] = travail[0][1] * facteur
            else:
                self.f_voyageur[fi] = next((hi for hi in membres if 16 <= (jour - naissance[hi]) // 365 < 80), -1)
            if aines and aines == adultes and not enfants:
                self.f_type[fi] = 4
            elif n == 1:
                self.f_type[fi] = 0
            elif enfants and adultes == 1:
                self.f_type[fi] = 3
            elif enfants:
                self.f_type[fi] = 2
            else:
                self.f_type[fi] = 1
        self.besoin = [p * besoin_kg for p in self.pop]
        self.anniversaires: dict[int, list[int]] = {}
        for hi, n in enumerate(naissance):
            if h["vivant"][hi]:
                self.anniversaires.setdefault(n % 365, []).append(hi)
        self.jour_calcul = jour
        self.sale = False


def part_reservee(etat: dict, bien: str, jour: int) -> tuple[float, dict]:
    """Part de la capacité de `bien` retirée de l'accès commun ce jour-là.

    Retourne aussi la part de capacité dont l'accès dépend de chaque compte,
    que cette part soit ouverte ou réservée.
    """
    reservee, comptes = 0.0, {}
    for d in etat["droits"]:
        if d["bien"] != bien or d["debut"] > jour or d.get("annule_jour") is not None:
            continue
        if d["fin"] is not None and jour > d["fin"]:
            continue
        comptes[d["compte"]] = comptes.get(d["compte"], 0.0) + d["part"]
        if d["acces"] == "reserve":
            reservee += d["part"]
    return min(1.0, reservee), comptes


def avancer_jour(etat: dict, ctx: Contexte, entrees: list[dict]) -> dict:
    """Fait avancer `etat` d'une journée et retourne mouvements, événements et mesures.

    `entrees` contient les événements externes validés dont le jour d'effet est
    le jour calculé (achats de test, annulations, naissances d'inscription).
    `etat` est modifié en place.
    """
    hyp, region = ctx.hyp, ctx.region
    j = etat["jour"] + 1
    reg = Registre()
    evenements: list[dict] = []
    rattachements: list[tuple[str, int]] = []
    episodes = etat["episodes"]
    derniers = etat.setdefault("derniers", {})

    def evt(type_: str, lieu: str, mesure: dict | None = None, causes: list | None = None,
            foyer: int | None = None, humain: int | None = None, humain2: int | None = None) -> str:
        etat["seq"] += 1
        eid = f"E{j:04d}-{len(evenements) + 1:04d}"
        evenements.append({"id": eid, "jour": j, "lieu": lieu, "type": type_, "mesure": mesure or {},
                           "causes": [c for c in dict.fromkeys(causes or []) if c],
                           "foyer": foyer, "humain": humain, "humain2": humain2})
        return eid

    def episode(cle: str, actif: bool, creer=None, fin=None) -> str | None:
        """Ouvre, prolonge ou ferme un épisode ; retourne l'événement qui l'a ouvert."""
        ep = episodes.get(cle)
        if actif:
            if ep:
                ep["off"] = 0
                return ep["id"]
            eid = creer() if creer else None
            episodes[cle] = {"id": eid, "debut": j, "off": 0}
            return eid
        if ep:
            ep["off"] += 1
            if ep["off"] >= JOURS_FIN_EPISODE:
                del episodes[cle]
                if fin:
                    fin(ep)
        return None

    def ep_id(cle: str) -> str | None:
        ep = episodes.get(cle)
        return ep["id"] if ep else None

    # ------------------------------------------------------------------ 1. Événements datés
    for e in entrees:
        if e["type"] == "achat.confirme":
            droit = {"id": f"D-{e['cle']}", "cle": e["cle"], "compte": e["compte"], "bien": e["bien"],
                     "part": e["part"], "acces": e.get("acces", "commun"), "usage": e.get("usage"),
                     "debut": j, "fin": (j + e["duree_jours"] - 1) if e.get("duree_jours") else None,
                     "annule_jour": None}
            if any(d["cle"] == e["cle"] for d in etat["droits"]):
                continue
            etat["droits"].append(droit)
            derniers["droit:" + e["bien"]] = evt(
                "droit.acquis", ctx.biens[e["bien"]]["commune"],
                {"bien": e["bien"], "compte": e["compte"], "part": e["part"], "acces": droit["acces"],
                 "usage": droit["usage"], "fin": droit["fin"]})
        elif e["type"] == "achat.annule":
            for d in etat["droits"]:
                if d["cle"] == e["reference"] and d["annule_jour"] is None:
                    d["annule_jour"] = j
                    derniers["droit:" + d["bien"]] = evt(
                        "droit.annule", ctx.biens[d["bien"]]["commune"],
                        {"bien": d["bien"], "compte": d["compte"], "part": d["part"], "acces": d["acces"]},
                        [derniers.get("droit:" + d["bien"])])
        elif e["type"] == "acces.modifie":
            for d in etat["droits"]:
                if d["cle"] == e["reference"] and d["annule_jour"] is None and d["acces"] != e["acces"]:
                    d["acces"], d["usage"] = e["acces"], e.get("usage")
                    derniers["droit:" + d["bien"]] = evt(
                        "droit.acces_modifie", ctx.biens[d["bien"]]["commune"],
                        {"bien": d["bien"], "compte": d["compte"], "part": d["part"], "acces": d["acces"],
                         "usage": d["usage"]}, [derniers.get("droit:" + d["bien"])])

    # Fin des droits à durée limitée.
    for d in etat["droits"]:
        if d["fin"] is not None and d["fin"] == j - 1 and d["annule_jour"] is None:
            derniers["droit:" + d["bien"]] = evt(
                "droit.expire", ctx.biens[d["bien"]]["commune"],
                {"bien": d["bien"], "compte": d["compte"], "part": d["part"]}, [derniers.get("droit:" + d["bien"])])

    # Arrivées des marchandises en transit.
    restant = []
    for t in etat["transit"]:
        if t["arrivee"] <= j:
            reg.mv("denrees", "transit", t["vers"], "livraison", t["kg"])
            if t["vers"] == "depot":
                etat["depot_kg"] += t["kg"]
            else:
                etat["communes"][t["vers"].split(":")[1]]["stock_kg"] += t["kg"]
        else:
            restant.append(t)
    etat["transit"] = restant

    # Vies : anniversaires, naissances, décès, liens, changements d'activité.
    if ctx.jour_calcul is None:
        ctx.recalculer(etat, j - 1)
    vie.appliquer(etat, ctx, j, entrees, evt, rattachements)
    if ctx.sale or j % 7 == 0:
        ctx.recalculer(etat, j)

    # Météo et épisodes datés.
    debit, pluie = ctx.serie["debit_m3"][j], ctx.serie["pluie_mm"][j]
    for ep in region["meteo"]["episodes"]:
        if j == ep["debut_jour"]:
            episodes[ep["type"]] = {"id": evt("meteo.secheresse_debut", "region", {"nom": ep["nom"],
                                    "fin_prevue": ep["fin_jour"]}), "debut": j, "off": 0}
        elif j == ep["fin_jour"] + 1 and ep["type"] in episodes:
            evt("meteo.secheresse_fin", "region", {"nom": ep["nom"]}, [episodes[ep["type"]]["id"]])
            derniers[ep["type"]] = episodes.pop(ep["type"])["id"]
    secheresse = ep_id("secheresse")

    # État des pompes, tiré de l'arriéré d'entretien.
    perte_h, etat_arret, etat_alerte = (hyp["entretien.perte_etat_par_heure"], hyp["entretien.etat_arret"],
                                        hyp["entretien.etat_alerte"])
    echelle = ctx.scenario["echelle"]
    pompe_etat, pompe_cap = {}, {}
    for c in ctx.communes:
        cid = c["id"]
        e_p = max(0.0, 1.0 - etat["communes"][cid]["arriere_h"] * perte_h / echelle)
        pompe_etat[cid] = e_p
        pompe_cap[cid] = 0.0 if e_p < etat_arret else c["pompe"]["capacite_m3_jour"] * e_p

    # ------------------------------------------------------------------ 2. Besoins et affectations
    energie = hyp["energie.budget_kwh_jour"] * (1 - hyp["energie.part_hydraulique"]
                                                * (1 - min(1.0, debit / ctx.debit_reference)))
    energie_budget = energie
    usages_energie = {"pompage_domestique": 0.0, "conservation": 0.0, "transport": 0.0, "irrigation": 0.0}
    kwh_m3 = hyp["energie.pompage_kwh_par_m3"]

    # Besoins en eau des cultures : le sol d'abord, l'irrigation ensuite.
    sol_max = hyp["alimentation.reserve_sol_max_m3_ha"]
    demande_irrigation = {cid: 0.0 for cid in ctx.ids}
    champs_actifs = []
    for ch in ctx.champs:
        ec = etat["champs"][ch["id"]]
        ec["sol_m3_ha"] = min(sol_max, ec["sol_m3_ha"] + pluie * 10)
        phase = (j - ch["plantation_jour"]) % ch["cycle_jours"]
        duree = (ch["maturite_jour"] - ch["plantation_jour"]) % ch["cycle_jours"]
        if phase == 0:
            ec.update(eau_ok=0.0, eau_besoin=0.0, soin_ok=0.0, soin_besoin=0.0, causes=[])
            if j > 0:
                evt("champ.plantation", ch["commune"], {"champ": ch["id"], "culture": ch["culture"]})
        if phase < duree:
            besoin = ch["besoin_eau_m3_ha_jour"]
            du_sol = min(ec["sol_m3_ha"], besoin)
            ec["sol_m3_ha"] -= du_sol
            demande = (besoin - du_sol) * ch["part_irrigable"] * ch["surface_ha"] if ch["irrigue"] else 0.0
            demande_irrigation[ch["commune"]] += demande
            champs_actifs.append((ch, ec, besoin, du_sol, demande))

    # Eau : lâcher de la réserve, puis usages domestiques d'amont en aval.
    res = ctx.biens["reserve_eau"]
    eco, retour = hyp["eau.seuil_ecologique_m3_jour"], hyp["eau.part_retour_domestique"]
    besoin_eau_pers = hyp["eau.besoin_m3_personne_jour"]
    besoin_dom = {cid: ctx.pop[ctx.index[cid]] * besoin_eau_pers for cid in ctx.ids}
    reg.mv("eau", "apport", "reserve", "apport", debit)
    volume = etat["reserve_m3"] + debit
    voulu = eco + sum(besoin_dom.values()) * (1 - retour) + sum(demande_irrigation.values())
    lacher = min(voulu, res["lacher_max_m3_jour"], max(0.0, volume - res["volume_minimal_m3"]))
    if volume - lacher > res["capacite_m3"]:
        lacher = volume - res["capacite_m3"]
    etat["reserve_m3"] = volume - lacher
    reg.mv("eau", "reserve", "riviere", "lacher", lacher)
    flux = lacher
    eau_dom, flux_a = {}, {}
    aval_dom = sum(besoin_dom.values()) * (1 - retour)
    for cid in region["ordre_eau"]:
        net = besoin_dom[cid] * (1 - retour)
        aval_dom -= net
        # L'eau des foyers passe avant le seuil écologique, qui ne borne que l'irrigation.
        prelev = max(0.0, min(besoin_dom[cid], pompe_cap[cid], flux / (1 - retour), energie / kwh_m3))
        energie -= prelev * kwh_m3
        usages_energie["pompage_domestique"] += prelev * kwh_m3
        eau_dom[cid] = prelev
        flux -= prelev * (1 - retour)
        reg.mv("eau", "riviere", f"usage:eau_domestique:{cid}", "usage", prelev * (1 - retour))
        flux_a[cid] = (flux, aval_dom)

    # Conservation des stocks.
    tonnes = (etat["depot_kg"] + etat["secours_kg"] + sum(c["stock_kg"] for c in etat["communes"].values())) / 1000
    besoin_froid = tonnes * hyp["energie.conservation_kwh_par_tonne_jour"]
    froid = min(besoin_froid, energie)
    energie -= froid
    usages_energie["conservation"] = froid
    couverture_froid = froid / besoin_froid if besoin_froid > EPS else 1.0

    # Rations du matin et décisions des foyers.
    f = etat["foyers"]
    entraide = hyp["entraide.active"]
    besoin_rives = ctx.besoin[ctx.index["rives"]]
    secours_libre = max(0.0, etat["secours_kg"] - hyp["entraide.reserve_propre_jours"] * besoin_rives) if entraide else 0.0
    secours_passage = ctx.biens["secours"]["capacite_passage_kg_jour"]
    route_reste = {r["vers"]: r["capacite_kg_jour"] for r in region["routes"]}
    charge_foyer, attente = hyp["transport.charge_foyer_kg"], hyp["transport.attente_secours_h"]
    seuil_trajet = hyp["logistique.seuil_trajet_jours"]
    heures_dispo = 24 - hyp["temps.heures_essentielles"]
    m = {cid: {} for cid in ctx.ids}
    travail_perdu = {cid: [0.0, 0.0, 0.0, 0.0] for cid in ctx.ids}
    metier_h = etat["humains"]["metier"]
    for ci, cid in enumerate(ctx.ids):
        ec = etat["communes"][cid]
        besoin_c = ctx.besoin[ci]
        ration = min(1.0, ec["stock_kg"] / besoin_c) if besoin_c > EPS else 1.0
        servi = besoin_c * ration
        ec["stock_kg"] -= servi
        reg.mv("denrees", f"grenier:{cid}", f"usage:alimentation:{cid}", "ration", servi)
        non_couvert = trajets = heures_trajet = pris_secours = du_garde_manger = 0.0
        libre_perdu = 0.0
        penurie = ration < 1 - 1e-6
        id_penurie = episode(f"penurie:{cid}", penurie, lambda: evt(
            "commune.penurie", cid, {"ration": round(ration, 3)},
            [ep_id(f"reserve_basse:{cid}"), ep_id(f"livraison_partielle:{cid}")]))
        if penurie or ec.get("garde_manger_kg", 0.0) > EPS:
            duree_trajet = 2 * ctx.duree_vers_rives(cid) + attente if cid != "rives" else 0.0
            gm, dette = f["garde_manger"], f["dette"]
            reste_gm = 0.0
            for fi in ctx.foyers_de[ci]:
                manque = ctx.f_besoin[fi] * (1 - ration)
                if gm[fi] > 0 and manque > 0:
                    pris = min(gm[fi], manque)
                    gm[fi] -= pris
                    manque -= pris
                    du_garde_manger += pris
                if manque > EPS:
                    dette[fi] += manque
                    hi = ctx.f_voyageur[fi]
                    if (cid != "rives" and hi >= 0 and dette[fi] >= seuil_trajet * ctx.f_besoin[fi]
                            and duree_trajet <= heures_dispo):
                        prise = min(charge_foyer, secours_libre, secours_passage, route_reste["rives"],
                                    route_reste.get(cid, math.inf))
                        if prise >= manque:
                            secours_libre -= prise
                            secours_passage -= prise
                            route_reste["rives"] -= prise
                            if cid in route_reste:
                                route_reste[cid] -= prise
                            pris_secours += prise
                            gm[fi] += prise - manque
                            du_garde_manger += manque
                            libre_perdu += duree_trajet - min(duree_trajet, ctx.f_travail_voyageur[fi])
                            manque = 0.0
                            dette[fi] = 0.0
                            sur_travail = min(duree_trajet, ctx.f_travail_voyageur[fi])
                            travail_perdu[cid][metier_h[hi]] += sur_travail
                            f["trajets"][fi] += 1
                            f["heures_trajet"][fi] += duree_trajet
                            f["travail_perdu_h"][fi] += sur_travail
                            trajets += 1
                            heures_trajet += duree_trajet
                            evt("foyer.trajet_secours", cid, {"kg": prise, "heures": duree_trajet,
                                "sur_travail_h": sur_travail, "metier": metier_h[hi]},
                                [id_penurie], foyer=fi, humain=hi)
                    if manque > EPS:
                        f["non_couvert_kg"][fi] += manque
                        non_couvert += manque
                else:
                    dette[fi] = 0.0
                reste_gm += gm[fi]
            ec["garde_manger_kg"] = reste_gm
            etat["secours_kg"] -= pris_secours
            reg.mv("denrees", "secours", f"foyers:{cid}", "trajet_secours", pris_secours)
            reg.mv("denrees", f"foyers:{cid}", f"usage:alimentation:{cid}", "garde_manger", du_garde_manger)
        m[cid].update(ration=ration, non_couvert_kg=non_couvert, trajets_foyers=trajets,
                      heures_trajet_foyers=heures_trajet,
                      libre_perdu_h=libre_perdu, garde_manger_kg=ec.get("garde_manger_kg", 0.0))

    # Offres de travail du jour.
    h_services = hyp["temps.services_h_par_habitant"]
    agri, tech, marge_services = {}, {}, {}
    for ci, cid in enumerate(ctx.ids):
        o, perdu = ctx.offre[ci], travail_perdu[cid]
        services = max(0.0, o[SERVICES] - perdu[SERVICES])
        besoin_services = ctx.pop[ci] * h_services
        marge_services[cid] = max(0.0, services - besoin_services)
        m[cid]["services_couverture"] = min(1.0, services / besoin_services) if besoin_services > EPS else 1.0
        agri[cid] = max(0.0, o[AGRICULTURE] - perdu[AGRICULTURE]) + marge_services[cid] * hyp["temps.efficacite_renfort"]
        tech[cid] = max(0.0, o[TECHNIQUE] - perdu[TECHNIQUE])
        m[cid]["offre_technique_h"] = tech[cid]
    # Les pompes tournent d'abord.
    h_pompe = hyp["eau.pompage_h_par_m3"]
    heures_pompage = {}
    for cid in ctx.ids:
        voulu_m3 = eau_dom[cid] + min(demande_irrigation[cid], max(0.0, pompe_cap[cid] - eau_dom[cid]))
        heures_pompage[cid] = min(tech[cid], voulu_m3 * h_pompe)
        tech[cid] -= heures_pompage[cid]

    # ------------------------------------------------------------------ 3. Production et transferts
    # Récoltes puis soins des cultures, bornés par le travail agricole.
    h_tonne = hyp["alimentation.recolte_h_par_tonne"]
    fenetre, perte_champ = hyp["alimentation.fenetre_recolte_jours"], hyp["alimentation.perte_champ_par_jour"]
    capacites = {c["id"]: c["grenier"]["capacite_kg"] for c in ctx.communes}
    for ch in ctx.champs:
        ec, cid = etat["champs"][ch["id"]], ch["commune"]
        phase = (j - ch["plantation_jour"]) % ch["cycle_jours"]
        duree = (ch["maturite_jour"] - ch["plantation_jour"]) % ch["cycle_jours"]
        if phase == duree:
            f_eau = (ec["eau_ok"] / ec["eau_besoin"]) ** hyp["alimentation.exposant_eau"] if ec["eau_besoin"] > EPS else 1.0
            f_soin = (ec["soin_ok"] / ec["soin_besoin"]) ** hyp["alimentation.exposant_soin"] if ec["soin_besoin"] > EPS else 1.0
            potentiel = ch["surface_ha"] * ch["rendement_kg_ha"]
            ec.update(a_recolter_kg=potentiel * f_eau * f_soin, mur_depuis=j, recolte_kg=0.0, perdu_kg=0.0)
            ec["evenement_recolte"] = evt("champ.recolte", cid, {
                "champ": ch["id"], "culture": ch["culture"], "attendu_kg": ec["a_recolter_kg"],
                "potentiel_kg": potentiel, "facteur_eau": f_eau, "facteur_soin": f_soin}, ec.get("causes", []))
            if f_eau * f_soin < 0.8:
                derniers[f"recolte_faible:{cid}"] = ec["evenement_recolte"]
        if ec["a_recolter_kg"] > EPS:
            if j - ec["mur_depuis"] > fenetre:
                perdu = ec["a_recolter_kg"] * perte_champ
                ec["a_recolter_kg"] -= perdu
                ec["perdu_kg"] += perdu
            place = max(0.0, capacites[cid] - etat["communes"][cid]["stock_kg"])
            kg = min(ec["a_recolter_kg"], agri[cid] / h_tonne * 1000, place)
            agri[cid] -= kg / 1000 * h_tonne
            ec["a_recolter_kg"] -= kg
            ec["recolte_kg"] += kg
            etat["communes"][cid]["stock_kg"] += kg
            reg.mv("denrees", f"champ:{ch['id']}", f"grenier:{cid}", "recolte", kg)
            m[cid]["recolte_kg"] = m[cid].get("recolte_kg", 0.0) + kg
    soins = {}
    for ch, ec, besoin, du_sol, demande in champs_actifs:
        cid = ch["commune"]
        besoin_h = ch["surface_ha"] * ch["soin_h_ha_jour"]
        fait = min(besoin_h, agri[cid])
        agri[cid] -= fait
        ec["soin_ok"] += fait / besoin_h
        ec["soin_besoin"] += 1.0
        soins[ch["id"]] = fait / besoin_h

    # Demandes à l'entrepôt et partage de la capacité commune.
    depot = ctx.biens["depot"]
    reservee, comptes = part_reservee(etat, "depot", j)
    passage = depot["capacite_passage_kg_jour"]
    passage_commun = passage * (1 - reservee)
    en_transit = {cid: 0.0 for cid in ctx.ids}
    for t in etat["transit"]:
        if t["vers"].startswith("grenier:"):
            en_transit[t["vers"].split(":")[1]] += t["kg"]
    demandes = {}
    for ci, c in enumerate(ctx.communes):
        cid = c["id"]
        cible = c["grenier"]["jours_cible"] * ctx.besoin[ci]
        demandes[cid] = max(0.0, cible - etat["communes"][cid]["stock_kg"] - en_transit[cid])
    total = sum(demandes.values())
    manut_h = hyp["transport.manutention_h_par_tonne"]
    limite_equipe = tech["bourg"] / manut_h * 1000
    limites = {"droits": passage_commun, "stock": etat["depot_kg"], "equipe": limite_equipe}
    limite = min(limites.values())
    sans_droits = min(passage, etat["depot_kg"], limite_equipe)
    if hyp["logistique.regle_partage_depot"] == "priorite_bourg" and total > limite:
        accordes, reste = {}, limite
        for cid in ["bourg"] + [x for x in ctx.ids if x != "bourg"]:
            accordes[cid] = min(demandes[cid], reste)
            reste -= accordes[cid]
    else:
        part = min(1.0, limite / total) if total > EPS else 0.0
        accordes = {cid: demandes[cid] * part for cid in ctx.ids}
    limite_par_droits = total > limite + 1e-6 and limites["droits"] <= limite + 1e-9 and min(total, sans_droits) > limite + 1e-6
    id_acces = episode("depot.acces_limite", limite_par_droits, lambda: evt(
        "depot.acces_limite", "bourg", {"capacite_commune_kg": passage_commun, "demande_kg": total,
                                        "part_reservee": reservee}, [derniers.get("droit:depot")]))
    besoin_region = sum(ctx.besoin)
    id_stock_bas = episode("depot.stock_bas", etat["depot_kg"] < 15 * besoin_region, lambda: evt(
        "depot.stock_bas", "bourg", {"stock_kg": etat["depot_kg"], "jours": etat["depot_kg"] / besoin_region},
        [secheresse or derniers.get("secheresse")] + [v for k, v in derniers.items() if k.startswith("recolte_faible:")]))

    charge, equipage = hyp["transport.charge_vehicule_kg"], hyp["transport.equipage"]
    kwh_h = hyp["energie.transport_kwh_par_heure"]
    servi_total = 0.0
    non_servi = {}
    heures_livraison = {cid: 0.0 for cid in ctx.ids}
    for cid in ctx.ids:
        q = accordes[cid]
        if cid == "bourg":
            delai, h_par_kg = 0, 0.0
        else:
            r = ctx.routes[cid]
            h_par_kg = 2 * r["duree_h"] * equipage / charge
            delai = r["delai_jours"]
            q = min(q, route_reste[cid], tech[cid] / h_par_kg, energie / (h_par_kg * kwh_h))
        q = max(0.0, q)
        heures = q * h_par_kg
        if cid != "bourg":
            tech[cid] -= heures
            route_reste[cid] -= q
            energie -= heures * kwh_h
            usages_energie["transport"] += heures * kwh_h
        heures_livraison[cid] = heures
        tech["bourg"] -= q / 1000 * manut_h
        etat["depot_kg"] -= q
        servi_total += q
        if delai == 0:
            etat["communes"][cid]["stock_kg"] += q
            reg.mv("denrees", "depot", f"grenier:{cid}", "livraison", q)
        elif q > EPS:
            etat["transit"].append({"vers": f"grenier:{cid}", "kg": q, "arrivee": j + delai, "de": "depot"})
            reg.mv("denrees", "depot", "transit", "expedition", q)
        non_servi[cid] = max(0.0, demandes[cid] - q)
        partielle = demandes[cid] > EPS and q < 0.98 * demandes[cid]
        raison = ("droits" if limite_par_droits else "stock" if limites["stock"] <= limite + 1e-9 and total > limite
                  else "equipe")
        episode(f"livraison_partielle:{cid}", partielle, lambda cid=cid, q=q, raison=raison: evt(
            "livraison.partielle", cid, {"demande_kg": demandes[cid], "servi_kg": q, "raison": raison},
            [id_acces if raison == "droits" else id_stock_bas if raison == "stock" else None]))
        m[cid].update(demande_depot_kg=demandes[cid], servi_depot_kg=q, non_servi_depot_kg=non_servi[cid])
        c = ctx.communes[ctx.index[cid]]
        if c["grenier"]["jours_garde"] is not None:
            episode(f"sollicite_depot:{cid}", demandes[cid] > EPS, lambda cid=cid: evt(
                "commune.sollicite_depot", cid, {"demande_kg": demandes[cid]},
                [derniers.get(f"recolte_faible:{cid}"), ep_id(f"reserve_basse:{cid}")]))

    # Expédition des surplus de récolte vers l'entrepôt.
    for ci, c in enumerate(ctx.communes):
        cid, garde = c["id"], c["grenier"]["jours_garde"]
        if garde is None:
            continue
        r = ctx.routes[cid]
        h_par_kg = 2 * r["duree_h"] * equipage / charge
        place_depot = depot["capacite_stockage_kg"] - etat["depot_kg"] - sum(
            t["kg"] for t in etat["transit"] if t["vers"] == "depot")
        surplus = min(etat["communes"][cid]["stock_kg"] - garde * ctx.besoin[ci], route_reste[cid], place_depot,
                      energie / (h_par_kg * kwh_h))
        if surplus > EPS:
            etat["communes"][cid]["stock_kg"] -= surplus
            route_reste[cid] -= surplus
            energie -= surplus * h_par_kg * kwh_h
            usages_energie["transport"] += surplus * h_par_kg * kwh_h
            etat["transit"].append({"vers": "depot", "kg": surplus, "arrivee": j + r["delai_jours"], "de": cid})
            reg.mv("denrees", f"grenier:{cid}", "transit", "expedition", surplus)
            m[cid]["expedie_kg"] = surplus

    # Secours : la réserve des Rives, portée par l'équipe prêtée ou par celle de la commune.
    seuil_alerte = hyp["logistique.seuil_alerte_jours"]
    entretien_besoin = {}
    rattrapage = hyp["entretien.rattrapage_max"]
    for c in ctx.communes:
        base = c["pompe"]["entretien_h_jour"]
        entretien_besoin[c["id"]] = (base, base + min(etat["communes"][c["id"]]["arriere_h"], base * rattrapage))
    pret_rives = max(0.0, tech["rives"] - entretien_besoin["rives"][1]) if hyp["entraide.pret_equipe"] else 0.0
    secours_propre = max(0.0, etat["secours_kg"] - secours_libre) if entraide else etat["secours_kg"]
    heures_secours = {cid: 0.0 for cid in ctx.ids}
    for ci, cid in enumerate(ctx.ids):
        m[cid].update(secours_kg=0.0, secours_h_pretees=0.0, secours_h_propres=0.0)
        reserve_j = (etat["communes"][cid]["stock_kg"] + en_transit[cid] + m[cid]["servi_depot_kg"]) / ctx.besoin[ci]
        if non_servi[cid] <= EPS or reserve_j >= seuil_alerte:
            continue
        cause = ep_id(f"livraison_partielle:{cid}")
        if cid == "rives":
            q = min(non_servi[cid], secours_propre + secours_libre, secours_passage)
            if q > EPS:
                pris_propre = min(q, secours_propre)
                secours_propre -= pris_propre
                secours_libre -= q - pris_propre
                secours_passage -= q
                etat["secours_kg"] -= q
                etat["communes"][cid]["stock_kg"] += q
                reg.mv("denrees", "secours", f"grenier:{cid}", "secours", q)
                m[cid]["secours_kg"] = q
                evt("secours.prelevement", cid, {"kg": q}, [cause])
            continue
        if not entraide:
            continue
        duree = ctx.duree_vers_rives(cid)
        h_par_kg = 2 * duree * equipage / charge
        q = min(non_servi[cid], secours_libre, secours_passage, route_reste["rives"], route_reste.get(cid, math.inf),
                (pret_rives + tech[cid]) / h_par_kg, energie / (h_par_kg * kwh_h))
        if q <= EPS:
            continue
        heures = q * h_par_kg
        pretees = min(heures, pret_rives)
        pret_rives -= pretees
        tech["rives"] -= pretees
        tech[cid] -= heures - pretees
        heures_secours[cid] = heures - pretees
        secours_libre -= q
        secours_passage -= q
        route_reste["rives"] -= q
        if cid in route_reste:
            route_reste[cid] -= q
        energie -= heures * kwh_h
        usages_energie["transport"] += heures * kwh_h
        etat["secours_kg"] -= q
        etat["transit"].append({"vers": f"grenier:{cid}", "kg": q, "arrivee": j + 1, "de": "secours"})
        reg.mv("denrees", "secours", "transit", "expedition", q)
        m[cid].update(secours_kg=q, secours_h_pretees=pretees, secours_h_propres=heures - pretees)
        derniers[f"tournee:{cid}"] = evt("secours.tournee", cid, {
            "kg": q, "heures": heures, "heures_pretees": pretees, "heures_propres": heures - pretees}, [cause])
        if pretees > EPS:
            m["rives"]["heures_pretees"] = m["rives"].get("heures_pretees", 0.0) + pretees

    # Irrigation, d'amont en aval, avec l'eau et l'énergie restantes.
    eau_irr = {}
    decalage = 0.0  # eau déjà retirée en amont par l'irrigation
    for cid in region["ordre_eau"]:
        flux_ici, aval = flux_a[cid]
        dispo = max(0.0, flux_ici - decalage - eco - aval)
        prelev = max(0.0, min(demande_irrigation[cid], pompe_cap[cid] - eau_dom[cid], dispo, energie / kwh_m3))
        energie -= prelev * kwh_m3
        usages_energie["irrigation"] += prelev * kwh_m3
        decalage += prelev
        eau_irr[cid] = prelev
        reg.mv("eau", "riviere", f"usage:irrigation:{cid}", "usage", prelev)
        sat = prelev / demande_irrigation[cid] if demande_irrigation[cid] > EPS else 1.0
        pompe_limite = demande_irrigation[cid] > EPS and prelev >= pompe_cap[cid] - eau_dom[cid] - 1e-6 and sat < 0.999
        id_irr = episode(f"irrigation_reduite:{cid}", demande_irrigation[cid] > EPS and sat < 0.8,
                         lambda cid=cid, sat=sat, pl=pompe_limite: evt(
                             "eau.irrigation_reduite", cid, {"satisfaction": sat, "limite": "pompe" if pl else "eau"},
                             [ep_id(f"pompe_degradee:{cid}") if pl else secheresse]))
        m[cid].update(irrigation_demande_m3=demande_irrigation[cid], irrigation_m3=prelev, irrigation_satisfaction=sat)
        dom_ok = eau_dom[cid] / besoin_dom[cid] if besoin_dom[cid] > EPS else 1.0
        m[cid]["eau_domestique_couverture"] = dom_ok
        episode(f"eau_domestique:{cid}", dom_ok < 0.95, lambda cid=cid, dom_ok=dom_ok: evt(
            "eau.domestique_reduite", cid, {"couverture": dom_ok}, [secheresse, ep_id(f"pompe_degradee:{cid}")]))
        for ch, ec, besoin, du_sol, demande in champs_actifs:
            if ch["commune"] != cid:
                continue
            recu = (demande * sat) / ch["surface_ha"] if demande > EPS else 0.0
            ec["eau_ok"] += (du_sol + recu) / besoin
            ec["eau_besoin"] += 1.0
            if id_irr and id_irr not in ec.setdefault("causes", []):
                ec["causes"].append(id_irr)
    reg.mv("eau", "riviere", "aval", "ecoulement", flux - decalage)

    # ------------------------------------------------------------------ 4. Travaux, pertes, lendemain
    for ci, c in enumerate(ctx.communes):
        cid, ec = c["id"], etat["communes"][c["id"]]
        base, voulu_h = entretien_besoin[cid]
        fait = min(voulu_h, tech[cid])
        tech[cid] -= fait
        reporte = max(0.0, base - fait)
        ec["arriere_h"] = max(0.0, ec["arriere_h"] + base - fait)
        cause_report = None
        if reporte > 0.05 * base:
            if heures_secours[cid] > EPS:
                cause_report = derniers.get(f"tournee:{cid}")
            elif m[cid]["heures_trajet_foyers"] > EPS:
                cause_report = ep_id(f"penurie:{cid}")
            else:
                cause_report = ep_id(f"livraison_partielle:{cid}") or secheresse
        id_report = episode(f"entretien_reporte:{cid}", reporte > 0.05 * base, lambda cid=cid, r=reporte, cr=cause_report: evt(
            "entretien.reporte", cid, {"heures": r, "tournee_h": heures_secours[cid],
                                       "trajets_foyers_h": m[cid]["heures_trajet_foyers"]}, [cr]))
        e_p = pompe_etat[cid]
        episode(f"pompe_degradee:{cid}", e_p < etat_alerte, lambda cid=cid, e_p=e_p, ir=id_report: evt(
            "pompe.degradee", cid, {"etat": e_p}, [ir or ep_id(f"entretien_reporte:{cid}")]),
            lambda ep, cid=cid: evt("pompe.retablie", cid, {}, [ep["id"]]))
        episode(f"pompe_arretee:{cid}", e_p < etat_arret, lambda cid=cid, e_p=e_p: evt(
            "pompe.arretee", cid, {"etat": e_p}, [ep_id(f"pompe_degradee:{cid}")]))
        # Pertes de stockage.
        perte = ec["stock_kg"] * hyp["alimentation.perte_grenier_par_jour"] * (
            1 + (hyp["alimentation.perte_sans_froid_facteur"] - 1) * (1 - couverture_froid))
        ec["stock_kg"] -= perte
        reg.mv("denrees", f"grenier:{cid}", f"perte:grenier:{cid}", "perte", perte)
        jours_reserve = ec["stock_kg"] / ctx.besoin[ci] if ctx.besoin[ci] > EPS else 0.0
        episode(f"reserve_basse:{cid}", jours_reserve < seuil_alerte, lambda cid=cid, jr=jours_reserve: evt(
            "stock.reserve_basse", cid, {"jours": jr},
            [derniers.get(f"recolte_faible:{cid}"), ep_id(f"livraison_partielle:{cid}")]))
        libres = [ctx.f_libre[fi] / ctx.f_adultes[fi] for fi in ctx.foyers_de[ci] if ctx.f_adultes[fi]]
        m[cid].update(
            population=ctx.pop[ci], stock_kg=ec["stock_kg"], jours_reserve=jours_reserve,
            en_transit_kg=en_transit[cid], entretien_fait_h=fait, entretien_reporte_h=reporte,
            arriere_h=ec["arriere_h"], pompe_etat=e_p, pompe_capacite_m3=pompe_cap[cid],
            heures_livraison=heures_livraison[cid], heures_pompage=heures_pompage[cid],
            heures_tournee_secours=heures_secours[cid], marge_technique_h=tech[cid],
            marge_agricole_h=agri[cid], eau_domestique_m3=eau_dom[cid],
            temps_libre_moyen_h=(sum(libres) / len(libres) if libres else 0.0)
            - m[cid]["libre_perdu_h"] / max(1, len(libres)),
            perte_kg=perte)
    f_perte = 1 + (hyp["alimentation.perte_sans_froid_facteur"] - 1) * (1 - couverture_froid)
    perte_depot = etat["depot_kg"] * hyp["alimentation.perte_depot_par_jour"] * f_perte
    etat["depot_kg"] -= perte_depot
    reg.mv("denrees", "depot", "perte:depot", "perte", perte_depot)
    perte_secours = etat["secours_kg"] * hyp["alimentation.perte_depot_par_jour"] * f_perte
    etat["secours_kg"] -= perte_secours
    reg.mv("denrees", "secours", "perte:secours", "perte", perte_secours)

    champs_m = {}
    for ch in ctx.champs:
        ec = etat["champs"][ch["id"]]
        phase = (j - ch["plantation_jour"]) % ch["cycle_jours"]
        duree = (ch["maturite_jour"] - ch["plantation_jour"]) % ch["cycle_jours"]
        champs_m[ch["id"]] = {
            "phase": "croissance" if phase < duree else ("recolte" if ec["a_recolter_kg"] > 1 else "repos"),
            "avancement": min(1.0, phase / duree), "eau": (ec["eau_ok"] / ec["eau_besoin"]) if ec["eau_besoin"] else 1.0,
            "soin": (ec["soin_ok"] / ec["soin_besoin"]) if ec["soin_besoin"] else 1.0,
            "sol_m3_ha": ec["sol_m3_ha"], "a_recolter_kg": ec["a_recolter_kg"], "recolte_kg": ec["recolte_kg"]}
    m["region"] = {
        "debit_m3": debit, "pluie_mm": pluie, "reserve_m3": etat["reserve_m3"], "lacher_m3": lacher,
        "debit_aval_m3": flux - decalage, "depot_kg": etat["depot_kg"], "secours_kg": etat["secours_kg"],
        "transit_kg": sum(t["kg"] for t in etat["transit"]), "depot_demande_kg": total,
        "depot_servi_kg": servi_total, "depot_non_servi_kg": max(0.0, total - servi_total),
        "depot_passage_kg": passage, "depot_passage_commun_kg": passage_commun, "part_reservee": reservee,
        "comptes": comptes, "limite_par_droits": limite_par_droits, "energie_budget_kwh": energie_budget,
        "energie_usages": usages_energie, "energie_reste_kwh": energie, "conservation_couverture": couverture_froid,
        "secheresse": bool(secheresse), "population": sum(ctx.pop), "champs": champs_m,
        "non_couvert_kg": sum(m[cid]["non_couvert_kg"] for cid in ctx.ids),
    }
    etat["jour"] = j
    return {"jour": j, "mouvements": reg.lignes, "evenements": evenements, "mesures": m,
            "rattachements": rattachements}
