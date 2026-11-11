# Bible artistique — Ressources égales

## Parti pris : un paysage peint au pixel, vu du ciel, en plein écran

Le jeu est une vallée, pas une page. Le monde occupe tout l'écran, sans marge ni cadre ; on s'y déplace à la caméra, on s'en approche pour voir vivre les habitants. L'interface est celle d'un jeu : quelques plaques sombres posées sur le paysage, un panneau qui ne s'ouvre que lorsqu'on touche quelque chose.

Références de ton : les cartes illustrées en pixel art à vue plongeante — forêts en canopée, falaises à facettes, champs en patchwork, toits de tuile, eau nuancée.

## Le monde

- **Une seule vallée continue** de 840 × 560 pixels (`src/monde/plan.ts`) : la retenue de La Source dans la montagne au nord-ouest, la rivière qui descend vers le lac des Rives au sud-est, Le Bourg au carrefour des chemins.
- **Vue plongeante trois quarts** : on voit les toits et les façades sud. Lumière de l'ouest et du sud : faces claires vers le spectateur, ombres portées vers le bas à droite.
- **Zoom entier** en pixels d'écran, jamais fractionné ; le plus large couvre toujours tout l'écran.
- Habitants de 5 × 9 px sur la carte (portrait de 12 × 16 px dans la fiche) : leur échelle est celle des maisons. Le dossier de cadrage proposait 16 × 24 px « à valider » ; à cette taille ils écrasaient le paysage.

## Matières

| Matière | Dessin |
|---|---|
| Prairie | quatre verts par saison, posés par l'éclairage du relief ; fond de vallée calme, brins épars, fleurs au printemps |
| Roche | facettes anguleuses (cellules de Voronoï étirées), un ton par pan, fissures sombres ; neige en hiver |
| Forêt | feuillus en houppes à trois tons, serrés du nord au sud ; conifères en pointe sur les hauteurs ; arbres nus en hiver |
| Eau | trois bleus en nappes, reflets mobiles ; le lit de gravier et les rives de sable restent visibles quand le niveau baisse |
| Champs | parallélogrammes en patchwork, sillons tous les trois pixels ; terrasses à murets à Les Terrasses |
| Bâti | murs clairs, toits à deux tons et faîtage ; tuile au Bourg et à La Plaine, brun aux Terrasses, ardoise à La Source, chaume aux Rives |

## Saisons et heures

Cinq palettes (`src/art/palette.ts`) : printemps vif et arbres en fleur, été profond, sécheresse jaunie, automne d'or et de rouille, hiver gris-vert sous la neige. Les bâtiments gardent leurs couleurs.

L'heure tourne : aube rosée, soir doré, nuit bleue ; les fenêtres s'allument, les cheminées fument quand il fait froid. La nuit passe trois fois plus vite que le jour, et s'arrête pendant le défilement de l'année.

## Ce que l'état du monde change à l'image

Tout ce qui compte se voit avant de se lire :

- **Droits réservés** : une couleur n'existe que pour eux, le rose vif `#d12a5c`. Portes grillées et bannières sur l'entrepôt, monde C, fil des causes dans le panneau, trait du ruban.
- **Réserves** : sacs empilés devant chaque grenier, devant l'entrepôt et les silos de secours.
- **Eau** : largeur de la rivière, rives découvertes du lac et de la retenue, rigoles d'irrigation pleines ou à sec.
- **Cultures** : sol nu, pousses, vert plein, blé mûr ; culture sèche pâle et trouée.
- **Entraide** : charrettes sur les chemins ; fanion blanc à croix pour une tournée de secours.
- **Entretien** : la roue de la pompe s'arrête, un fanion jaune puis rouge la signale.

## Interface

- Police **Jersey 10**, dessinée sur une grille de 10 px : toutes les tailles sont 20, 30 ou 40 px. La hiérarchie passe par la couleur (crème, or, gris doux), pas par la graisse.
- Plaques `rgba(18, 24, 28, 0.86)`, bord net de 2 px, sans arrondi ni dégradé.
- En haut à gauche la date ; en haut à droite les mondes A, B, C et trois entrées ; en bas la dernière dépêche et **le ruban de l'année** (saison, débit, stock de l'entrepôt, jours de droit réservé).
- **Comparer** coupe l'écran en trois : le même endroit, le même jour, dans les trois mondes. On déplace les trois caméras ensemble.
- La caméra accompagne l'humain dont la fiche est ouverte.

## Accessibilité

Chaque état a une forme et un libellé en plus de sa couleur. Les noms des communes et des biens sont de vrais liens, atteignables au clavier ; le ruban reste un curseur pour les lecteurs d'écran. Déplacement au clavier (W A S D par position des touches, donc Z Q S D sur un clavier français), zoom + et −, jours aux flèches.
