// Le ruban de l'année : une colonne par jour. En bas, la saison ; au-dessus, le
// débit de la rivière en bleu et le stock de l'entrepôt en trait sombre ; tout
// en haut, en magenta, les jours où une part de l'entrepôt est réservée (trait
// fin) et ceux où la capacité commune ne suffit plus (trait épais).

import { ENCRE_DROIT, ENCRE_EAU, GAMMES, type Ambiance } from '../art/dessin';
import type { Chronologie, Region } from '../types';
import { ambianceDuJour } from './carte';

export const RUBAN_L = 365;
export const RUBAN_H = 30;

/** Dessine le ruban de `chrono` avec le curseur sur `jour`. */
export function dessinerRuban(canvas: HTMLCanvasElement, region: Region, chrono: Chronologie, jour: number): void {
  const c = canvas.getContext('2d')!;
  const n = chrono.jours, r = chrono.region;
  const maxDebit = Math.max(...r.debit_m3) || 1, maxDepot = Math.max(...r.depot_kg) || 1;
  const actuelle = GAMMES[ambianceDuJour(chrono, region, jour)];
  c.clearRect(0, 0, RUBAN_L, RUBAN_H);
  for (let x = 0; x < RUBAN_L; x++) {
    const j = Math.min(n - 1, Math.floor((x * n) / RUBAN_L));
    const g = GAMMES[ambianceDuJour(chrono, region, j + 1) as Ambiance];
    c.fillStyle = g[2]; c.fillRect(x, 24, 1, 6);
    c.fillStyle = g[3]; c.fillRect(x, 23, 1, 1);
    const h = Math.max(1, Math.round((Math.min(maxDebit * 0.7, r.debit_m3[j]) / (maxDebit * 0.7)) * 15));
    c.fillStyle = ENCRE_EAU; c.fillRect(x, 22 - h, 1, h);
    c.fillStyle = actuelle[0]; c.fillRect(x, 21 - Math.round((r.depot_kg[j] / maxDepot) * 14), 1, 1);
    if (r.part_reservee[j] > 0) {
      const limite = r.depot_demande_kg[j] > r.depot_passage_commun_kg[j] + 1e-6;
      c.fillStyle = ENCRE_DROIT; c.fillRect(x, 1, 1, limite ? 4 : 1);
    }
  }
  const xj = Math.min(RUBAN_L - 1, Math.round(((jour - 1) * RUBAN_L) / n));
  c.fillStyle = actuelle[0];
  c.fillRect(xj, 0, 1, RUBAN_H);
  c.fillRect(xj - 2, 0, 5, 2); c.fillRect(xj - 1, 2, 3, 1);
}
