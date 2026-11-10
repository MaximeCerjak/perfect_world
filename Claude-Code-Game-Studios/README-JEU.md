# Ressources égales — prototype de la région pilote

Simulation sociale : cinq communes sur un même bassin versant, un moteur qui calcule chaque journée (eau, alimentation, énergie et transport, temps humain, droits d'accès) et un site en pixel art pour suivre une vie et remonter d'un fait à ses causes. Cadrage : `../Dossier_de_cadrage_Ressources_egales.docx` ; résumé : `design/game-brief.md`.

## Démarrer

Prérequis : Python 3.11+ (aucune dépendance), Node 22.12+.

```bash
npm ci
```

```bash
npm run build:single
```

Ouvrir `dist-single/index.html` : le site fonctionne sans serveur, avec trois trajectoires A, B, C d'une région de 600 habitants.

Avec le serveur (un seul monde partagé qui avance) :

```bash
npm run build
```

```bash
PYTHONPATH=server python3 -m ressources_egales comparer --population 1000
```

```bash
PYTHONPATH=server python3 -m ressources_egales servir --entrees-test
```

Puis http://127.0.0.1:8000/. Pour un monde vivant : `creer principal`, puis `servir --monde principal --cadence 30` (une journée simulée toutes les 30 secondes).

## Commandes du moteur

`PYTHONPATH=server python3 -m ressources_egales [--db fichier.db | --db postgresql://…] <commande>`

| Commande | Effet |
|---|---|
| `comparer [--population N] [--hypothese cle=valeur]` | Simule A, B, C sur la même année et affiche les écarts reliés à leurs causes |
| `recette [--population 10000] [--inscriptions 5000]` | Déroule la recette minimale du dossier et mesure les durées |
| `creer <monde> [--cas A\|B\|C] [--inscription humain_disponible\|naissance]` | Crée un monde au jour 0 |
| `avancer <monde> --jours N` | Avance ; reprend toujours au dernier jour validé |
| `inscrire <monde> --nombre N --repetitions M` | Injecte des inscriptions de test |
| `acheter <monde> '<json>'` | Achat de test, annulation ou changement d'accès |
| `exporter A B C` | Écrit le jeu de démonstration lu par le site |

Essai de sensibilité, par exemple sans prêt d'équipe : `comparer --hypothese entraide.pret_equipe=false`.

## Essais

```bash
npm test
```

Lance les essais du moteur (`tests/engine`, 25), des règles du site (`tests/unit`, 12) et du navigateur (`tests/integration`, 6). Captures retenues : `production/qa/evidence/`.

## Où sont les choses

| Dossier | Contenu |
|---|---|
| `data/scenario/` | Territoire (pour 1 000 habitants), hypothèses (unité, nature, plage à tester), cas A/B/C |
| `server/ressources_egales/` | `moteur.py` (une journée), `vie.py`, `bilans.py`, `monde.py` (reprise), `entrees.py`, `service.py` (vues), `api.py`, `recit.py` |
| `src/` | Site : `game/rules.ts` (règles de lecture), `art/` et `vues/` (pixel art), `main.ts` |
| `docs/architecture/` | Décisions d'architecture |

## Ce que le prototype mesure aujourd'hui (1 000 habitants, graine du dossier)

- A et B : mêmes conditions d'usage, mêmes résultats ; B ne change que la part de capacité dépendant d'un compte (40 %).
- C : la capacité commune (720 kg/j sur 1 200) ne suffit plus pendant environ 93 jours à partir de la fin novembre ; les greniers de quatre communes descendent de 11 à 5 jours de réserve, environ 7 t viennent de la réserve de secours, une quinzaine d'heures d'entretien de pompe sont reportées à La Source. Aucun besoin alimentaire n'est laissé non couvert : l'entraide absorbe l'écart.
- 10 000 habitants : environ 20 ms par journée (calcul et écriture SQLite) sur la machine d'essai.

Ces valeurs illustrent des règles à tester ; elles ne valent que pour les hypothèses de `data/scenario/`.

## Limites connues

- Parcours Instagram : seuls les événements de test existent ; le signal réel au clic sur « Suivre » reste à prouver (section 03 du dossier).
- Paiements : événements de test seulement.
- Données : ordres de grandeur et hypothèses ; aucune série réelle n'est encore importée.
- La part réservée de l'entrepôt ne transporte rien pour les communes (hypothèse « flux privés du titulaire »).
- L'énergie suit un ordre de priorité fixe : eau des foyers, conservation, transport, irrigation.
