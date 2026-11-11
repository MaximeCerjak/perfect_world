// Le ruban de l'année : une colonne par jour. En bas, la saison ; au-dessus, le
// débit de la rivière en bleu et le stock de l'entrepôt en trait clair ; tout
// en haut, les jours où une part de l'entrepôt est réservée (trait fin) et ceux
// où ce qui reste ouvert ne suffit plus (trait épais).

import { C, PALETTES } from '../art/palette';
import { ambianceDuJour } from '../monde/rendu';
import type { Chronologie, Region } from '../types';

export const RUBAN_L = 365;
export const RUBAN_H = 26;

/** Dessine le ruban de `chrono` avec le curseur sur `jour`. */
export function dessinerRuban(canvas: HTMLCanvasElement, region: Region, chrono: Chronologie, jour: number): void {
  const c = canvas.getContext('2d')!;
  const n = chrono.jours, r = chrono.region;
  const maxDebit = Math.max(...r.debit_m3) || 1, maxDepot = Math.max(...r.depot_kg) || 1;
  c.clearRect(0, 0, RUBAN_L, RUBAN_H);
  for (let x = 0; x < RUBAN_L; x++) {
    const j = Math.min(n - 1, Math.floor((x * n) / RUBAN_L));
    const p = PALETTES[ambianceDuJour(chrono, region, j + 1)];
    c.fillStyle = p.herbe[1]; c.fillRect(x, 20, 1, 6);
    c.fillStyle = p.herbe[3]; c.fillRect(x, 20, 1, 1);
    const h = Math.max(1, Math.round((Math.min(maxDebit * 0.7, r.debit_m3[j]) / (maxDebit * 0.7)) * 13));
    c.fillStyle = '#4f91b6'; c.fillRect(x, 20 - h, 1, h);
    c.fillStyle = '#b9deea'; c.fillRect(x, 20 - h, 1, 1);
    c.fillStyle = '#f3e7c4'; c.fillRect(x, 19 - Math.round((r.depot_kg[j] / maxDepot) * 13), 1, 1);
    if (r.part_reservee[j] > 0) {
      const limite = r.depot_demande_kg[j] > r.depot_passage_commun_kg[j] + 1e-6;
      c.fillStyle = C.droit; c.fillRect(x, 0, 1, limite ? 4 : 1);
    }
  }
  const xj = Math.min(RUBAN_L - 1, Math.round(((jour - 1) * RUBAN_L) / n));
  c.fillStyle = '#fff6da';
  c.fillRect(xj, 0, 1, RUBAN_H);
  c.fillRect(xj - 2, 0, 5, 2); c.fillRect(xj - 1, 2, 3, 1);
}
