// Plan du monde : une seule vallée de 840 × 560, de la retenue de La Source au
// lac des Rives. Tout ce qui a une place (rivière, chemins, maisons, parcelles,
// bâtiments) est décidé ici, sans dessin : le rendu et les essais lisent le même plan.

import { alea } from '../game/rules';

export const MONDE_L = 840;
export const MONDE_H = 560;
export type Pt = [number, number];

/** Courbe lissée passant par des points de contrôle. */
export function lisser(points: Pt[], pas = 8): Pt[] {
  const s: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < pas; k++) {
      const t = k / pas, t2 = t * t, t3 = t2 * t;
      s.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  s.push(points[points.length - 1]);
  return s;
}

/** Point à la fraction `t` d'un tracé. */
export function pointSur(points: Pt[], t: number): Pt {
  const i = Math.min(points.length - 2, Math.max(0, Math.floor(t * (points.length - 1))));
  const f = t * (points.length - 1) - i;
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
}

export const CENTRES: Record<string, Pt> = {
  source: [172, 142], terrasses: [272, 274], bourg: [436, 300], plaine: [604, 438], rives: [722, 284],
};
/** Caractère de chaque commune : toits, murs, nombre de maisons. */
export const STYLES: Record<string, { toit: number; mur: number; maisons: number }> = {
  source: { toit: 2, mur: 2, maisons: 6 }, terrasses: { toit: 1, mur: 1, maisons: 9 }, bourg: { toit: 0, mur: 0, maisons: 16 },
  plaine: { toit: 0, mur: 1, maisons: 11 }, rives: { toit: 3, mur: 0, maisons: 8 },
};

export const RETENUE = { cx: 90, cy: 80, rx: 50, ry: 31 };
export const LAC = { cx: 846, cy: 452, rx: 128, ry: 204 };
/** Rayon normalisé d'un point dans une ellipse (1 sur le bord). */
export function rho(e: { cx: number; cy: number; rx: number; ry: number }, x: number, y: number): number {
  return Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);
}

export const RIVIERE: Pt[] = lisser([[126, 104], [146, 162], [176, 214], [206, 272], [262, 324], [330, 350], [392, 358], [450, 358],
  [472, 374], [482, 416], [494, 462], [536, 506], [630, 526], [700, 508], [730, 500]], 10);
/** Demi-largeur du lit à la fraction `f` du cours : la rivière s'élargit vers l'aval. */
export const demiLit = (f: number): number => 2.4 + f * 3.2;

export interface Chemin { id: string; points: Pt[]; large: boolean }
export const CHEMINS: Chemin[] = [
  { id: 'terrasses', large: true, points: lisser([CENTRES.bourg, [392, 292], [336, 282], CENTRES.terrasses]) },
  { id: 'source', large: true, points: lisser([[372, 288], [358, 240], [346, 180], [290, 150], [222, 146], CENTRES.source]) },
  { id: 'plaine', large: true, points: lisser([CENTRES.bourg, [486, 316], [530, 352], [566, 404], CENTRES.plaine]) },
  { id: 'rives', large: true, points: lisser([CENTRES.bourg, [520, 288], [620, 280], CENTRES.rives]) },
  { id: 'pont', large: false, points: lisser([[420, 318], [408, 344], [404, 372], [392, 410], [350, 432]]) },
];
/** Trajet d'une tournée de secours : des Rives à la commune, par Le Bourg. */
export function trajetSecours(commune: string): Pt[] {
  const rives = [...CHEMINS.find(c => c.id === 'rives')!.points].reverse();
  return commune === 'bourg' ? rives : rives.concat(commune === 'source' ? [...CHEMINS[0].points.slice(0, 10), ...CHEMINS[1].points] : CHEMINS.find(c => c.id === commune)!.points);
}
/** Trajet d'une livraison de l'entrepôt vers la commune. */
export function trajetLivraison(commune: string): Pt[] | null {
  if (commune === 'bourg') return null;
  return commune === 'source' ? [...CHEMINS[0].points.slice(0, 10), ...CHEMINS[1].points] : CHEMINS.find(c => c.id === commune)!.points;
}

/** Parcelle : un parallélogramme d'origine `o`, de côtés `u` (le long des rangs) et `v`. */
export interface Parcelle { champ: string; commune: string; o: Pt; u: Pt; v: Pt; variante: number; terrasse: boolean }
function parcelles(): Parcelle[] {
  const p: Parcelle[] = [];
  for (let i = 0; i < 7; i++) p.push({ champ: 'terrasses-cereales', commune: 'terrasses', o: [206 + i * 4, 170 + i * 9.4], u: [118 - i * 3, -7], v: [1, 8.4], variante: i % 3, terrasse: true });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) p.push({ champ: 'plaine-ete', commune: 'plaine', o: [514 + c * 31 - r * 3, 390 + c * 3 + r * 25], u: [28, 3], v: [-3, 23], variante: (r + c) % 3, terrasse: false });
  for (let i = 0; i < 4; i++) p.push({ champ: 'plaine-arriere-saison', commune: 'plaine', o: [566 + i * 28, 470 - i], u: [26, -1], v: [2, 25], variante: i % 3, terrasse: false });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) p.push({ champ: 'rives-jardins', commune: 'rives', o: [626 + c * 20, 300 + r * 18 + c * 2], u: [18, 2], v: [-1, 16], variante: (r * 2 + c) % 3, terrasse: false });
  return p;
}
export const PARCELLES: Parcelle[] = parcelles();
/** Coordonnées (a, b) d'un point dans une parcelle : dedans si les deux sont entre 0 et 1. */
export function dansParcelle(p: Parcelle, x: number, y: number): [number, number] {
  const det = p.u[0] * p.v[1] - p.u[1] * p.v[0], dx = x - p.o[0], dy = y - p.o[1];
  return [(dx * p.v[1] - dy * p.v[0]) / det, (dy * p.u[0] - dx * p.u[1]) / det];
}
export const coinsParcelle = (p: Parcelle): Pt[] => [p.o, [p.o[0] + p.u[0], p.o[1] + p.u[1]], [p.o[0] + p.u[0] + p.v[0], p.o[1] + p.u[1] + p.v[1]], [p.o[0] + p.v[0], p.o[1] + p.v[1]]];

export type Genre = 'maison' | 'grenier' | 'services' | 'atelier' | 'entrepot' | 'silos' | 'pompe' | 'cabane';
/** Bâtiment : `x`, `y` est le coin bas gauche de la façade. */
export interface Batiment { genre: Genre; commune: string; x: number; y: number; l: number; pignon: boolean; toit: number; mur: number; graine: number }
export const POMPES: Record<string, Pt> = { source: [136, 122], terrasses: [232, 296], bourg: [424, 350], plaine: [494, 432], rives: [764, 306] };

function batiments(): Batiment[] {
  const b: Batiment[] = [];
  const speciaux: [Genre, string, number, number, number][] = [
    ['grenier', 'source', -44, -12, 22], ['services', 'source', 22, -20, 20],
    ['grenier', 'terrasses', -50, 4, 24], ['services', 'terrasses', 38, -8, 22],
    ['grenier', 'bourg', -70, -22, 26], ['atelier', 'bourg', -26, -40, 30], ['entrepot', 'bourg', 22, -40, 66],
    ['grenier', 'plaine', 34, -34, 24], ['services', 'plaine', -8, -40, 22],
    ['grenier', 'rives', -52, 14, 22], ['services', 'rives', 20, -30, 20], ['silos', 'rives', -44, -30, 34],
  ];
  for (const [genre, commune, dx, dy, l] of speciaux) {
    const s = STYLES[commune];
    b.push({ genre, commune, x: CENTRES[commune][0] + dx, y: CENTRES[commune][1] + dy, l, pignon: false, toit: genre === 'entrepot' ? 2 : s.toit, mur: s.mur, graine: dx * 7 + dy });
  }
  for (const [commune, [px, py]] of Object.entries(POMPES)) b.push({ genre: 'pompe', commune, x: px - 6, y: py, l: 12, pignon: false, toit: 2, mur: 2, graine: px });
  b.push({ genre: 'cabane', commune: 'bourg', x: 338, y: 440, l: 12, pignon: true, toit: 1, mur: 1, graine: 5 });
  for (const [commune, s] of Object.entries(STYLES)) {
    const [cx, cy] = CENTRES[commune], g = commune.length * 31 + commune.charCodeAt(0);
    const poses: Batiment[] = [];
    for (let k = 0, essais = 0; poses.length < s.maisons && essais < 600; essais++, k++) {
      const angle = k * 2.399963 + alea(g, k) * 0.7, rayon = 20 + Math.sqrt(k) * 7.5 + alea(k, g) * 8;
      const l = 12 + Math.floor(alea(g + 1, k) * 7);
      const x = Math.round(cx + Math.cos(angle) * rayon * 1.35 - l / 2), y = Math.round(cy + Math.sin(angle) * rayon * 0.82 + 6);
      const gene = (o: { x: number; y: number; l: number }, mx: number, my: number): boolean => x < o.x + o.l + mx && x + l + mx > o.x && Math.abs(y - o.y) < my;
      if (poses.some(o => gene(o, 5, 17)) || b.some(o => (o.commune === commune) && gene(o, 6, o.genre === 'entrepot' ? 30 : 20))) continue;
      if (CHEMINS.some(c => c.points.some(q => q[0] > x - 4 && q[0] < x + l + 4 && q[1] > y - 15 && q[1] < y + 4))) continue;
      if (PARCELLES.some(pa => coinsParcelle(pa).some(q => q[0] > x - 8 && q[0] < x + l + 8 && q[1] > y - 20 && q[1] < y + 8))) continue;
      const dedans = (pa: Parcelle, qx: number, qy: number): boolean => { const [a, b2] = dansParcelle(pa, qx, qy); return a > -0.08 && a < 1.08 && b2 > -0.5 && b2 < 1.5; };
      if (PARCELLES.some(pa => dedans(pa, x, y) || dedans(pa, x + l, y) || dedans(pa, x + l / 2, y - 8) || dedans(pa, x, y - 14) || dedans(pa, x + l, y - 14))) continue;
      if (rho(LAC, x + l, y) < 1.06 || RIVIERE.some(q => Math.abs(q[0] - x - l / 2) < l / 2 + 9 && Math.abs(q[1] - y + 6) < 16)) continue;
      poses.push({ genre: 'maison', commune, x, y, l, pignon: alea(g + 2, k) < 0.32, toit: alea(g + 3, k) < 0.78 ? s.toit : (s.toit + 1) % 4, mur: alea(g + 4, k) < 0.8 ? s.mur : (s.mur + 1) % 3, graine: g + k });
    }
    b.push(...poses);
  }
  return b.sort((a, c) => a.y - c.y);
}
export const BATIMENTS: Batiment[] = batiments();
export const maisonsDe = (commune: string): Batiment[] => BATIMENTS.filter(b => b.commune === commune && b.genre === 'maison');
export const batiment = (genre: Genre, commune: string): Batiment | undefined => BATIMENTS.find(b => b.genre === genre && b.commune === commune);

/** Où poser le nom d'une commune : sur sa place, là où se croisent ses chemins. */
export function ancreNom(commune: string): Pt {
  return [CENTRES[commune][0], CENTRES[commune][1] + 8];
}

/** Lieux nommés sur la carte ; `bien` renvoie à la fiche du bien quand il y en a une. */
export interface Lieu { cle: string; commune: string; nom: string; x: number; y: number; bien?: string }
export function lieux(): Lieu[] {
  const l: Lieu[] = [];
  const pose = (genre: Genre, commune: string, nom: string, bien?: string): void => {
    const b = batiment(genre, commune);
    if (b) l.push({ cle: `${genre}:${commune}`, commune, nom, x: b.x + b.l / 2, y: b.y - (genre === 'entrepot' ? 32 : genre === 'silos' ? 30 : 24), bien });
  };
  pose('entrepot', 'bourg', 'Entrepôt régional', 'depot');
  pose('silos', 'rives', 'Réserve de secours', 'secours');
  pose('atelier', 'bourg', 'Atelier', 'atelier');
  l.push({ cle: 'retenue', commune: 'source', nom: 'Réserve amont', x: RETENUE.cx, y: RETENUE.cy - 8, bien: 'reserve_eau' });
  return l;
}

/** Où un habitant passe sa journée : un point stable par personne, selon son lieu de jour. */
export function pointDeJour(commune: string, lieu: 'logement' | 'champ' | 'pompe' | 'services', graine: number): Pt {
  const [cx, cy] = CENTRES[commune];
  if (lieu === 'champ') {
    const ps = PARCELLES.filter(p => p.commune === commune);
    if (ps.length) {
      const p = ps[Math.floor(alea(graine, 41) * ps.length)], a = 0.15 + alea(graine, 42) * 0.7, b = 0.2 + alea(graine, 43) * 0.6;
      return [p.o[0] + p.u[0] * a + p.v[0] * b, p.o[1] + p.u[1] * a + p.v[1] * b];
    }
    const g = batiment('grenier', commune)!;
    return [g.x + alea(graine, 44) * g.l, g.y + 4 + alea(graine, 45) * 6];
  }
  if (lieu === 'pompe') {
    const gros = batiment('entrepot', commune) ?? batiment('silos', commune);
    if (gros && alea(graine, 46) < 0.6) return [gros.x + alea(graine, 47) * gros.l, gros.y + 4 + alea(graine, 48) * 5];
    const [px, py] = POMPES[commune];
    return [px - 8 + alea(graine, 49) * 16, py + 3 + alea(graine, 50) * 4];
  }
  if (lieu === 'services') {
    // Tous ne travaillent pas à la salle commune : une partie des services se fait de maison en maison.
    if (alea(graine, 55) < 0.55) {
      const ms = maisonsDe(commune), m = ms[Math.floor(alea(graine, 56) * ms.length)];
      return [m.x + alea(graine, 57) * m.l, m.y + 3 + alea(graine, 58) * 4];
    }
    const s = batiment('services', commune) ?? batiment('atelier', commune)!;
    return [s.x - 10 + alea(graine, 51) * (s.l + 20), s.y + 3 + alea(graine, 52) * 11];
  }
  return [cx - 10 + alea(graine, 53) * 20, cy - 4 + alea(graine, 54) * 10];
}
