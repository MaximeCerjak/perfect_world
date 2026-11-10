# Bible artistique — Ressources égales

## Parti pris : une linogravure saisonnière

Le monde est imprimé, pas illustré. À chaque instant, tout ce qui se voit (carte, page, texte, portraits) tient dans **une gamme de cinq tons** qui est celle de la saison du jour affiché. Changer de jour, c'est changer d'encre : la sécheresse jaunit la page entière, l'hiver la bleuit. On sent la saison avant de lire une ligne.

Deux encres seulement échappent à la saison, parce que ce sont les deux sujets du jeu :

| Encre | Valeur | Réservée à |
|---|---|---|
| Bleu de l'eau | `#2a76b4` (reflet `#8fc5e8`) | la rivière, la retenue, le lac, l'eau d'irrigation, le débit sur le ruban |
| Magenta du tampon | `#c81e5a` | un droit réservé, et rien d'autre : portes barrées de l'entrepôt, monde C, fil des causes qui remonte à l'achat |

Le magenta n'est jamais une couleur d'alerte générale. Une pénurie due à la sécheresse reste dans la gamme ; seule une conséquence d'un droit réservé prend le tampon.

## Les gammes (du ton 0, le plus sombre, au ton 4, le plus clair)

| Saison | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Printemps | `#14302a` | `#2c5a45` | `#5c9163` | `#a8c98c` | `#e6eecb` |
| Été | `#1d3320` | `#41672d` | `#84a141` | `#c6d07c` | `#f1efc3` |
| Sécheresse | `#3a2413` | `#7b4a1e` | `#b9832e` | `#e2bf69` | `#f8eaba` |
| Automne | `#35202b` | `#703b34` | `#b36a3a` | `#e3a968` | `#f8e3be` |
| Hiver | `#1b2234` | `#3c4a68` | `#7a8aa8` | `#bcc7d8` | `#eef2f6` |

Rôles : 4 = papier (fond de page, murs, clairières) ; 3 = prairie ; 2 = terre travaillée ; 1 = toits, bois, rangs de culture ; 0 = texte, silhouettes, digues. La nuit descend la gamme d'un ou deux tons et allume les fenêtres au ton 4.

## Règles de dessin

- Canevas de 360 × 232, agrandi par un facteur entier en pixels d'écran. Tuiles de 16 px, humains dans une boîte de 16 × 24.
- Aplats et **trame de Bayer** 4 × 4 ; aucun fondu, aucun contour noir, aucune couleur hors gamme.
- Le monde n'a pas de cadre : ses bords se dissolvent dans la page par la trame.
- Le relief se dit en courbes de niveau, comme sur une carte ; les chemins sont clairs et pointillés, l'eau pleine et bleue : on les distingue par la forme autant que par le ton.
- Ce qui compte se lit dans le monde avant le texte : la jauge d'un grenier, les cinq portes de l'entrepôt (une par tranche de capacité, barrée de magenta quand elle est réservée), le lit clair d'une rivière basse, les rangs troués d'un champ sec, le fanion d'une tournée de secours.
- Les habitants sont des silhouettes sombres à visage clair ; la coiffe suit l'activité, la taille suit l'âge. L'humain suivi porte un fanion.

## Typographie

Une seule famille, **Bricolage Grotesque** (variable). Titres et dates en graisse 800, chasse étroite ; le texte courant en 400, chasse normale. La date du jour est l'élément le plus gros de la page. Pas de capitales d'étiquette, pas de monospace.

## Page

- La page n'a ni barre, ni carte d'interface, ni tableau de bord : du texte posé sur le papier de la saison, à droite d'un monde sans cadre.
- **Le ruban de l'année** remplace le curseur : une colonne par jour, la saison en bas, le débit en bleu, le stock de l'entrepôt en trait, les jours de droit réservé en magenta.
- **Trois mondes** remplace le tableau comparatif : trois fois la même vallée le même jour, d'amont en aval. Les chiffres (jours de réserve) sont écrits dans le monde, en pixels. Le texte raconte ce qui diffère et propose des vies à suivre.
- Les faits se suivent sur un fil vertical ; le fil devient magenta quand le fait tient au droit acquis.

## Accessibilité

Chaque état a une forme et un libellé en plus du ton. Texte à taille constante, hors du canevas. Tout lien est atteignable au clavier ; le ruban reste un curseur pour les lecteurs d'écran. Contraste du texte (ton 0 sur ton 4) supérieur à 10:1 dans les cinq gammes.
