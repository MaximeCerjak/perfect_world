# ADR-0001 — Moteur Python, état en base, client web Canvas 2D

- **Statut :** accepté (10 novembre 2026)
- **Source :** dossier de cadrage, section 11 « Architecture et tenue en charge »

## Contexte
Le dossier propose un moteur Python versionné, PostgreSQL pour l'état et les événements, une interface web TypeScript avec Canvas 2D, et des adaptateurs distincts pour les entrées externes. Le studio (Claude Code Game Studios) fournit un moteur « Web » : Vite, TypeScript, Vitest, Playwright.

## Décision
1. **Moteur** : paquet `server/ressources_egales`, bibliothèque standard seule. `moteur.avancer_jour` est une fonction pure de (état, scénario, série météo, entrées du jour).
2. **État** : colonnes par attribut, sérialisées en JSON dans `mondes.etat` ; événements, mouvements et mesures en tables. Une journée = une transaction, gardée par `UPDATE … WHERE jour = j - 1` (une seule exécution par monde et par jour).
3. **Base** : le même SQL sert SQLite (défaut, zéro installation) et PostgreSQL (`--db postgresql://…`, pilote `psycopg`). PostgreSQL reste la cible du pilote.
4. **Client** : scaffold web du studio dans `src/`, pixel art dessiné par le code, texte et navigation en HTML (taille de texte constante, clavier, lecteurs d'écran).
5. **Démonstration sans serveur** : `exporter` fige les réponses de l'API dans `data/demo/demo.json`, que le site embarque. Le fichier unique s'ouvre depuis le disque ; c'est lui que pilotent les essais Playwright du studio.
6. **Entrées externes** : `entrees.py` valide et date ; chaque événement reçu a une clé unique en boîte de réception.

## Écarts assumés par rapport au studio
- Un dossier `server/` s'ajoute à la structure du studio : le moteur n'est pas du code de page.
- Les essais du moteur sont en `unittest` dans `tests/engine/` ; `npm test` les lance avant Vitest et Playwright.

## Conséquences
- Rejouer ou reprendre un monde redonne la même empreinte (état, événements, mouvements).
- L'état complet est réécrit chaque jour (≈ 1 Mo à 10 000 habitants) : simple et mesuré ; à normaliser si le monde grandit d'un ordre de grandeur.
- Les vues passées utilisent les mesures du jour choisi, mais la liste des habitants est celle du dernier jour calculé.
