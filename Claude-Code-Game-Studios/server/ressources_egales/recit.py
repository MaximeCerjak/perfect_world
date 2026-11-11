"""Mise en récit des événements : dates, titres et phrases du journal.

Le moteur produit des faits datés et chiffrés ; ce module les met en mots.
Les textes n'ajoutent aucune information absente de l'événement.
"""
from __future__ import annotations

MOIS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
        "novembre", "décembre")
JOURS_MOIS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
METIERS = ("sans activité", "agriculture", "équipe technique", "services")
# Événements de lieu repris dans le journal de chaque habitant de la commune.
POUR_JOURNAL = {
    "meteo.secheresse_debut", "meteo.secheresse_fin", "champ.recolte", "stock.reserve_basse",
    "commune.sollicite_depot", "commune.penurie", "droit.acquis", "droit.annule", "droit.acces_modifie",
    "droit.expire", "depot.acces_limite", "depot.stock_bas", "livraison.partielle", "secours.tournee",
    "secours.prelevement", "entretien.reporte", "pompe.degradee", "pompe.arretee", "pompe.retablie",
    "eau.irrigation_reduite", "eau.domestique_reduite"}
# Événements de l'entrepôt et de la région, repris dans toutes les communes.
PARTOUT = {"meteo.secheresse_debut", "meteo.secheresse_fin", "droit.acquis", "droit.annule",
           "droit.acces_modifie", "droit.expire", "depot.acces_limite", "depot.stock_bas"}
ROUTINE = {"secours.tournee", "secours.prelevement", "foyer.trajet_secours", "stock.reserve_basse",
           "entretien.reporte", "livraison.partielle", "depot.acces_limite"}
CUMULS = {"secours.tournee": "tournées de secours", "secours.prelevement": "prélèvements dans la réserve de secours",
          "foyer.trajet_secours": "trajets jusqu'aux Rives"}
CONTRACTIONS = ((" de Le ", " du "), (" de Les ", " des "), (" à Le ", " au "), (" à Les ", " aux "),
                ("À Le ", "Au "), ("À Les ", "Aux "))


def accorder(texte: str) -> str:
    """Contracte « de Le », « à Les »… devant les noms de communes."""
    for avant, apres in CONTRACTIONS:
        texte = texte.replace(avant, apres)
    return texte


def date(jour: int, jour_zero: dict) -> str:
    """Date lisible d'un jour simulé, par exemple « 14 juillet, an 1 »."""
    n = jour + sum(JOURS_MOIS[:jour_zero["mois"] - 1]) + jour_zero["jour"] - 1
    an, reste = n // 365 + 1, n % 365
    for i, nb in enumerate(JOURS_MOIS):
        if reste < nb:
            return f"{reste + 1}{'er' if reste == 0 else ''} {MOIS[i]}, an {an}"
        reste -= nb
    return f"jour {jour}"


def saison(jour: int, jour_zero: dict) -> str:
    """Saison d'un jour simulé."""
    n = (jour + sum(JOURS_MOIS[:jour_zero["mois"] - 1]) + jour_zero["jour"] - 1) % 365
    return "hiver" if n < 79 or n >= 355 else "printemps" if n < 172 else "été" if n < 265 else "automne"


def _kg(x: float) -> str:
    return f"{x / 1000:.1f} t".replace(".", ",") if x >= 1000 else f"{x:.0f} kg"


def _h(x: float) -> str:
    return f"{x:.1f} h".replace(".", ",").replace(",0 h", " h")


def _pct(x: float) -> str:
    return f"{round(x * 100)} %"


def decrire(e: dict, noms: dict) -> tuple[str, str]:
    """Retourne (titre, texte) pour un événement.

    `noms` fournit `lieu(id)`, `bien(id)`, `humain(indice)` et `foyer(indice)`.
    """
    t, m = e["type"], e["mesure"]
    lieu = noms["lieu"](e["lieu"])
    qui = noms["humain"](e["humain"]) if e.get("humain") is not None else None
    if t == "meteo.secheresse_debut":
        return "La sécheresse s'installe", f"Les pluies se raréfient et le débit de la rivière baisse sur tout le bassin."
    if t == "meteo.secheresse_fin":
        return "Les pluies reviennent", "Le débit de la rivière remonte. La réserve de La Source se reconstitue."
    if t == "champ.plantation":
        return "Nouvelle mise en culture", f"{lieu} met en culture ses {m['culture']}."
    if t == "champ.recolte":
        ratio = m["attendu_kg"] / m["potentiel_kg"] if m["potentiel_kg"] else 1
        cause = ""
        if m["facteur_eau"] < 0.9:
            cause = f" L'eau a couvert {_pct(m['facteur_eau'] ** (1 / 1.3))} des besoins de la culture."
        if m["facteur_soin"] < 0.9:
            cause += " Le travail de culture a manqué."
        qualif = "bonne" if ratio >= 0.9 else "moyenne" if ratio >= 0.7 else "faible"
        return (f"Récolte {qualif} : {m['culture']}",
                f"{lieu} attend {_kg(m['attendu_kg'])} de {m['culture']}, soit {_pct(ratio)} d'une année pleine.{cause}")
    if t == "stock.reserve_basse":
        return "Réserves basses", f"Le grenier de {lieu} ne couvre plus que {m['jours']:.0f} jours de besoins.".replace(" 1 jours", " 1 jour")
    if t == "commune.sollicite_depot":
        return "Appel à l'entrepôt", f"{lieu} demande {_kg(m['demande_kg'])} à l'entrepôt du Bourg pour reconstituer son grenier."
    if t == "commune.penurie":
        return "Rations réduites", f"Le grenier de {lieu} ne sert que {_pct(m['ration'])} des rations du jour."
    if t == "droit.acquis":
        acces = ("L'accès reste commun." if m["acces"] == "commun"
                 else f"Cette part est réservée ({m.get('usage') or 'usage du titulaire'}).")
        return (f"Un droit est acquis sur {noms['bien'](m['bien'])}",
                f"Un compte acquiert un droit sur {_pct(m['part'])} de la capacité de passage. {acces}")
    if t == "droit.annule":
        return (f"Un droit est annulé sur {noms['bien'](m['bien'])}",
                f"Le droit sur {_pct(m['part'])} de la capacité est annulé. La part revient à l'accès commun.")
    if t == "droit.acces_modifie":
        acces = "rouvre sa part à l'accès commun" if m["acces"] == "commun" else "réserve désormais sa part"
        return f"L'accès change à {noms['bien'](m['bien'])}", f"Le titulaire d'un droit sur {_pct(m['part'])} de la capacité {acces}."
    if t == "droit.expire":
        return f"Un droit prend fin sur {noms['bien'](m['bien'])}", f"Le droit sur {_pct(m['part'])} de la capacité est arrivé à son terme."
    if t == "depot.acces_limite":
        return ("La capacité commune de l'entrepôt ne suffit plus",
                f"Les communes demandent {_kg(m['demande_kg'])} ; {_kg(m['capacite_commune_kg'])} par jour restent en accès commun "
                f"({_pct(m['part_reservee'])} de la capacité est réservée).")
    if t == "depot.stock_bas":
        return "L'entrepôt se vide", f"L'entrepôt du Bourg ne contient plus que {m['jours']:.0f} jours de besoins de la région."
    if t == "livraison.partielle":
        raison = {"droits": "la capacité commune de l'entrepôt est atteinte", "stock": "l'entrepôt manque de stock",
                  "equipe": "les équipes ou la route ne suffisent pas"}[m["raison"]]
        return "Livraison partielle", f"{lieu} reçoit {_kg(m['servi_kg'])} sur {_kg(m['demande_kg'])} demandés : {raison}."
    if t == "secours.tournee":
        if m["heures_propres"] > 0.05 and m["heures_pretees"] > 0.05:
            equipe = f"Les Rives prêtent {_h(m['heures_pretees'])} d'équipe ; l'équipe technique de {lieu} donne {_h(m['heures_propres'])}."
        elif m["heures_propres"] > 0.05:
            equipe = f"L'équipe technique de {lieu} y consacre {_h(m['heures_propres'])}."
        else:
            equipe = f"L'équipe des Rives assure le trajet ({_h(m['heures_pretees'])})."
        return "Tournée de secours aux Rives", f"{_kg(m['kg'])} partent de la réserve de secours vers {lieu}. {equipe}"
    if t == "secours.prelevement":
        return "Les Rives puisent dans la réserve de secours", f"{_kg(m['kg'])} passent de la réserve de secours au grenier des Rives."
    if t == "entretien.reporte":
        if m["tournee_h"] > 0.05:
            pourquoi = f" La tournée de secours a occupé {_h(m['tournee_h'])} du créneau prévu."
        elif m["trajets_foyers_h"] > 0.05:
            pourquoi = " Des membres de l'équipe étaient partis chercher la part de leur foyer."
        else:
            pourquoi = " Les livraisons et le pompage ont pris le créneau."
        return "Entretien de la pompe reporté", f"À {lieu}, {_h(m['heures'])} d'entretien de la pompe sont reportées.{pourquoi}"
    if t == "pompe.degradee":
        return "La pompe perd en capacité", f"La pompe de {lieu} ne fournit plus que {_pct(m['etat'])} de sa capacité, faute d'entretien."
    if t == "pompe.arretee":
        return "La pompe est à l'arrêt", f"La pompe de {lieu} s'arrête. Elle repartira quand l'entretien en retard sera rattrapé."
    if t == "pompe.retablie":
        return "La pompe retrouve sa capacité", f"L'entretien en retard est rattrapé à {lieu}."
    if t == "eau.irrigation_reduite":
        limite = "la pompe ne suit plus" if m["limite"] == "pompe" else "la rivière est trop basse"
        return "Irrigation réduite", f"Les cultures de {lieu} reçoivent {_pct(m['satisfaction'])} de l'eau demandée : {limite}."
    if t == "eau.domestique_reduite":
        return "Eau des foyers réduite", f"Les foyers de {lieu} reçoivent {_pct(m['couverture'])} de leur eau."
    if t == "foyer.trajet_secours":
        suite = (f" Le trajet a occupé {_h(m['sur_travail_h'])} du créneau de travail ({METIERS[m['metier']]})."
                 if m["sur_travail_h"] > 0.05 else "")
        return ("Trajet jusqu'aux Rives",
                f"{qui} est allé chercher la part du foyer à la réserve des Rives : {_kg(m['kg'])}, {_h(m['heures'])} de trajet.{suite}")
    if t == "vie.naissance":
        return "Une naissance", f"{qui} naît dans le foyer {noms['foyer'](e['foyer'])}, à {lieu}."
    if t == "vie.deces":
        return "Un décès", f"{qui} meurt à {m['age']} ans, à {lieu}."
    if t == "vie.ecole":
        return "Premier jour d'école", f"{qui} a six ans et entre à l'école de {lieu}."
    if t == "vie.premier_metier":
        return "Première activité", f"{qui} a seize ans et rejoint {('l’' if METIERS[m['metier']][0] in 'aeé' else 'les ') + METIERS[m['metier']]} de {lieu}."
    if t == "vie.travail_allege":
        return "Un rythme allégé", f"{qui} a 65 ans et réduit ses heures de travail."
    if t == "vie.retrait":
        return "Fin du travail", f"{qui} a 75 ans et cesse le travail."
    if t == "vie.grand_age":
        return "Le grand âge", f"{qui} a 80 ans. Son foyer lui consacre désormais du temps de soin chaque jour."
    if t == "lien.noue":
        autre = noms["humain"](e["humain2"])
        cadre = "au travail" if m["contexte"] == "travail" else "dans le voisinage"
        return "Un nouveau lien", f"{qui} et {autre} se lient {cadre}."
    if t == "activite.change":
        return "Changement d'activité", f"{qui} quitte {METIERS[m['avant']]} pour {METIERS[m['apres']]}."
    return t, ""


def regrouper(entrees: list[dict]) -> list[dict]:
    """Regroupe les faits de routine consécutifs de même type et de même lieu.

    `entrees` est trié par jour ; le résultat garde l'ordre et l'identifiant du
    premier fait de chaque groupe, pour pouvoir en ouvrir les causes.
    """
    sortie: list[dict] = []
    ouverts: dict[tuple, dict] = {}
    for e in entrees:
        cle = (e["type"], e["lieu"], e.get("foyer"))
        g = ouverts.get(cle)
        if e["type"] in ROUTINE and g and e["jour"] - g["jour_fin"] <= 10:
            g["nombre"] += 1
            g["jour_fin"] = e["jour"]
            g["kg"] += e["mesure"].get("kg", 0)
            g["heures"] += e["mesure"].get("heures", 0)
            continue
        e = dict(e)
        if e["type"] in ROUTINE:
            e.update(nombre=1, jour_fin=e["jour"], kg=e["mesure"].get("kg", 0), heures=e["mesure"].get("heures", 0))
            ouverts[cle] = e
        sortie.append(e)
    for e in sortie:
        if e.get("nombre", 1) > 1:
            if e["type"] in CUMULS:
                e["titre"] = f"{e['nombre']} {CUMULS[e['type']]}"
                e["texte"] = (f"Du jour {e['jour']} au jour {e['jour_fin']} : {_kg(e['kg'])} au total"
                              + (f", {_h(e['heures'])} de trajet." if e["heures"] else "."))
            else:
                e["texte"] += f" Cela se répète {e['nombre'] - 1} fois jusqu'au jour {e['jour_fin']}."
    return sortie
