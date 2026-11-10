# Game Brief: Ressources égales

## In your words
« J'aimerais que tu développes le jeu dont il est question dans le repo joint, note de cadrage : "Dossier de cadrage — Ressources égales". Tu dois aussi utiliser le dossier Claude-Code-Game-Studios pour développer ce jeu. »

Le dossier de cadrage complet (`../Dossier_de_cadrage_Ressources_egales.docx`, version 0.1 du 10 novembre 2026) fait foi ; cette page le résume pour le studio.

**Pitch:** Suivre la vie d'un humain autonome dans une région en pixel art, et voir ce que les mêmes ressources offrent quand les règles qui déterminent leur accès changent.

**Genre:** simulation sociale en ligne, à observer plus qu'à piloter.

**Controls:** souris ou doigt sur la carte et les liens ; flèches ← → pour changer de jour, Espace pour faire défiler, Échap pour revenir à la carte ; tout lien est atteignable au clavier.

**Question:** peut-on relier plusieurs communes et plusieurs ressources dans un même scénario, faire remonter leurs effets jusqu'au journal d'un humain, puis rejouer l'année avec d'autres droits d'accès et expliquer chaque écart ?

**Hooks:** un journal qui s'ouvre sur ses causes (d'un fait de la vie jusqu'au droit acquis sur l'entrepôt) ; trois trajectoires A, B, C de la même année, où seul le droit change.

**Intent:** no goal to reach · soft or no failure · outside the window (le monde avance entre deux visites) — *from the dossier*

## Look and references
- Look: linogravure saisonnière — tout (carte, page, texte) tient dans cinq tons qui changent avec la saison du jour ; deux encres hors saison, le bleu de l'eau et le magenta des droits réservés ; aplats et trame, pas de cadre. Détail dans `design/art-bible.md`.
- References: 1 sur 8 milliards (suivre une vie), Wyrmfell et Followheim (un personnage par abonné) — cités par le dossier.
- View: 2D · Camera: vue du dessus fixe, trois échelles (région, commune, humain), canevas de 360 × 232 agrandi par un facteur entier ; tuiles de 16 px, humains de 16 × 24 px.

## First minute
La carte montre la rivière, les routes et cinq communes. Une étiquette signale une livraison partielle. On ouvre La Plaine : des habitants vont du logement aux champs. Un fait dit « 5 tournées de secours ». On l'ouvre : la chaîne « Pourquoi » remonte à la livraison partielle, à la capacité commune de l'entrepôt, puis au droit acquis le 29 juillet.

## Challenge
Il n'y a pas d'échec pour le participant. La tension vient du monde : une sécheresse d'été réduit l'irrigation et les récoltes ; à partir de l'automne, la capacité commune de l'entrepôt ne suffit plus dans le cas C et les communes vivent sur des réserves plus courtes.

## Core loop
- Revenir, lire ce qui a changé depuis la dernière visite dans le journal de son humain.
- Ouvrir un fait pour en voir les causes, le lieu et les suites.
- Comparer le même jour dans les trajectoires A, B et C.

## Goal & fail state
- Une visite est complète quand le participant a retrouvé son humain et relié un fait de son journal à un événement de la région. Le prototype est réussi quand la recette minimale du dossier passe (`python -m ressources_egales recette`).

## Features
- [x] Région pilote de cinq communes, données et hypothèses versionnées (`data/scenario/`)
- [x] Moteur journalier : eau, alimentation, énergie et transport, temps humain, droits d'accès ; bilans vérifiés chaque jour
- [x] Rejeu, reprise après interruption, comparaison A/B/C avec écarts reliés à leurs causes
- [x] Entrées de test : inscriptions (abonnement, message « NAÎTRE », désabonnement) et achats (confirmé, annulé, accès modifié), idempotentes
- [x] Région visitable : la vallée, vue de commune, fiche et journal, fiche d'un bien, scène « trois mondes »
- [ ] Parcours Instagram réel au clic sur « Suivre » (à prouver sur une page de test)
- [ ] Service de paiement réel (phase 2, après décision d'ouverture)

## Your systems
- Eau · in the slice
- Alimentation · in the slice
- Énergie et transport · in the slice
- Temps humain · in the slice
- Droits d'accès · in the slice
- Habitants et vie collective · in the slice
- Chroniques Instagram · later
- Achats réels · thin stand-in

## Keep
-

## Avoid
- Aucune donnée personnelle dans le récit public : noms fictifs, association participant–humain dans l'espace personnel seulement.
- Aucune valeur de jeu dans le code : tout est dans `data/scenario/`.

## Out of scope
- Intégration Meta/Manychat réelle, paiement réel, modération, comptes — étapes 4 et 5 du plan.
- Jeux de données réels (Hub'Eau, Agreste, Insee, éCO2mix) : deuxième niveau de validation.
- Mariages, déménagements et héritage du compte à la fin d'une vie : décisions ouvertes du dossier.

## Build order
1. Règles et données — fait
2. Moteur et rapports de bilan — fait
3. Région visitable — fait
4. Pilote fermé (charge mesurée ; parcours Instagram à valider avec des comptes de test)
5. Ouverture
