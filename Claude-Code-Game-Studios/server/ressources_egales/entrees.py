"""Entrées externes : inscriptions (Instagram ou données de test) et achats.

Chaque événement reçu porte une clé unique. Le rejouer ne change rien : la
clé est déjà dans la boîte de réception. Les adaptateurs valident, puis
transforment l'entrée en événement du monde ou en rattachement.
"""
from __future__ import annotations

import hashlib
import json
import secrets

from .stockage import Base

MOT_CLE_REPLI = "NAÎTRE"
MODES = ("humain_disponible", "naissance")


def hacher_code(code: str) -> str:
    """Empreinte d'un code d'accès ; seul ce hachage est conservé."""
    return hashlib.sha256(code.encode()).hexdigest()


def _json(objet) -> str:
    return json.dumps(objet, ensure_ascii=False, separators=(",", ":"))


def _candidats(etat: dict, pris: set[int], graine: int) -> list[int]:
    """Humains disponibles, ordonnés pour répartir les participants entre les foyers.

    Un foyer reçoit son premier participant avant qu'un autre en reçoive un
    deuxième ; l'ordre ne dépend que de la graine du monde.
    """
    h, f = etat["humains"], etat["foyers"]
    deja = {}
    for hi in pris:
        deja[h["foyer"][hi]] = deja.get(h["foyer"][hi], 0) + 1
    cles = []
    for fi, membres in enumerate(f["membres"]):
        libres = sorted((hi for hi in membres if hi not in pris),
                        key=lambda hi: hashlib.blake2b(f"{graine}:{hi}".encode(), digest_size=8).digest())
        for rang, hi in enumerate(libres):
            cles.append((deja.get(fi, 0) + rang, hashlib.blake2b(f"{graine}:f{fi}:{rang}".encode(),
                                                                digest_size=8).digest(), hi))
    cles.sort()
    return [hi for _, _, hi in cles]


def traiter_inscriptions(db: Base, monde: str, evenements: list[dict]) -> dict:
    """Traite un lot d'événements d'abonnés et retourne un bilan avec le résultat de chacun.

    Événement : `{cle, type, compte, pseudo?, texte?, abonne?}` avec `type` parmi
    `abonnement`, `desabonnement` et `message`. Un message « NAÎTRE » d'une
    personne abonnée vaut inscription (parcours de repli).
    """
    resultats = []
    bilan = {"recus": len(evenements), "doublons": 0, "inscrits": 0, "retrouves": 0, "refuses": 0,
             "desabonnes": 0, "resultats": resultats}
    with db.transaction():
        ligne = db.lire_un("SELECT jour, graine, etat, mode_inscription FROM mondes WHERE id = ?", (monde,)) \
            if not db.postgres else db.executer(
                "SELECT jour, graine, etat, mode_inscription FROM mondes WHERE id = %s FOR UPDATE", (monde,)).fetchone()
        if not ligne:
            raise KeyError(f"monde inconnu : {monde}")
        jour, graine, etat_json, mode = ligne
        cur = db.executer("SELECT cle FROM boite WHERE monde = ?", (monde,))
        connues = {c for (c,) in cur.fetchall()}
        cur = db.executer("SELECT compte, id, statut FROM participants WHERE monde = ?", (monde,))
        participants = {c: [pid, statut] for c, pid, statut in cur.fetchall()}
        cur = db.executer("SELECT participant, humain FROM rattachements WHERE monde = ?", (monde,))
        rattaches = dict(cur.fetchall())
        candidats = None
        position = 0
        for e in evenements:
            cle, compte = e["cle"], str(e["compte"])
            if cle in connues:
                bilan["doublons"] += 1
                resultats.append({"cle": cle, "statut": "doublon"})
                continue
            connues.add(cle)
            type_ = e["type"]
            if type_ == "message":
                if (e.get("texte") or "").strip().upper() != MOT_CLE_REPLI:
                    statut = "ignore"
                elif not e.get("abonne"):
                    statut = "abonnement_requis"
                    bilan["refuses"] += 1
                else:
                    type_ = "abonnement"
            if type_ == "desabonnement":
                statut = "inconnu"
                if compte in participants:
                    participants[compte][1] = "desabonne"
                    db.executer("UPDATE participants SET statut = 'desabonne' WHERE monde = ? AND compte = ?",
                                (monde, compte))
                    statut = "desabonne"
                    bilan["desabonnes"] += 1
            resultat = {"cle": cle}
            if type_ == "abonnement":
                if compte in participants:
                    pid = participants[compte][0]
                    participants[compte][1] = "actif"
                    db.executer("UPDATE participants SET statut = 'actif', pseudo = COALESCE(?, pseudo) "
                                "WHERE monde = ? AND compte = ?", (e.get("pseudo"), monde, compte))
                    statut = "retrouve"
                    bilan["retrouves"] += 1
                    resultat.update(participant=pid, humain=rattaches.get(pid))
                else:
                    pid = f"P-{len(participants) + 1:06d}"
                    code = secrets.token_urlsafe(9)
                    db.executer("INSERT INTO participants VALUES (?,?,?,?,?,?,?,?)", (
                        monde, pid, compte, e.get("pseudo"), "actif", hacher_code(code), jour, None))
                    participants[compte] = [pid, "actif"]
                    statut = "inscrit"
                    bilan["inscrits"] += 1
                    resultat.update(participant=pid, code_acces=code)
                    if mode == "naissance":
                        db.executer("INSERT INTO boite VALUES (?,?,?,?,?,?,?)", (
                            monde, f"naissance:{pid}", "inscription.naissance", jour + 1, jour, "recu",
                            _json({"cle": f"naissance:{pid}", "type": "inscription.naissance", "participant": pid})))
                        resultat["naissance_jour"] = jour + 1
                    else:
                        if candidats is None:
                            candidats = _candidats(json.loads(etat_json), set(rattaches.values()), graine)
                        if position >= len(candidats):
                            statut = "en_attente"
                        else:
                            humain = candidats[position]
                            position += 1
                            rattaches[pid] = humain
                            db.executer("INSERT INTO rattachements VALUES (?,?,?)", (monde, pid, humain))
                            resultat["humain"] = humain
            resultat["statut"] = statut
            resultats.append(resultat)
            db.executer("INSERT INTO boite VALUES (?,?,?,?,?,?,?)", (
                monde, cle, "inscription." + e["type"], None, jour, statut, _json(e)))
    return bilan


def recevoir_achat(db: Base, monde: str, e: dict) -> dict:
    """Valide un achat confirmé, une annulation ou un changement d'accès, et le date au lendemain.

    Achat : `{cle, type: "achat.confirme", compte, bien, part, acces, usage?, duree_jours?}`.
    Annulation : `{cle, type: "achat.annule", reference}`.
    Changement d'accès : `{cle, type: "acces.modifie", reference, acces, usage?}`.
    """
    with db.transaction():
        ligne = db.executer("SELECT jour, scenario, etat FROM mondes WHERE id = ?", (monde,)).fetchone()
        if not ligne:
            raise KeyError(f"monde inconnu : {monde}")
        jour, scenario, etat = ligne[0], json.loads(ligne[1]), json.loads(ligne[2])
        if db.executer("SELECT 1 FROM boite WHERE monde = ? AND cle = ?", (monde, e["cle"])).fetchone():
            return {"cle": e["cle"], "statut": "doublon"}
        attente = [json.loads(d) for (d,) in db.executer(
            "SELECT data FROM boite WHERE monde = ? AND statut = 'recu' AND type LIKE ?", (monde, "achat.%")).fetchall()]
        erreur = None
        if e["type"] == "achat.confirme":
            bien = scenario["region"]["biens"].get(e.get("bien"))
            part = e.get("part", 0)
            engagee = sum(d["part"] for d in etat["droits"] if d["bien"] == e.get("bien") and d["annule_jour"] is None) \
                + sum(a["part"] for a in attente if a["type"] == "achat.confirme" and a["bien"] == e.get("bien"))
            if not bien or "capacite_passage_kg_jour" not in bien:
                erreur = "bien inconnu ou sans capacité de passage"
            elif not 0 < part <= 1 or engagee + part > 1 + 1e-9:
                erreur = "part invalide ou capacité déjà engagée"
            elif e.get("acces", "commun") not in ("commun", "reserve"):
                erreur = "accès inconnu"
            elif not e.get("compte"):
                erreur = "compte manquant"
        elif e["type"] in ("achat.annule", "acces.modifie"):
            cles = {d["cle"] for d in etat["droits"] if d["annule_jour"] is None} | {a["cle"] for a in attente}
            if e.get("reference") not in cles:
                erreur = "droit de référence introuvable"
            elif e["type"] == "acces.modifie" and e.get("acces") not in ("commun", "reserve"):
                erreur = "accès inconnu"
        else:
            erreur = "type inconnu"
        statut = "rejete" if erreur else "recu"
        db.executer("INSERT INTO boite VALUES (?,?,?,?,?,?,?)", (
            monde, e["cle"], e["type"], None if erreur else jour + 1, jour, statut, _json(e)))
    return {"cle": e["cle"], "statut": statut, "erreur": erreur, "jour_effet": None if erreur else jour + 1}
