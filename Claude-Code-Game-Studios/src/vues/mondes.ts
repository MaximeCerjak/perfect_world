// « Le même jour, dans trois mondes » : la comparaison des trajectoires, dessinée
// comme une scène. Chaque bande est la même vallée, le même jour ; seuls les
// droits sur l'entrepôt changent. Les greniers portent leurs jours de réserve,
// les portes de l'entrepôt disent qui y accède, les charrettes disent qui livre.

import { HAUTEUR, LARGEUR, charrette, chemin, chiffres, entrepot, maison, palette, peindreSol, pompe, rect, riviere, silo, type Ambiance, type Palette } from '../art/dessin';
import { mesuresDuJour } from '../game/rules';
import type { Chronologie, Region } from '../types';
import { ambianceDuJour } from './carte';

type Ctx = CanvasRenderingContext2D;
export const HAUTEUR_BANDE = 72;
const X: Record<string, number> = { source: 44, terrasses: 104, bourg: 176, plaine: 250, rives: 314 };
const fonds = new Map<string, HTMLCanvasElement>();

/** Haut de la bande `i` (0 à 2). */
export function hautBande(i: number): number { return 6 + i * (HAUTEUR_BANDE + 2); }

function fond(ambiance: Ambiance, p: Palette): HTMLCanvasElement {
  let f = fonds.get(ambiance);
  if (f) return f;
  f = document.createElement('canvas'); f.width = LARGEUR; f.height = HAUTEUR;
  const c = f.getContext('2d')!;
  peindreSol(c, p, 5, () => 0, 14);
  for (let i = 1; i < 3; i++) rect(c, 0, hautBande(i) - 2, LARGEUR, 2, p.t[4]);
  fonds.set(ambiance, f);
  return f;
}

/** Dessine les mondes côte à côte pour le même `jour` ; `actif` est l'indice du monde affiché ailleurs. */
export function dessinerMondes(c: Ctx, region: Region, mondes: { id: string; chrono: Chronologie }[], jour: number, t: number, actif: number): void {
  if (!mondes.length) return;
  const ambiance = ambianceDuJour(mondes[0].chrono, region, jour), p = palette(ambiance);
  c.drawImage(fond(ambiance, p), 0, 0);
  mondes.slice(0, 3).forEach((mo, i) => {
    const y = hautBande(i), ch = mo.chrono, r = mesuresDuJour(ch, 'region', jour);
    const max = (cle: string): number => Math.max(...ch.region[cle]) || 1;
    const lit: [number, number][] = [];
    for (let x = 10; x <= LARGEUR - 10; x += 4) lit.push([x, y + 62 + Math.sin(x / 24 + i) * 2]);
    riviere(c, lit, p, Math.max(0.1, Math.min(1, (r.debit_m3 ?? 0) / (max('debit_m3') * 0.55))), 4, t);
    for (const co of region.communes) if (co.id !== 'bourg') chemin(c, [[X.bourg, y + 24], [X.bourg, y + 28], [X[co.id], y + 28], [X[co.id], y + 34]], p);
    entrepot(c, X.bourg - 22, y + 4, 44, 19, p, (r.depot_kg ?? 0) / max('depot_kg'), r.part_reservee ?? 0);
    for (const co of region.communes) {
      const x = X[co.id], m = mesuresDuJour(ch, co.id, jour);
      const jours = m.jours_reserve ?? 0;
      entrepot(c, x - 9, y + 34, 18, 12, p, Math.min(1, jours / 30));
      maison(c, x + 12, y + 39, 6, 6, p, false, x); maison(c, x - 19, y + 41, 6, 6, p, false, x + 1);
      const texte = `${jours >= 100 ? 99 : Math.round(jours)}j`;
      const bas = jours < 6;
      if (bas) rect(c, x - 7, y + 49, texte.length * 4 + 3, 9, p.t[0]);
      chiffres(c, texte, x - 5, y + 51, bas ? p.t[4] : p.t[0]);
      if (co.id === 'rives') silo(c, x + 22, y + 22, p, (r.secours_kg ?? 0) / max('secours_kg'));
      if ((m.arriere_h ?? 0) > 0.3 || (m.pompe_etat ?? 1) < 0.99) pompe(c, x - 30, y + 49, p, Math.min(m.pompe_etat ?? 1, 0.8), t);
      if ((m.servi_depot_kg ?? 0) > 1 && co.id !== 'bourg') {
        const f = (t * 0.12 + x * 0.013) % 1;
        charrette(c, Math.round(X.bourg + (x - X.bourg) * f), y + 27, p, false);
      }
      if ((m.secours_kg ?? 0) > 1 && co.id !== 'rives') {
        const f = (t * 0.1 + x * 0.007) % 1;
        charrette(c, Math.round(X.rives + (x - X.rives) * f), y + 29, p, true);
      }
    }
    // Lettre du monde, et un repère pour celui que la carte affiche.
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) chiffres(c, 'ABC'[i], 8 + dx, y + 8 + dy, p.t[0]);
    chiffres(c, 'ABC'[i], 8, y + 8, p.t[0]);
    if (i === actif) { rect(c, 4, y + 4, 1, 14, p.t[0]); rect(c, 4, y + 4, 4, 1, p.t[0]); rect(c, 4, y + 17, 4, 1, p.t[0]); }
  });
}
