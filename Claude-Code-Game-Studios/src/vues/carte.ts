// Carte régionale : rivière, routes, relief et communes, d'après l'état calculé du jour.

import { C, HAUTEUR, LARGEUR, arbre, charrette, courbe, entrepot, maison, pluie, pointSur, rect, silo, sol, trait, champ, type Ambiance } from '../art/dessin';
import { alea, mesuresDuJour } from '../game/rules';
import type { Chronologie, Region } from '../types';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** Position d'une commune sur la carte de 360 × 232. */
export function positionCommune(carte: [number, number]): Pt {
  return [Math.round((carte[0] * LARGEUR) / 64), Math.round((carte[1] * (HAUTEUR - 16)) / 32) + 6];
}

/** Ambiance du jour : la saison, ou la sécheresse quand le débit est très bas. */
export function ambianceDuJour(chrono: Chronologie, region: Region & { episodes?: { debut_jour: number; fin_jour: number }[] }, jour: number): Ambiance {
  const seche = (region.episodes ?? []).some(e => jour >= e.debut_jour + 10 && jour <= e.fin_jour);
  return seche ? 'sécheresse' : ((chrono.saisons[Math.max(0, jour - 1)] ?? 'printemps') as Ambiance);
}

function tracerRoute(a: Pt, b: Pt, i: number): Pt[] {
  const mx = (a[0] + b[0]) / 2 + (i % 2 ? 8 : -8), my = (a[1] + b[1]) / 2 + (i % 2 ? -6 : 6);
  return courbe([a, [mx, my], b], 10);
}

/** Dessine la carte régionale pour `jour` ; `t` est le temps d'animation en secondes. */
export function dessinerCarte(c: Ctx, region: Region, chrono: Chronologie, jour: number, t: number, selection: string | null): void {
  const ambiance = ambianceDuJour(chrono, region, jour);
  const r = mesuresDuJour(chrono, 'region', jour);
  const pos: Record<string, Pt> = {};
  for (const co of region.communes) pos[co.id] = positionCommune(co.carte);
  sol(c, ambiance, 1);

  // Relief au nord-ouest : bandes plus sombres et rochers.
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(alea(i, 21) * 130), y = Math.floor(alea(i, 22) * 80);
    if (x + y * 1.3 > 150) continue;
    rect(c, x, y, 9 + Math.floor(alea(i, 23) * 8), 2, 'rgba(60,70,50,0.18)');
    if (alea(i, 24) < 0.35) { rect(c, x + 3, y - 3, 4, 3, C.pierre); rect(c, x + 4, y - 4, 2, 1, C.pierreOmbre); }
  }

  // Rivière : de la retenue de La Source au lac des Rives ; sa largeur suit le débit.
  const debit = r.debit_aval_m3 ?? r.debit_m3 ?? 0;
  const ref = Math.max(...chrono.region.debit_m3) || 1;
  const niveau = Math.max(0, Math.min(1, (r.debit_m3 ?? 0) / (ref * 0.6)));
  const eau = (id: string, dx: number, dy: number): Pt => [pos[id][0] + dx, pos[id][1] + dy];
  const lit = courbe([[2, 8], eau('source', -8, 2), eau('source', 14, 20), eau('terrasses', -6, 20), eau('terrasses', 26, 26),
    eau('bourg', -4, 26), eau('bourg', 30, 30), eau('plaine', 6, 22), eau('plaine', 40, 6), eau('rives', -6, 28), eau('rives', 26, 16), [LARGEUR + 4, pos.rives[1] + 10]], 8);
  trait(c, lit, 9, C.sableSombre);
  trait(c, lit, 7, C.sable);
  const largeur = 1 + Math.round(niveau * 5);
  trait(c, lit, largeur, C.eau);
  if (largeur > 2) trait(c, lit.map(p => [p[0], p[1] - 1] as Pt), 1, C.eauClaire);
  void debit;
  // Lac des Rives.
  const [lx, ly] = [pos.rives[0] + 30, pos.rives[1] + 14];
  for (let y = -16; y <= 16; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (y * y) / 256)) * 22);
    rect(c, lx - w, ly + y, w * 2 + 14, 1, y < -12 + (1 - niveau) * 4 ? C.sable : y > 9 ? C.eauSombre : C.eau);
  }
  // Retenue de La Source : sa surface suit le volume stocké.
  const [sx, sy] = [pos.source[0] - 26, pos.source[1] - 16];
  const plein = Math.max(0.08, Math.min(1, (r.reserve_m3 ?? 0) / (Math.max(...chrono.region.reserve_m3) || 1)));
  rect(c, sx - 2, sy - 2, 30, 20, C.sableSombre);
  rect(c, sx, sy, 26, 16, C.sable);
  const hr = Math.round(16 * plein);
  rect(c, sx + Math.round((1 - plein) * 6), sy + 16 - hr, 26 - Math.round((1 - plein) * 12), hr, C.eau);
  rect(c, sx + Math.round((1 - plein) * 6) + 2, sy + 17 - hr, 8, 1, C.eauClaire);
  rect(c, sx - 2, sy + 16, 30, 3, C.pierre);
  rect(c, sx - 2, sy + 18, 30, 1, C.pierreOmbre);

  // Routes : terre claire, bien distincte de l'eau.
  const routes: Record<string, Pt[]> = {};
  region.routes.forEach((ro, i) => {
    routes[ro.vers] = tracerRoute(pos[ro.de], pos[ro.vers], i);
    trait(c, routes[ro.vers], 4, C.cheminBord);
    trait(c, routes[ro.vers], 2, C.chemin);
  });

  // Arbres, à l'écart des communes.
  for (let i = 0; i < 90; i++) {
    const x = 6 + Math.floor(alea(i, 31) * (LARGEUR - 12)), y = 6 + Math.floor(alea(i, 32) * (HAUTEUR - 12));
    if (Object.values(pos).some(p => Math.abs(p[0] - x) < 34 && Math.abs(p[1] - y) < 30)) continue;
    if (lit.some(p => Math.abs(p[0] - x) < 9 && Math.abs(p[1] - y) < 9)) continue;
    if (Object.values(routes).some(rt => rt.some(p => Math.abs(p[0] - x) < 6 && Math.abs(p[1] - y) < 6))) continue;
    arbre(c, x, y, ambiance, alea(i, 33) < 0.3);
  }

  // Champs autour des communes qui cultivent.
  const places: Record<string, [number, number, number, number][]> = {
    terrasses: [[-34, -22, 26, 7], [-36, -13, 30, 7], [-38, -4, 34, 7]],
    plaine: [[-36, -18, 22, 14], [-36, -1, 22, 11]],
    rives: [[-30, -20, 18, 12]],
  };
  const parCommune: Record<string, number> = {};
  for (const ch of region.champs) {
    const s = chrono.champs[ch.id];
    const i = Math.max(0, jour - 1);
    const liste = places[ch.commune] ?? [];
    const debut = parCommune[ch.commune] ?? 0;
    const n = ch.commune === 'terrasses' ? 3 : 1;
    for (let k = 0; k < n && debut + k < liste.length; k++) {
      const [dx, dy, w, h] = liste[debut + k];
      champ(c, pos[ch.commune][0] + dx, pos[ch.commune][1] + dy, w, h, s?.phase[i] ?? 0, s?.avancement[i] ?? 0, s?.eau[i] ?? 1);
    }
    parCommune[ch.commune] = debut + n;
  }

  // Communes : maisons et bâtiment qui les distingue.
  for (const co of region.communes) {
    const [x, y] = pos[co.id];
    const m = mesuresDuJour(chrono, co.id, jour);
    const n = Math.max(3, Math.min(7, Math.round(co.population / region.monde.population * 18)));
    for (let k = 0; k < n; k++) {
      const hx = x - 8 + (k % 4) * 9 + (Math.floor(k / 4) % 2) * 4, hy = y + 2 + Math.floor(k / 4) * 9;
      maison(c, hx, hy, 7, 7, (['tuile', 'ocre', 'ardoise'] as const)[Math.floor(alea(k, co.population) * 3)]);
    }
    if (co.id === 'bourg') entrepot(c, x - 14, y - 16, 30, 15, (r.depot_kg ?? 0) / (Math.max(...chrono.region.depot_kg) || 1), r.part_reservee ?? 0);
    else if (co.id === 'rives') silo(c, x - 6, y - 24, (r.secours_kg ?? 0) / (Math.max(...chrono.region.secours_kg) || 1));
    else entrepot(c, x - 6, y - 12, 16, 10, Math.min(1, (m.jours_reserve ?? 0) / 30));
    if (selection === co.id) {
      c.strokeStyle = C.encre; c.lineWidth = 1; c.setLineDash([3, 2]);
      c.strokeRect(x - 40.5, y - 26.5, 82, 50); c.setLineDash([]);
    }
  }

  // Charrettes : livraisons de l'entrepôt et tournées de secours du jour.
  for (const co of region.communes) {
    const m = mesuresDuJour(chrono, co.id, jour);
    const route = routes[co.id];
    if (route && (m.servi_depot_kg ?? 0) > 1) {
      const [cx, cy] = pointSur(route, (t * 0.12 + alea(co.population, 5)) % 1);
      charrette(c, Math.round(cx), Math.round(cy), false);
    }
    if ((m.secours_kg ?? 0) > 1 && co.id !== 'rives') {
      const aller = [...routes.rives].reverse().concat(route ?? []);
      const [cx, cy] = pointSur(aller, (t * 0.08 + alea(co.population, 6)) % 1);
      charrette(c, Math.round(cx), Math.round(cy), true);
    }
  }
  if ((r.pluie_mm ?? 0) > 1.5) pluie(c, t, r.pluie_mm);
}
