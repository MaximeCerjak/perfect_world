"""Essais du moteur : bilans, reprise, répétition et comparaison des droits.

Lancer depuis la racine du projet : `python -m unittest discover -s tests/engine`
Les mondes d'essai comptent 1 000 habitants (l'échelle de référence des données) pour rester rapides ; la recette à
10 000 habitants se lance avec `python -m ressources_egales recette`.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))

from ressources_egales import bilans, entrees, meteo, monde, moteur, parametres, population  # noqa: E402
from ressources_egales.service import Service  # noqa: E402
from ressources_egales.stockage import Base  # noqa: E402

POPULATION = 1000
JOURS = 365
ACHAT = {"cle": "achat-essai", "type": "achat.confirme", "compte": "compte-essai", "bien": "depot", "part": 0.4,
         "acces": "reserve"}


def base() -> Base:
    return Base(":memory:")


def simuler(db: Base, mid: str, cas: str, jours: int = JOURS, **options) -> None:
    monde.creer_monde(db, mid, mid, POPULATION, cas=cas, **options)
    monde.avancer(db, mid, jours)


class RegleDePartage(unittest.TestCase):
    """L'exemple du dossier : 1 200 kg/jour de passage, 40 % réservés, 720 kg/jour en accès commun."""

    def test_part_reservee_laisse_720_kg_sur_1200(self):
        scenario = parametres.charger_scenario(1000)
        passage = scenario["region"]["biens"]["depot"]["capacite_passage_kg_jour"]
        etat = {"droits": [{"bien": "depot", "debut": 10, "fin": None, "annule_jour": None, "compte": "c",
                            "part": 0.4, "acces": "reserve"}]}
        reservee, comptes = moteur.part_reservee(etat, "depot", 10)
        self.assertEqual(passage, 1200)
        self.assertAlmostEqual(passage * (1 - reservee), 720)
        self.assertAlmostEqual(900 - passage * (1 - reservee), 180)
        self.assertEqual(comptes, {"c": 0.4})

    def test_droit_inactif_avant_son_debut_et_apres_annulation(self):
        droit = {"bien": "depot", "debut": 10, "fin": 20, "annule_jour": None, "compte": "c", "part": 0.4,
                 "acces": "reserve"}
        self.assertEqual(moteur.part_reservee({"droits": [droit]}, "depot", 9)[0], 0)
        self.assertEqual(moteur.part_reservee({"droits": [droit]}, "depot", 21)[0], 0)
        self.assertEqual(moteur.part_reservee({"droits": [dict(droit, annule_jour=12)]}, "depot", 15)[0], 0)

    def test_acces_commun_ne_reserve_rien(self):
        droit = {"bien": "depot", "debut": 1, "fin": None, "annule_jour": None, "compte": "c", "part": 0.4,
                 "acces": "commun"}
        reservee, comptes = moteur.part_reservee({"droits": [droit]}, "depot", 5)
        self.assertEqual(reservee, 0)
        self.assertEqual(comptes, {"c": 0.4})


class Journee(unittest.TestCase):
    """Chaque journée respecte la conservation des stocks, les capacités et les budgets."""

    def test_bilans_equilibres_sur_une_annee_avec_droits_reserves(self):
        scenario = parametres.charger_scenario(POPULATION)
        jeux = parametres.charger_cas()
        serie = meteo.generer_serie(scenario["region"]["meteo"], JOURS, jeux["graine"])
        etat = population.creer_etat_initial(scenario, jeux["graine"])
        ctx = moteur.Contexte(scenario, serie, jeux["graine"])
        evenements = jeux["cas"]["C"]["evenements"]
        for jour in range(1, JOURS + 1):
            avant = bilans.stocks(etat)
            resultat = moteur.avancer_jour(etat, ctx, [e for e in evenements if e["jour_effet"] == jour])
            self.assertEqual(bilans.verifier_jour(avant, bilans.stocks(etat), resultat, ctx), [], f"jour {jour}")
            region = resultat["mesures"]["region"]
            self.assertLessEqual(region["depot_servi_kg"], region["depot_passage_commun_kg"] + 1e-6)
            self.assertGreaterEqual(region["energie_reste_kwh"], -1e-6)

    def test_marchandise_en_transit_reste_comptee(self):
        scenario = parametres.charger_scenario(POPULATION)
        serie = meteo.generer_serie(scenario["region"]["meteo"], 5, 1)
        etat = population.creer_etat_initial(scenario, 1)
        ctx = moteur.Contexte(scenario, serie, 1)
        total = lambda: sum(v for k, v in bilans.stocks(etat).items() if k != "reserve")  # noqa: E731
        avant = total()
        r = moteur.avancer_jour(etat, ctx, [])
        sorties = sum(q for (res, de, vers, nature), q in r["mouvements"].items()
                      if res == "denrees" and vers.startswith(("usage:", "perte:")))
        entrees_ = sum(q for (res, de, vers, nature), q in r["mouvements"].items() if de.startswith("champ:"))
        self.assertGreater(r["mesures"]["region"]["transit_kg"], 0)
        self.assertAlmostEqual(total(), avant - sorties + entrees_, places=6)

    def test_meme_graine_meme_serie_meteo(self):
        meteo_ = parametres.charger_scenario(POPULATION)["region"]["meteo"]
        self.assertEqual(meteo.generer_serie(meteo_, 400, 42), meteo.generer_serie(meteo_, 400, 42))
        self.assertNotEqual(meteo.generer_serie(meteo_, 400, 42), meteo.generer_serie(meteo_, 400, 43))


class Monde(unittest.TestCase):
    """Répétition, reprise et exécution unique d'une journée."""

    @classmethod
    def setUpClass(cls):
        cls.db = base()
        cls.addClassCleanup(cls.db.fermer)
        for cas in "ABC":
            simuler(cls.db, cas, cas)
        cls.comparaison = Service(cls.db).comparaison(["A", "B", "C"])

    def test_meme_scenario_relance_meme_empreinte(self):
        simuler(self.db, "C-bis", "C")
        self.assertEqual(monde.empreinte(self.db, "C"), monde.empreinte(self.db, "C-bis"))

    def test_interruption_puis_reprise_meme_empreinte(self):
        monde.creer_monde(self.db, "C-coupe", "C-coupe", POPULATION, cas="C")

        def couper(jour):
            if jour in (33, 151, 290):
                raise KeyboardInterrupt

        for _ in range(4):
            try:
                monde.avancer(self.db, "C-coupe", JOURS, arret_apres=couper)
            except KeyboardInterrupt:
                pass
        self.assertEqual(monde.charger(self.db, "C-coupe")["jour"], JOURS)
        self.assertEqual(monde.empreinte(self.db, "C"), monde.empreinte(self.db, "C-coupe"))

    def test_une_journee_ne_se_calcule_qu_une_fois(self):
        monde.creer_monde(self.db, "unique", "unique", POPULATION)
        monde.avancer(self.db, "unique", 3)
        etat = self.db.lire_un("SELECT etat FROM mondes WHERE id = 'unique'")[0]
        cur = self.db.executer("UPDATE mondes SET jour = 3, etat = ? WHERE id = 'unique' AND jour = 2", (etat,))
        self.assertEqual(cur.rowcount, 0)
        self.assertEqual(monde.charger(self.db, "unique")["jour"], 3)

    def test_monde_s_arrete_a_son_dernier_jour(self):
        monde.creer_monde(self.db, "court", "court", POPULATION, jours_max=5)
        self.assertEqual(monde.avancer(self.db, "court", 30)["jours"], 5)

    def test_cas_a_et_b_donnent_les_memes_resultats(self):
        self.assertTrue(self.comparaison["ecarts"][0]["identique"])
        self.assertEqual(self.comparaison["mondes"][1]["region"]["concentration_max"], 0.4)

    def test_cas_c_s_explique_par_des_evenements_dates(self):
        ecart = self.comparaison["ecarts"][1]
        self.assertFalse(ecart["identique"])
        self.assertGreater(self.comparaison["mondes"][2]["region"]["jours_limites_par_droits"], 0)
        types = {e["type"] for e in ecart["evenements_nouveaux"]}
        self.assertTrue({"droit.acquis", "depot.acces_limite", "livraison.partielle"} <= types)
        service = Service(self.db)
        for e in ecart["evenements_nouveaux"]:
            if e["type"] == "droit.acquis":
                continue
            chaine = service.evenement("C", e["id"])
            racines = {x["type"] for x in chaine["causes"].values()}
            self.assertTrue(e["causes"], f"{e['type']} sans cause")
            self.assertTrue(racines, f"{e['type']} : causes introuvables")

    def test_cas_a_ne_connait_pas_de_besoin_non_couvert(self):
        for commune in self.comparaison["mondes"][0]["communes"].values():
            self.assertEqual(commune["non_couvert_kg"], 0)

    def test_achat_annule_rend_la_capacite_commune(self):
        monde.creer_monde(self.db, "annule", "annule", POPULATION)
        monde.avancer(self.db, "annule", 10)
        self.assertEqual(entrees.recevoir_achat(self.db, "annule", ACHAT)["jour_effet"], 11)
        self.assertEqual(entrees.recevoir_achat(self.db, "annule", ACHAT)["statut"], "doublon")
        monde.avancer(self.db, "annule", 5)
        self.assertAlmostEqual(Service(self.db).bien("annule", "depot")["part_reservee"], 0.4)
        entrees.recevoir_achat(self.db, "annule", {"cle": "annulation", "type": "achat.annule", "reference": "achat-essai"})
        monde.avancer(self.db, "annule", 2)
        fiche = Service(self.db).bien("annule", "depot")
        self.assertEqual(fiche["part_reservee"], 0)
        self.assertEqual([e["type"] for e in fiche["changements"]], ["droit.acquis", "droit.annule"])

    def test_achat_invalide_est_rejete(self):
        monde.creer_monde(self.db, "rejet", "rejet", POPULATION)
        for e in (dict(ACHAT, cle="r1", part=1.4), dict(ACHAT, cle="r2", bien="atelier"),
                  {"cle": "r3", "type": "achat.annule", "reference": "inconnu"}):
            self.assertEqual(entrees.recevoir_achat(self.db, "rejet", e)["statut"], "rejete")
        entrees.recevoir_achat(self.db, "rejet", dict(ACHAT, cle="r4", part=0.7))
        self.assertEqual(entrees.recevoir_achat(self.db, "rejet", dict(ACHAT, cle="r5", part=0.4))["statut"], "rejete")


class Inscriptions(unittest.TestCase):
    """Une seule association par abonné, quel que soit le nombre de répétitions."""

    def setUp(self):
        self.db = base()
        self.addCleanup(self.db.fermer)
        monde.creer_monde(self.db, "m", "m", POPULATION)

    def abonner(self, n, prefixe="ig"):
        return [{"cle": f"{prefixe}-evt-{i}", "type": "abonnement", "compte": f"{prefixe}-{i}"} for i in range(n)]

    def test_rafale_avec_repetitions(self):
        evenements = self.abonner(200)
        bilan = entrees.traiter_inscriptions(self.db, "m", evenements + evenements[:80] + evenements[50:120])
        self.assertEqual((bilan["inscrits"], bilan["doublons"]), (200, 150))
        n, distincts = self.db.lire_un("SELECT COUNT(*), COUNT(DISTINCT humain) FROM rattachements")
        self.assertEqual((n, distincts), (200, 200))
        self.assertEqual(entrees.traiter_inscriptions(self.db, "m", evenements)["doublons"], 200)

    def test_les_foyers_recoivent_un_participant_avant_d_en_recevoir_deux(self):
        entrees.traiter_inscriptions(self.db, "m", self.abonner(60))
        etat = monde.charger(self.db, "m")["etat"]
        foyers = [etat["humains"]["foyer"][h] for (h,) in self.db.lire("SELECT humain FROM rattachements")]
        self.assertEqual(len(foyers), len(set(foyers)))

    def test_desabonnement_puis_reabonnement_retrouve_le_meme_humain(self):
        premier = entrees.traiter_inscriptions(self.db, "m", self.abonner(1))["resultats"][0]
        suite = entrees.traiter_inscriptions(self.db, "m", [
            {"cle": "d1", "type": "desabonnement", "compte": "ig-0"},
            {"cle": "a2", "type": "abonnement", "compte": "ig-0", "pseudo": "nouveau_pseudo"}])["resultats"]
        self.assertEqual([r["statut"] for r in suite], ["desabonne", "retrouve"])
        self.assertEqual(suite[1]["humain"], premier["humain"])
        self.assertEqual(suite[1]["participant"], premier["participant"])

    def test_message_naitre_exige_l_abonnement(self):
        r = entrees.traiter_inscriptions(self.db, "m", [
            {"cle": "m1", "type": "message", "compte": "x", "texte": "naître", "abonne": False},
            {"cle": "m2", "type": "message", "compte": "x", "texte": " NAÎTRE ", "abonne": True},
            {"cle": "m3", "type": "message", "compte": "y", "texte": "bonjour", "abonne": True}])["resultats"]
        self.assertEqual([x["statut"] for x in r], ["abonnement_requis", "inscrit", "ignore"])

    def test_code_d_acces_ouvre_le_journal_rattache(self):
        r = entrees.traiter_inscriptions(self.db, "m", self.abonner(1))["resultats"][0]
        service = Service(self.db)
        moi = service.moi(r["code_acces"])
        self.assertEqual((moi["humain"], moi["derniere_visite_jour"]), (r["humain"], None))
        monde.avancer(self.db, "m", 2)
        self.assertEqual(service.moi(r["code_acces"])["derniere_visite_jour"], 0)
        with self.assertRaises(PermissionError):
            service.moi("mauvais-code")

    def test_parcours_naissance_rattache_un_nouveau_ne_le_lendemain(self):
        db = base()
        self.addCleanup(db.fermer)
        monde.creer_monde(db, "n", "n", POPULATION, mode_inscription="naissance")
        r = entrees.traiter_inscriptions(db, "n", self.abonner(3))["resultats"]
        self.assertEqual(db.lire_un("SELECT COUNT(*) FROM rattachements")[0], 0)
        monde.avancer(db, "n", 1)
        etat = monde.charger(db, "n")["etat"]
        lignes = db.lire("SELECT participant, humain FROM rattachements ORDER BY participant")
        self.assertEqual([p for p, _ in lignes], [x["participant"] for x in r])
        for _, humain in lignes:
            self.assertEqual(etat["humains"]["naissance"][humain], 1)


class Vues(unittest.TestCase):
    """Du journal d'un humain à l'événement de la région."""

    @classmethod
    def setUpClass(cls):
        cls.db = base()
        cls.addClassCleanup(cls.db.fermer)
        simuler(cls.db, "C", "C")
        cls.service = Service(cls.db)

    def test_un_fait_du_journal_remonte_a_l_achat_du_droit(self):
        tournees = [e for e in self.service.evenements_lieu("C", "plaine")["evenements"] if e["type"] == "secours.tournee"]
        self.assertTrue(tournees)
        chaine = self.service.evenement("C", tournees[0]["id"])
        self.assertIn("droit.acquis", {e["type"] for e in chaine["causes"].values()})

    def test_fiche_humain_tient_dans_24_heures(self):
        for hi in range(0, POPULATION, 7):
            fiche = self.service.humain("C", hi)
            self.assertAlmostEqual(sum(fiche["journee"].values()), 24, places=1, msg=f"humain {hi}")
            self.assertGreaterEqual(fiche["journee"]["libre"], 0)

    def test_chronologie_couvre_chaque_jour(self):
        chrono = self.service.chronologie("C")
        self.assertEqual(chrono["jours"], JOURS)
        self.assertEqual(len(chrono["communes"]["plaine"]["jours_reserve"]), JOURS)
        self.assertEqual(max(chrono["region"]["part_reservee"]), 0.4)

    def test_fiche_du_bien_decrit_le_droit_et_l_offre(self):
        fiche = self.service.bien("C", "depot")
        self.assertEqual(fiche["acces"], "en partie réservé")
        self.assertAlmostEqual(fiche["passage"]["commun_kg_jour"], 0.6 * fiche["passage"]["capacite_kg_jour"])
        self.assertEqual(fiche["changements"][0]["type"], "droit.acquis")
        self.assertIn("effet_si_reserve", fiche["offre"])


if __name__ == "__main__":
    unittest.main()
