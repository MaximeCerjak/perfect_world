"""Vie d'un monde : création, avancée jour par jour, reprise et empreinte.

Une journée s'écrit dans une seule transaction. Après une interruption, le
moteur reprend au dernier jour validé. Le garde `jour = jour - 1` empêche deux
exécutions de calculer la même journée d'un même monde.
"""
from __future__ import annotations

import hashlib
import json
import time

from . import VERSION_MOTEUR, bilans, meteo, moteur, parametres, population
from .stockage import Base

INTERVALLE_REPRISE = 30


class JourneeInvalide(RuntimeError):
    """Une journée a rompu un bilan ou une capacité ; rien n'a été enregistré."""


def _json(objet) -> str:
    return json.dumps(objet, ensure_ascii=False, separators=(",", ":"))


def creer_monde(db: Base, monde: str, nom: str, population_: int = 1000, graine: int | None = None,
                jours_max: int = 365, surcharges: dict | None = None, cas: str | None = None,
                mode_inscription: str = "humain_disponible") -> None:
    """Crée un monde au jour 0. Avec `cas`, programme les événements de droits du cas A, B ou C."""
    scenario = parametres.charger_scenario(population_, surcharges)
    jeux = parametres.charger_cas()
    graine = jeux["graine"] if graine is None else graine
    serie = meteo.generer_serie(scenario["region"]["meteo"], jours_max, graine)
    etat = population.creer_etat_initial(scenario, graine)
    with db.transaction():
        db.executer("INSERT INTO mondes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            monde, nom, cas, population_, graine, jours_max, 0, VERSION_MOTEUR, _json(scenario), _json(serie),
            _json(etat), mode_inscription))
        db.executer("INSERT INTO points_reprise VALUES (?,?,?)", (monde, 0, _json(etat)))
        initial = [(monde, 0, "eau" if compte == "reserve" else "denrees", "initial", compte, "initial", q)
                   for compte, q in bilans.stocks(etat).items() if q > 0]
        db.executer_lot("INSERT INTO mouvements VALUES (?,?,?,?,?,?,?)", initial)
        if cas:
            for e in jeux["cas"][cas]["evenements"]:
                db.executer("INSERT INTO boite VALUES (?,?,?,?,?,?,?)", (
                    monde, e["cle"], e["type"], e["jour_effet"], 0, "recu", _json(e)))


def charger(db: Base, monde: str) -> dict:
    """Charge un monde : métadonnées, scénario, série météo et dernier état validé."""
    ligne = db.lire_un("SELECT id, nom, cas, population, graine, jours_max, jour, version_moteur, scenario, serie, "
                       "etat, mode_inscription FROM mondes WHERE id = ?", (monde,))
    if not ligne:
        raise KeyError(f"monde inconnu : {monde}")
    cles = ("id", "nom", "cas", "population", "graine", "jours_max", "jour", "version_moteur")
    m = dict(zip(cles, ligne[:8]))
    m.update(scenario=json.loads(ligne[8]), serie=json.loads(ligne[9]), etat=json.loads(ligne[10]),
             mode_inscription=ligne[11])
    return m


def lister(db: Base) -> list[dict]:
    """Retourne les mondes connus, sans leur état."""
    return [dict(zip(("id", "nom", "cas", "population", "jour", "jours_max"), l)) for l in db.lire(
        "SELECT id, nom, cas, population, jour, jours_max FROM mondes ORDER BY id")]


def avancer(db: Base, monde: str, jours: int = 1, arret_apres=None) -> dict:
    """Fait avancer `monde` de `jours` journées et retourne les durées mesurées.

    `arret_apres(jour)` permet aux essais d'interrompre l'exécution : l'exception
    qu'elle lève laisse la base au dernier jour validé.
    """
    m = charger(db, monde)
    etat = m["etat"]
    ctx = moteur.Contexte(m["scenario"], m["serie"], m["graine"])
    durees = {"calcul_s": 0.0, "ecriture_s": 0.0, "jours": 0, "evenements": 0}
    for _ in range(jours):
        j = etat["jour"] + 1
        if j > m["jours_max"]:
            break
        t0 = time.perf_counter()
        entrees = [json.loads(d) for (d,) in db.lire(
            "SELECT data FROM boite WHERE monde = ? AND jour_effet = ? AND statut = 'recu' ORDER BY cle", (monde, j))]
        avant = bilans.stocks(etat)
        resultat = moteur.avancer_jour(etat, ctx, entrees)
        ecarts = bilans.verifier_jour(avant, bilans.stocks(etat), resultat, ctx)
        if ecarts:
            raise JourneeInvalide(f"jour {j} : " + " ; ".join(ecarts[:5]))
        t1 = time.perf_counter()
        etat_json = _json(etat)
        with db.transaction():
            cur = db.executer("UPDATE mondes SET jour = ?, etat = ? WHERE id = ? AND jour = ?",
                              (j, etat_json, monde, j - 1))
            if cur.rowcount != 1:
                raise JourneeInvalide(f"jour {j} déjà calculé pour {monde}")
            db.executer_lot("INSERT INTO evenements VALUES (?,?,?,?,?,?,?,?,?)", [
                (monde, e["id"], j, e["lieu"], e["type"], e["foyer"], e["humain"], e["humain2"],
                 _json({"mesure": e["mesure"], "causes": e["causes"]})) for e in resultat["evenements"]])
            db.executer_lot("INSERT INTO mouvements VALUES (?,?,?,?,?,?,?)", [
                (monde, j, r, de, vers, nature, q) for (r, de, vers, nature), q in resultat["mouvements"].items()])
            db.executer_lot("INSERT INTO mesures VALUES (?,?,?,?)", [
                (monde, j, lieu, _json(data)) for lieu, data in resultat["mesures"].items()])
            db.executer("UPDATE boite SET statut = 'applique' WHERE monde = ? AND jour_effet = ? AND statut = 'recu'",
                        (monde, j))
            db.executer_lot("INSERT INTO rattachements VALUES (?,?,?)", [
                (monde, p, h) for p, h in resultat["rattachements"]])
            if j % INTERVALLE_REPRISE == 0:
                db.executer("INSERT INTO points_reprise VALUES (?,?,?)", (monde, j, etat_json))
        durees["calcul_s"] += t1 - t0
        durees["ecriture_s"] += time.perf_counter() - t1
        durees["jours"] += 1
        durees["evenements"] += len(resultat["evenements"])
        if arret_apres:
            arret_apres(j)
    return durees


def empreinte(db: Base, monde: str) -> str:
    """Empreinte de l'état final, des événements et des mouvements d'un monde."""
    h = hashlib.sha256()
    h.update(db.lire_un("SELECT etat FROM mondes WHERE id = ?", (monde,))[0].encode())
    for ligne in db.lire("SELECT id, jour, lieu, type, foyer, humain, humain2, data FROM evenements "
                         "WHERE monde = ? ORDER BY id", (monde,)):
        h.update(repr(ligne).encode())
    for ligne in db.lire("SELECT jour, ressource, de, vers, nature, quantite FROM mouvements "
                         "WHERE monde = ? ORDER BY jour, ressource, de, vers, nature", (monde,)):
        h.update(repr(ligne).encode())
    return h.hexdigest()


def supprimer(db: Base, monde: str) -> None:
    """Supprime un monde et tout ce qui s'y rattache."""
    with db.transaction():
        for table in ("points_reprise", "evenements", "mouvements", "mesures", "boite", "participants", "rattachements"):
            db.executer(f"DELETE FROM {table} WHERE monde = ?", (monde,))
        db.executer("DELETE FROM mondes WHERE id = ?", (monde,))
