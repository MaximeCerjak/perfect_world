// Carte régionale : relief en courbes de niveau, rivière, chemins et communes,
// d'après l'état calculé du jour. Le sol, les chemins et les bois sont peints
// une fois par saison ; l'eau, les champs, les bâtiments et les charrettes à chaque image.

import { HAUTEUR, LARGEUR, arbre, bruit, champ, charrette, chemin, courbe, entrepot, maison, palette, peindreSol, pluie, pointSur, rect, riviere, silo, tramer, type Ambiance, type Palette } from '../art/dessin';
import { alea, mesuresDuJour } from '../game/rules';
import type { Chronologie, Region } from '../types';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** Position d'une commune sur la carte de 360 × 232. */
export function positionCommune(carte: [number, number]): Pt {
  return [Math.round((carte[0] * LARGEUR) / 64), Math.round((carte[1] * (HAUTEUR - 16)) / 32) + 6];
}

/** Ambiance du jour : la saison, ou la sécheresse pendant l'épisode sec. */
export function ambianceDuJour(chrono: Chronologie, region: Region, jour: number): Ambiance {
  const seche = (region.episodes ?? []).some(e => jour >= e.debut_jour + 8 && jour <= e.fin_jour);
  return seche ? 'sécheresse' : ((chrono.saisons[Math.max(0, jour - 1)] ?? 'printemps') as Ambiance);
}

interface Trace { pos: Record<string, Pt>; lit: Pt[]; routes: Record<string, Pt[]> }
function tracer(region: Region): Trace {
  const pos: Record<string, Pt> = {};
  for (const co of region.communes) pos[co.id] = positionCommune(co.carte);
  const e = (id: string, dx: number, dy: number): Pt => [pos[id][0] + dx, pos[id][1] + dy];
  const lit = courbe([[pos.source[0] - 14, pos.source[1] + 4], e('source', 6, 22), e('terrasses', -10, 22), e('terrasses', 24, 27), e('bourg', -6, 27),
    e('bourg', 30, 31), e('plaine', 4, 24), e('plaine', 40, 8), e('rives', -8, 30), e('rives', 22, 18), [pos.rives[0] + 32, pos.rives[1] + 12]], 9);
  const routes: Record<string, Pt[]> = {};
  region.routes.forEach((ro, i) => {
    const a = pos[ro.de], b = pos[ro.vers];
    routes[ro.vers] = courbe([a, [(a[0] + b[0]) / 2 + (i % 2 ? 8 : -8), (a[1] + b[1]) / 2 + (i % 2 ? -7 : 7)], b], 12);
  });
  return { pos, lit, routes };
}

const relief = (x: number, y: number): number => Math.max(0, Math.min(1, 1 - (x + y * 1.35) / 185));
const fonds = new Map<string, HTMLCanvasElement>();
function fond(region: Region, ambiance: Ambiance, tr: Trace): HTMLCanvasElement {
  let f = fonds.get(ambiance);
  if (f) return f;
  f = document.createElement('canvas'); f.width = LARGEUR; f.height = HAUTEUR;
  const c = f.getContext('2d')!, p = palette(ambiance);
  peindreSol(c, p, 1, relief);
  for (const r of Object.values(tr.routes)) chemin(c, r, p, true);
  // Bois : denses là où le bruit est haut, à l'écart de l'eau, des chemins et des communes.
  for (let y = 10; y < HAUTEUR - 10; y += 6) {
    for (let x = 10; x < LARGEUR - 10; x += 6) {
      const tx = x + Math.floor(alea(x, y) * 5), ty = y + Math.floor(alea(y, x) * 5);
      const b = bruit(tx / 34, ty / 34, 9);
      if (b < 0.6 + alea(x + 3, y + 7) * 0.12) continue;
      if (Object.values(tr.pos).some(q => Math.abs(q[0] - tx) < 44 && Math.abs(q[1] - ty) < 34)) continue;
      if (tr.lit.some(q => Math.abs(q[0] - tx) < 9 && Math.abs(q[1] - ty) < 8)) continue;
      if (Object.values(tr.routes).some(r => r.some(q => Math.abs(q[0] - tx) < 6 && Math.abs(q[1] - ty) < 6))) continue;
      if (Math.abs(tx - (tr.pos.rives[0] + 34)) < 30 && Math.abs(ty - (tr.pos.rives[1] + 12)) < 24) continue;
      arbre(c, tx, ty, p, alea(x, y + 1) < 0.35, ambiance === 'hiver' && alea(x + 1, y) < 0.6);
    }
  }
  void region;
  fonds.set(ambiance, f);
  return f;
}

function lac(c: Ctx, x: number, y: number, p: Palette, niveau: number, t: number): void {
  for (let dy = -17; dy <= 17; dy++) {
    const w = Math.round(Math.sqrt(1 - (dy * dy) / 289) * 24);
    rect(c, x - w - 2, y + dy, w * 2 + 4, 1, p.t[4]);
    const retrait = Math.round((1 - niveau) * 7);
    if (w - retrait > 0 && Math.abs(dy) < 17 - retrait) rect(c, x - w + retrait, y + dy, (w - retrait) * 2, 1, p.eau);
  }
  for (let k = 0; k < 5; k++) rect(c, x - 14 + ((k * 9 + Math.floor(t * 3)) % 28), y - 8 + k * 4, 3, 1, p.eau2);
}

/** Dessine la carte régionale pour `jour` ; `t` est le temps d'animation en secondes. */
export function dessinerCarte(c: Ctx, region: Region, chrono: Chronologie, jour: number, t: number, selection: string | null): void {
  const ambiance = ambianceDuJour(chrono, region, jour), p = palette(ambiance);
  const r = mesuresDuJour(chrono, 'region', jour);
  const tr = tracer(region), pos = tr.pos;
  c.drawImage(fond(region, ambiance, tr), 0, 0);
  const max = (cle: string): number => Math.max(...chrono.region[cle]) || 1;
  const niveau = Math.max(0.04, Math.min(1, (r.debit_m3 ?? 0) / (max('debit_m3') * 0.55)));

  riviere(c, tr.lit, p, niveau, 5, t);
  lac(c, pos.rives[0] + 34, pos.rives[1] + 12, p, niveau, t);
  // Retenue de La Source : sa surface suit le volume stocké, la digue reste.
  const [sx, sy] = [pos.source[0] - 34, pos.source[1] - 14];
  const plein = Math.max(0.06, Math.min(1, (r.reserve_m3 ?? 0) / max('reserve_m3')));
  rect(c, sx, sy, 24, 18, p.t[4]);
  const hr = Math.round(18 * plein), ret = Math.round((1 - plein) * 5);
  rect(c, sx + ret, sy + 18 - hr, 24 - ret * 2, hr, p.eau);
  if (hr > 4) rect(c, sx + ret + 3 + (Math.floor(t * 2) % 6), sy + 20 - hr, 5, 1, p.eau2);
  rect(c, sx - 1, sy + 18, 26, 3, p.t[0]);
  tramer(c, sx + 1, sy + 21, 26, 2, p.t[1], 0.5);

  // Champs autour des communes qui cultivent.
  const places: Record<string, [number, number, number, number][]> = {
    terrasses: [[-38, -24, 26, 7], [-40, -15, 30, 7], [-42, -6, 34, 7]],
    plaine: [[-38, -20, 22, 14], [-38, -3, 22, 11]],
    rives: [[-32, -22, 18, 12]],
  };
  const pris: Record<string, number> = {};
  const i = Math.max(0, jour - 1);
  for (const ch of region.champs) {
    const s = chrono.champs[ch.id], liste = places[ch.commune] ?? [], debut = pris[ch.commune] ?? 0;
    const n = ch.commune === 'terrasses' ? 3 : 1;
    for (let k = 0; k < n && debut + k < liste.length; k++) {
      const [dx, dy, w, h] = liste[debut + k];
      champ(c, pos[ch.commune][0] + dx, pos[ch.commune][1] + dy, w, h, p, s?.phase[i] ?? 0, s?.avancement[i] ?? 0, s?.eau[i] ?? 1);
    }
    pris[ch.commune] = debut + n;
  }

  // Communes : quelques maisons et le bâtiment qui les distingue.
  for (const co of region.communes) {
    const [x, y] = pos[co.id];
    const m = mesuresDuJour(chrono, co.id, jour);
    const n = Math.max(3, Math.min(8, Math.round((co.population / region.monde.population) * 20)));
    for (let k = 0; k < n; k++) maison(c, x - 10 + (k % 4) * 9 + (Math.floor(k / 4) % 2) * 4, y + 3 + Math.floor(k / 4) * 8, 6, 6, p, false, k + co.population);
    if (co.id === 'bourg') entrepot(c, x - 16, y - 18, 34, 17, p, (r.depot_kg ?? 0) / max('depot_kg'), r.part_reservee ?? 0);
    else if (co.id === 'rives') { silo(c, x - 8, y - 26, p, (r.secours_kg ?? 0) / max('secours_kg')); entrepot(c, x + 6, y - 12, 14, 10, p, Math.min(1, (m.jours_reserve ?? 0) / 30)); }
    else entrepot(c, x - 8, y - 13, 16, 11, p, Math.min(1, (m.jours_reserve ?? 0) / 30));
    if (selection === co.id) { c.strokeStyle = p.t[0]; c.lineWidth = 1; c.setLineDash([2, 2]); c.strokeRect(x - 44.5, y - 30.5, 90, 58); c.setLineDash([]); }
  }

  // Charrettes : livraisons de l'entrepôt et tournées de secours du jour.
  for (const co of region.communes) {
    const m = mesuresDuJour(chrono, co.id, jour), route = tr.routes[co.id];
    if (route && (m.servi_depot_kg ?? 0) > 1) {
      const [cx, cy] = pointSur(route, (t * 0.1 + alea(co.population, 5)) % 1);
      charrette(c, Math.round(cx), Math.round(cy), p, false);
    }
    if ((m.secours_kg ?? 0) > 1 && co.id !== 'rives') {
      const [cx, cy] = pointSur([...tr.routes.rives].reverse().concat(route ?? []), (t * 0.07 + alea(co.population, 6)) % 1);
      charrette(c, Math.round(cx), Math.round(cy), p, true);
    }
  }
  if ((r.pluie_mm ?? 0) > 1.5) pluie(c, t, r.pluie_mm, p);
}
