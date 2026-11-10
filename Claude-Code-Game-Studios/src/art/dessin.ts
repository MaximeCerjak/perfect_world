// Direction artistique : une linogravure saisonnière.
// Tout se dessine dans une gamme de cinq tons, du plus sombre (0) au plus clair (4),
// qui change avec la saison du jour affiché. Deux encres restent étrangères à la
// saison : le bleu de l'eau et le magenta des droits réservés. Les dégradés
// passent par une trame de Bayer, jamais par un fondu.
// Aucun fichier image : chaque forme est posée au pixel sur un canevas de
// 360 × 232, que la page agrandit par un facteur entier.

import { alea } from '../game/rules';

export const LARGEUR = 360;
export const HAUTEUR = 232;

export type Ambiance = 'printemps' | 'été' | 'automne' | 'hiver' | 'sécheresse';
export type Ton = 0 | 1 | 2 | 3 | 4;
export interface Palette { t: [string, string, string, string, string]; eau: string; eau2: string; droit: string; lueur: string }

/** Gammes de saison, du ton le plus sombre au plus clair. */
export const GAMMES: Record<Ambiance, [string, string, string, string, string]> = {
  printemps: ['#14302a', '#2c5a45', '#5c9163', '#a8c98c', '#e6eecb'],
  'été': ['#1d3320', '#41672d', '#84a141', '#c6d07c', '#f1efc3'],
  'sécheresse': ['#3a2413', '#7b4a1e', '#b9832e', '#e2bf69', '#f8eaba'],
  automne: ['#35202b', '#703b34', '#b36a3a', '#e3a968', '#f8e3be'],
  hiver: ['#1b2234', '#3c4a68', '#7a8aa8', '#bcc7d8', '#eef2f6'],
};
/** Les deux encres hors saison. */
export const ENCRE_EAU = '#2a76b4';
export const ENCRE_EAU_CLAIRE = '#8fc5e8';
export const ENCRE_DROIT = '#c81e5a';

/** Palette d'un moment : la gamme de la saison, assombrie d'un ou deux tons la nuit. */
export function palette(ambiance: Ambiance, nuit = 0): Palette {
  const g = GAMMES[ambiance];
  const t = (nuit >= 2 ? [g[0], g[0], g[1], g[1], g[2]] : nuit === 1 ? [g[0], g[1], g[1], g[2], g[3]] : g) as Palette['t'];
  return { t, eau: nuit ? '#1f5a8c' : ENCRE_EAU, eau2: nuit ? ENCRE_EAU : ENCRE_EAU_CLAIRE, droit: ENCRE_DROIT, lueur: g[4] };
}

type Ctx = CanvasRenderingContext2D;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Seuil de trame (0 à 1) au pixel (x, y). */
export function trame(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** Bruit lissé stable dans [0, 1], pour les prairies, les bois et le relief. */
export function bruit(x: number, y: number, graine: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = alea(xi + graine * 57, yi), b = alea(xi + 1 + graine * 57, yi), c = alea(xi + graine * 57, yi + 1), d = alea(xi + 1 + graine * 57, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Rectangle plein aux coordonnées entières. */
export function rect(c: Ctx, x: number, y: number, w: number, h: number, couleur: string): void {
  c.fillStyle = couleur;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Rectangle tramé : un pixel sur deux, trois ou quatre selon `densite` (0 à 1). */
export function tramer(c: Ctx, x: number, y: number, w: number, h: number, couleur: string, densite: number): void {
  c.fillStyle = couleur;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (trame(x + i, y + j) < densite) c.fillRect(x + i, y + j, 1, 1);
}

/**
 * Sol d'une vue, calculé une fois : prairies claires, creux sombres, courbes de
 * niveau là où `relief` est haut, et bords fondus dans la page par la trame.
 * `relief(x, y)` vaut 0 en plaine et monte vers 1 sur les hauteurs.
 */
export function peindreSol(c: Ctx, p: Palette, graine: number, relief: (x: number, y: number) => number, fondu = 22): void {
  const img = c.createImageData(LARGEUR, HAUTEUR);
  const rvb = p.t.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const hauteur = (x: number, y: number): number => relief(x, y) * 1.6 + bruit(x / 46, y / 46, graine + 3) * 0.5;
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const s = trame(x, y);
      const n = bruit(x / 38, y / 30, graine) * 0.7 + bruit(x / 11, y / 11, graine + 1) * 0.3;
      // Deux tons seulement pour le sol : la prairie, et des clairières plus pâles à bord tramé.
      let ton = n > 0.56 + s * 0.07 ? 4 : 3;
      const r = relief(x, y);
      if (r > 0.12) {
        const k = Math.floor(hauteur(x, y) * 9);
        if (k !== Math.floor(hauteur(x + 1, y) * 9) || k !== Math.floor(hauteur(x, y + 1) * 9)) ton = r > 0.5 ? 1 : 2;
        else if (r > 0.55 && s < (r - 0.55) * 1.2) ton = 2;
      }
      const bord = Math.min(x, y, LARGEUR - 1 - x, HAUTEUR - 1 - y);
      if (bord < fondu && s > (bord / fondu) ** 1.4) ton = 4;
      const i = (y * LARGEUR + x) * 4;
      img.data[i] = rvb[ton][0]; img.data[i + 1] = rvb[ton][1]; img.data[i + 2] = rvb[ton][2]; img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

/** Trait épais fait de carrés, pour les routes et les cours d'eau. */
export function trait(c: Ctx, points: [number, number][], epaisseur: number, couleur: string): void {
  c.fillStyle = couleur;
  const d = epaisseur / 2, e = Math.ceil(epaisseur);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) c.fillRect(Math.round(x0 + ((x1 - x0) * k) / n - d), Math.round(y0 + ((y1 - y0) * k) / n - d), e, e);
  }
}

/** Chemin en pointillé : la terre battue, distincte de l'eau par sa forme autant que par son ton. */
export function chemin(c: Ctx, points: [number, number][], p: Palette, large = false): void {
  trait(c, points, large ? 4 : 2, p.t[4]);
  c.fillStyle = p.t[2];
  let parcouru = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k < n; k++, parcouru++) {
      if (parcouru % 6 < 2) c.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
    }
  }
}

/** Courbe lissée passant par des points de contrôle. */
export function courbe(points: [number, number][], pas = 6): [number, number][] {
  const s: [number, number][] = [];
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
export function pointSur(points: [number, number][], t: number): [number, number] {
  const i = Math.min(points.length - 2, Math.max(0, Math.floor(t * (points.length - 1))));
  const f = t * (points.length - 1) - i;
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
}

/** Cours d'eau : un lit clair toujours visible, une eau dont la largeur suit le débit, des reflets qui descendent. */
export function riviere(c: Ctx, lit: [number, number][], p: Palette, niveau: number, largeurMax: number, t: number): void {
  trait(c, lit, largeurMax + 2, p.t[4]);
  const l = Math.max(1, Math.round(niveau * largeurMax));
  trait(c, lit, l, p.eau);
  if (l >= 3) {
    c.fillStyle = p.eau2;
    const n = lit.length;
    for (let i = 0; i < n; i += 5) {
      const k = (i + Math.floor(t * 9)) % n;
      c.fillRect(Math.round(lit[k][0] - 1), Math.round(lit[k][1] - (l > 4 ? 1 : 0)), 2, 1);
    }
  }
}

/** Arbre vu du dessus : une masse sombre, un éclat, une ombre portée. */
export function arbre(c: Ctx, x: number, y: number, p: Palette, grand = false, nu = false): void {
  const r = grand ? 3 : 2;
  rect(c, x - r + 2, y + r - 1, r * 2, 2, p.t[2]);
  if (nu) {
    rect(c, x, y - r, 1, r * 2, p.t[1]); rect(c, x - r + 1, y - 1, r * 2 - 1, 1, p.t[1]);
    rect(c, x - 1, y - r + 1, 1, 1, p.t[1]); rect(c, x + 1, y + 1, 1, 1, p.t[1]);
    return;
  }
  rect(c, x - r, y - r + 1, r * 2, r * 2 - 2, p.t[1]);
  rect(c, x - r + 1, y - r, r * 2 - 2, r * 2, p.t[1]);
  rect(c, x - r + 1, y + r - 2, r * 2 - 2, 1, p.t[0]);
  rect(c, x - 1, y - r + 1, 1, 1, p.t[2]);
}

/** Maison : toit sombre à faîtage, mur clair, porte ; les fenêtres s'allument la nuit. */
export function maison(c: Ctx, x: number, y: number, w: number, h: number, p: Palette, nuit = false, variante = 0): void {
  const ht = Math.round(h * 0.6);
  tramer(c, x + 2, y + h, w + 1, 3, p.t[1], 0.5);
  rect(c, x, y + ht - 1, w, h - ht + 1, nuit ? p.t[3] : p.t[4]);
  rect(c, x - 1, y, w + 2, ht, variante % 3 === 1 ? p.t[0] : p.t[1]);
  rect(c, x - 1, y + Math.floor(ht / 2), w + 2, 1, variante % 3 === 1 ? p.t[1] : p.t[0]);
  if (w >= 14) {
    rect(c, x + Math.floor(w / 2) - 1, y + h - 5, 3, 5, p.t[0]);
    const fen = nuit && alea(x, y) < 0.75 ? p.lueur : p.t[1];
    rect(c, x + 3, y + ht + 1, 3, 3, fen); rect(c, x + w - 6, y + ht + 1, 3, 3, fen);
    if (variante % 2 === 0) { rect(c, x + w - 5, y - 3, 3, 4, p.t[0]); }
  } else if (nuit && alea(x, y) < 0.7) rect(c, x + 1, y + ht, 2, 1, p.lueur);
}

/**
 * Entrepôt ou grenier. La jauge dit ce qu'il contient ; les portes disent qui y
 * accède : une porte sur cinq par tranche de capacité, barrée de magenta quand
 * la tranche est réservée.
 */
export function entrepot(c: Ctx, x: number, y: number, w: number, h: number, p: Palette, remplissage: number, partReservee = 0, nuit = false): void {
  const ht = Math.round(h * 0.5);
  tramer(c, x + 3, y + h, w + 1, 3, p.t[1], 0.5);
  rect(c, x, y + ht, w, h - ht, nuit ? p.t[3] : p.t[4]);
  rect(c, x - 1, y, w + 2, ht, p.t[0]);
  for (let i = 3; i < w; i += 4) rect(c, x + i, y + 1, 1, ht - 2, p.t[1]);
  rect(c, x - 1, y + ht - 1, w + 2, 1, p.t[1]);
  const hj = h - ht - 3, plein = Math.round(hj * Math.max(0, Math.min(1, remplissage)));
  rect(c, x + w - 4, y + ht + 1, 3, hj + 1, p.t[1]);
  rect(c, x + w - 3, y + ht + 1 + hj - plein, 1, plein, nuit ? p.lueur : p.t[4]);
  const portes = 5, lp = Math.max(2, Math.floor((w - 8) / portes) - 1), hp = Math.min(8, h - ht - 2);
  const reservees = Math.round(partReservee * portes);
  for (let i = 0; i < portes; i++) {
    const px = x + 2 + i * (lp + 1), py = y + h - hp;
    if (i >= portes - reservees) {
      rect(c, px, py, lp, hp, p.droit);
      for (let g = 1; g < lp; g += 2) rect(c, px + g, py, 1, hp, p.t[0]);
      rect(c, px, py + Math.floor(hp / 2), lp, 1, p.t[0]);
    } else rect(c, px, py, lp, hp, p.t[1]);
  }
}

/** Silo de la réserve de secours : une tour claire marquée d'une croix. */
export function silo(c: Ctx, x: number, y: number, p: Palette, remplissage: number): void {
  tramer(c, x + 2, y + 22, 12, 3, p.t[1], 0.5);
  rect(c, x, y + 3, 10, 20, p.t[4]);
  rect(c, x + 7, y + 3, 3, 20, p.t[3]);
  rect(c, x, y, 10, 4, p.t[0]); rect(c, x + 2, y - 1, 6, 1, p.t[0]);
  const plein = Math.round(15 * Math.max(0, Math.min(1, remplissage)));
  rect(c, x + 1, y + 6, 2, 16, p.t[1]); rect(c, x + 1, y + 21 - plein, 2, plein + 1, p.t[0]);
  rect(c, x + 4, y + 11, 3, 1, p.t[0]); rect(c, x + 5, y + 10, 1, 3, p.t[0]);
}

/** Station de pompage ; la roue tourne tant que la pompe marche, le voyant dit son état. */
export function pompe(c: Ctx, x: number, y: number, p: Palette, etat: number, t: number): void {
  tramer(c, x + 2, y + 13, 14, 3, p.t[1], 0.5);
  rect(c, x, y + 4, 13, 10, p.t[4]);
  rect(c, x - 1, y + 1, 15, 4, p.t[0]);
  rect(c, x + 13, y + 9, 9, 2, p.t[1]);
  const tourne = etat >= 0.35 && Math.floor(t * 4) % 2 === 0;
  rect(c, x + 2, y + 7, 5, 5, p.t[1]);
  rect(c, tourne ? x + 4 : x + 2, y + 9, tourne ? 1 : 5, 1, p.t[4]);
  rect(c, x + 4, tourne ? y + 7 : y + 9, 1, tourne ? 5 : 1, p.t[4]);
  if (etat < 0.85 && (etat >= 0.35 || Math.floor(t * 2) % 2 === 0)) { rect(c, x + 9, y + 6, 3, 3, p.t[0]); rect(c, x + 10, y + 7, 1, 1, p.t[4]); }
}

/** Parcelle : sol nu strié, rangs qui épaississent, grain clair à maturité, rangs troués quand l'eau manque. */
export function champ(c: Ctx, x: number, y: number, w: number, h: number, p: Palette, phase: number, avancement: number, eau: number): void {
  rect(c, x, y, w, h, p.t[2]);
  const pas = h > 20 ? 4 : 3;
  for (let ry = 1; ry < h - 1; ry += pas) {
    if (phase === 0) { tramer(c, x + 1, y + ry, w - 2, 1, p.t[3], 0.5); continue; }
    const epais = phase === 2 || avancement > 0.6 ? 2 : 1;
    for (let rx = 1; rx < w - 1; rx++) {
      if (eau < 0.7 && alea(x + rx, y + ry) < (0.75 - eau) * 1.3) { if (alea(rx, ry) < 0.3) rect(c, x + rx, y + ry, 1, 1, p.t[4]); continue; }
      if (avancement < 0.25 && (rx & 1)) continue;
      rect(c, x + rx, y + ry, 1, epais, p.t[1]);
      if ((phase === 2 || avancement > 0.9) && (rx + ry) % 3 === 0) rect(c, x + rx, y + ry, 1, 1, p.t[4]);
    }
  }
  c.strokeStyle = p.t[1]; c.lineWidth = 1; c.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, w + 1, h + 1);
}

export interface Allure { age: number; metier: number; graine: number }

/**
 * Habitant de 16 × 24 px, pieds en (x + 8, y + 23) : une silhouette sombre, un
 * visage clair. Les enfants sont plus petits ; la coiffe suit l'activité.
 * L'humain suivi porte un fanion clair.
 */
export function habitant(c: Ctx, x: number, y: number, a: Allure, pas: number, p: Palette, suivi = false): void {
  const enfant = a.age < 16, petit = a.age < 6;
  const hCorps = petit ? 4 : enfant ? 6 : 8, lCorps = petit ? 4 : enfant ? 5 : 6, hTete = petit ? 4 : 5, hJambes = petit ? 2 : enfant ? 3 : 4;
  const cx = x + 8, pied = y + 23, gx = cx - Math.floor(lCorps / 2);
  const corps = a.metier === 3 || enfant ? p.t[1] : p.t[0];
  tramer(c, gx, pied, lCorps + 3, 2, p.t[1], 0.5);
  const m = pas % 2;
  rect(c, gx + (enfant ? 0 : 1), pied - hJambes + (m ? 0 : 1), 2, hJambes - (m ? 0 : 1), p.t[0]);
  rect(c, gx + lCorps - (enfant ? 2 : 3), pied - hJambes + (m ? 1 : 0), 2, hJambes - (m ? 1 : 0), p.t[0]);
  const yc = pied - hJambes - hCorps;
  rect(c, gx, yc, lCorps, hCorps, corps);
  rect(c, gx - 1, yc + 1, 1, hCorps - 3, corps); rect(c, gx + lCorps, yc + 1, 1, hCorps - 3, corps);
  if (a.metier === 2 && !enfant) rect(c, gx + 1, yc + 2, lCorps - 2, 1, p.t[3]);
  if (alea(a.graine, 3) < 0.4) rect(c, gx, yc + hCorps - 2, lCorps, 2, p.t[alea(a.graine, 4) < 0.5 ? 2 : 0]);
  const lt = lCorps - (enfant ? 0 : 1), tx = cx - Math.floor(lt / 2) - (enfant ? 0 : 0), yt = yc - hTete;
  rect(c, tx, yt, lt, hTete, p.t[4]);
  const cheveux = a.age >= 65 ? p.t[3] : p.t[0];
  rect(c, tx, yt, lt, 2, cheveux);
  if (alea(a.graine, 5) < 0.5) rect(c, tx, yt, 1, hTete - 1, cheveux); else rect(c, tx + lt - 1, yt, 1, hTete - 1, cheveux);
  if (a.metier === 1 && !enfant) rect(c, tx - 2, yt + 1, lt + 4, 1, p.t[1]);
  if (suivi) {
    rect(c, cx, yt - 9, 1, 8, p.t[0]);
    rect(c, cx + 1, yt - 9, 5, 4, p.lueur); rect(c, cx + 1, yt - 9, 5, 1, p.t[0]); rect(c, cx + 1, yt - 5, 5, 1, p.t[0]); rect(c, cx + 6, yt - 9, 1, 5, p.t[0]);
  }
}

/** Charrette de livraison ; un fanion clair à croix marque une tournée de secours. */
export function charrette(c: Ctx, x: number, y: number, p: Palette, secours: boolean): void {
  rect(c, x - 2, y - 2, 5, 3, p.t[0]);
  rect(c, x - 1, y - 3, 3, 1, p.t[4]);
  rect(c, x - 2, y + 1, 1, 1, p.t[1]); rect(c, x + 2, y + 1, 1, 1, p.t[1]);
  if (secours) { rect(c, x + 2, y - 8, 1, 6, p.t[0]); rect(c, x + 3, y - 8, 4, 3, p.t[4]); rect(c, x + 4, y - 7, 2, 1, p.t[0]); }
}

/** Pluie : de courts traits obliques dans le ton le plus clair. */
export function pluie(c: Ctx, t: number, force: number, p: Palette): void {
  c.fillStyle = p.t[4];
  const n = Math.min(110, Math.round(force * 11));
  for (let i = 0; i < n; i++) {
    const x = Math.round((alea(i, 11) * LARGEUR + t * 46) % LARGEUR), y = Math.round((alea(i, 12) * HAUTEUR + t * 170) % HAUTEUR);
    c.fillRect(x, y, 1, 2); c.fillRect(x + 1, y + 2, 1, 2);
  }
}

const CHIFFRES: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  j: '001000001101010', ',': '000000000010100', A: '010101111101101', B: '110101110101110', C: '011100100100011', ' ': '000000000000000',
};
/** Petits chiffres de 3 × 5 px, pour écrire dans le monde lui-même. Retourne la largeur écrite. */
export function chiffres(c: Ctx, texte: string, x: number, y: number, couleur: string): number {
  c.fillStyle = couleur;
  let dx = 0;
  for (const ch of texte) {
    const g = CHIFFRES[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(Math.round(x) + dx + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1);
    dx += 4;
  }
  return dx;
}
