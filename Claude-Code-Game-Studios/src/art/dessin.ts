// Pixel art dessiné par le code : palette, sols, bâtiments et habitants.
// Aucun fichier image : chaque forme est posée au pixel, à l'échelle 1, sur un
// canevas de 360 × 232 que la page agrandit par un facteur entier.

import { alea } from '../game/rules';

export const LARGEUR = 360;
export const HAUTEUR = 232;

export type Ambiance = 'printemps' | 'été' | 'automne' | 'hiver' | 'sécheresse';

/** Teintes des sols selon la saison : verts sourds, terres claires, eau plus froide. */
export const SOLS: Record<Ambiance, { herbe: string[]; arbre: string; arbre2: string }> = {
  printemps: { herbe: ['#84a468', '#7b9c60', '#8eae72'], arbre: '#4f7a4a', arbre2: '#3f6840' },
  'été': { herbe: ['#8ba562', '#829d5b', '#96ae6b'], arbre: '#4c7445', arbre2: '#3d623a' },
  'sécheresse': { herbe: ['#b0a66a', '#a69b60', '#bab176'], arbre: '#7d8650', arbre2: '#687244' },
  automne: { herbe: ['#a0995e', '#958d55', '#aba468'], arbre: '#b07a3c', arbre2: '#8f5f34' },
  hiver: { herbe: ['#9ba896', '#919f8d', '#a7b3a2'], arbre: '#6d7f72', arbre2: '#5b6d62' },
};

export const C = {
  eau: '#4b7a96', eauClaire: '#73a0b8', eauSombre: '#3a637d', sable: '#d9c9a0', sableSombre: '#c2b086',
  chemin: '#dccba4', cheminBord: '#bba77e', mur: '#efe4ca', murOmbre: '#d5c7a8', tuile: '#b45a3b', tuileOmbre: '#8f432c',
  ardoise: '#5d6670', ardoiseOmbre: '#474f58', bois: '#7c5b3d', boisSombre: '#5e442d', pierre: '#9c988d', pierreOmbre: '#7e7a70',
  terre: '#9a7c57', terreSombre: '#84694a', pousse: '#6f9a55', mur2: '#e6d3b0', or: '#d7b450', sec: '#bba462',
  encre: '#2b2a26', ombre: 'rgba(38,34,28,0.28)', alerte: '#b5532f', blanc: '#f6f0e2', ocre: '#c98a4b',
};

type Ctx = CanvasRenderingContext2D;

/** Rectangle plein aux coordonnées entières. */
export function rect(c: Ctx, x: number, y: number, w: number, h: number, couleur: string): void {
  c.fillStyle = couleur;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Sol herbeux tramé, stable d'une image à l'autre. */
export function sol(c: Ctx, ambiance: Ambiance, graine: number): void {
  const p = SOLS[ambiance].herbe;
  rect(c, 0, 0, LARGEUR, HAUTEUR, p[0]);
  for (let y = 0; y < HAUTEUR; y += 4) {
    for (let x = 0; x < LARGEUR; x += 4) {
      const a = alea(x + graine * 131, y);
      if (a < 0.16) rect(c, x, y, 4, 4, p[1]);
      else if (a > 0.86) rect(c, x, y, 4, 4, p[2]);
      else if (a > 0.82) rect(c, x + 1, y + 2, 1, 2, p[1]);
    }
  }
}

/** Trait épais fait de carrés, pour les routes et les cours d'eau. */
export function trait(c: Ctx, points: [number, number][], epaisseur: number, couleur: string): void {
  c.fillStyle = couleur;
  const d = epaisseur / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      c.fillRect(Math.round(x0 + ((x1 - x0) * k) / n - d), Math.round(y0 + ((y1 - y0) * k) / n - d), Math.ceil(epaisseur), Math.ceil(epaisseur));
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

/** Petit arbre vu du dessus. */
export function arbre(c: Ctx, x: number, y: number, ambiance: Ambiance, grand = false): void {
  const s = SOLS[ambiance];
  const r = grand ? 4 : 3;
  rect(c, x - r + 1, y + r - 1, r * 2, 2, C.ombre);
  rect(c, x - r, y - r + 1, r * 2, r * 2 - 2, s.arbre2);
  rect(c, x - r + 1, y - r, r * 2 - 2, r * 2, s.arbre2);
  rect(c, x - r + 1, y - r + 1, r * 2 - 3, r * 2 - 3, s.arbre);
  if (ambiance === 'hiver') rect(c, x - 1, y - r + 1, 2, 1, C.blanc);
}

/** Maison vue du dessus : murs clairs, toit à deux pans, porte au sud. */
export function maison(c: Ctx, x: number, y: number, w: number, h: number, toit: 'tuile' | 'ardoise' | 'ocre' = 'tuile'): void {
  const clair = toit === 'tuile' ? C.tuile : toit === 'ardoise' ? C.ardoise : C.ocre;
  const sombre = toit === 'tuile' ? C.tuileOmbre : toit === 'ardoise' ? C.ardoiseOmbre : '#a56c38';
  const hToit = Math.round(h * 0.62);
  rect(c, x + 2, y + h - 1, w, 3, C.ombre);
  rect(c, x, y + hToit - 1, w, h - hToit + 1, C.mur);
  rect(c, x, y + h - 2, w, 2, C.murOmbre);
  rect(c, x - 1, y, w + 2, hToit, clair);
  rect(c, x - 1, y + Math.floor(hToit / 2), w + 2, hToit - Math.floor(hToit / 2), sombre);
  rect(c, x - 1, y + Math.floor(hToit / 2) - 1, w + 2, 1, C.blanc + '55');
  rect(c, x + Math.floor(w / 2) - 1, y + h - 4, 3, 4, C.boisSombre);
  if (w >= 14) {
    rect(c, x + 2, y + hToit + 1, 2, 2, C.eauSombre);
    rect(c, x + w - 4, y + hToit + 1, 2, 2, C.eauSombre);
  }
}

/** Entrepôt ou grenier : long bâtiment, grande porte, jauge de remplissage et portail. */
export function entrepot(c: Ctx, x: number, y: number, w: number, h: number, remplissage: number, partReservee = 0): void {
  rect(c, x + 3, y + h - 1, w, 4, C.ombre);
  rect(c, x, y + Math.round(h * 0.45), w, Math.round(h * 0.55), C.mur2);
  rect(c, x, y + h - 2, w, 2, C.murOmbre);
  rect(c, x - 1, y, w + 2, Math.round(h * 0.5), C.ardoise);
  rect(c, x - 1, y + Math.round(h * 0.25), w + 2, Math.round(h * 0.25), C.ardoiseOmbre);
  for (let i = 4; i < w - 2; i += 6) rect(c, x + i, y + 1, 1, Math.round(h * 0.5) - 2, C.ardoiseOmbre);
  // Jauge : ce que le lieu contient, visible sans ouvrir sa fiche.
  rect(c, x + w - 5, y + Math.round(h * 0.5) + 1, 3, Math.round(h * 0.5) - 4, C.encre);
  const hj = Math.round((Math.round(h * 0.5) - 6) * Math.max(0, Math.min(1, remplissage)));
  rect(c, x + w - 4, y + h - 4 - hj, 1, hj, remplissage < 0.15 ? C.alerte : C.or);
  // Portes : une par tranche de capacité ; celles qui sont réservées portent une grille.
  const portes = 5, lp = Math.max(3, Math.floor((w - 10) / portes) - 1);
  for (let i = 0; i < portes; i++) {
    const px = x + 2 + i * (lp + 1);
    const reservee = i >= portes - Math.round(partReservee * portes);
    rect(c, px, y + h - 7, lp, 7, C.boisSombre);
    if (reservee && partReservee > 0) {
      rect(c, px, y + h - 7, lp, 7, C.encre);
      for (let g = 0; g < lp; g += 2) rect(c, px + g, y + h - 7, 1, 7, C.alerte);
      rect(c, px, y + h - 4, lp, 1, C.alerte);
    }
  }
}

/** Silo de la réserve de secours. */
export function silo(c: Ctx, x: number, y: number, remplissage: number): void {
  rect(c, x + 2, y + 23, 14, 3, C.ombre);
  rect(c, x, y + 4, 12, 20, C.pierre);
  rect(c, x + 8, y + 4, 4, 20, C.pierreOmbre);
  rect(c, x + 1, y + 1, 10, 3, C.alerte);
  rect(c, x + 3, y, 6, 1, C.alerte);
  const hj = Math.round(16 * Math.max(0, Math.min(1, remplissage)));
  rect(c, x + 2, y + 6, 2, 16, C.encre);
  rect(c, x + 2, y + 22 - hj, 2, hj, C.or);
  rect(c, x + 5, y + 10, 3, 1, C.blanc);
  rect(c, x + 6, y + 9, 1, 3, C.blanc);
}

/** Station de pompage : cabane, roue et tuyau ; l'état se lit à la roue et au voyant. */
export function pompe(c: Ctx, x: number, y: number, etat: number, t: number): void {
  rect(c, x + 2, y + 13, 14, 3, C.ombre);
  rect(c, x, y + 5, 13, 9, C.pierre);
  rect(c, x, y + 12, 13, 2, C.pierreOmbre);
  rect(c, x - 1, y + 2, 15, 4, C.ardoise);
  rect(c, x + 13, y + 9, 8, 2, C.ardoiseOmbre);
  const tourne = etat >= 0.35 && Math.floor(t * 4) % 2 === 0;
  rect(c, x + 3, y + 7, 5, 5, C.encre);
  rect(c, tourne ? x + 5 : x + 3, y + 9, tourne ? 1 : 5, 1, C.blanc);
  rect(c, x + 5, tourne ? y + 7 : y + 9, 1, tourne ? 5 : 1, C.blanc);
  rect(c, x + 10, y + 7, 2, 2, etat < 0.35 ? C.alerte : etat < 0.85 ? C.or : C.pousse);
}

/** Parcelle cultivée : sol nu, rangs qui poussent, culture mûre ou sèche. */
export function champ(c: Ctx, x: number, y: number, w: number, h: number, phase: number, avancement: number, eau: number): void {
  rect(c, x - 1, y - 1, w + 2, h + 2, C.terreSombre);
  rect(c, x, y, w, h, C.terre);
  const sec = eau < 0.6;
  for (let ry = 2; ry < h - 1; ry += 4) {
    rect(c, x + 1, y + ry + 2, w - 2, 1, C.terreSombre);
    if (phase === 0) continue;
    const couleur = phase === 2 || avancement > 0.92 ? C.or : sec ? C.sec : C.pousse;
    const taille = phase === 2 ? 3 : avancement < 0.3 ? 1 : avancement < 0.7 ? 2 : 3;
    for (let rx = 2; rx < w - 2; rx += 3) {
      if (sec && alea(x + rx, y + ry) < (0.6 - eau) * 1.2) continue;
      rect(c, x + rx, y + ry + 2 - taille, 2, taille, couleur);
    }
  }
  if (sec && phase === 1) {
    for (let i = 0; i < (w * h) / 220; i++) {
      const fx = x + 2 + Math.floor(alea(i, x + y) * (w - 6)), fy = y + 2 + Math.floor(alea(x, i + y) * (h - 5));
      rect(c, fx, fy, 3, 1, C.terreSombre);
      rect(c, fx + 1, fy + 1, 1, 2, C.terreSombre);
    }
  }
}

export interface Allure { age: number; metier: number; graine: number }

const PEAUX = ['#f0cfa8', '#e2b98e', '#c9976b', '#a87850', '#8a5f3e'];
const CHEVEUX = ['#3b2a20', '#5a3c26', '#8a5a30', '#c49a52', '#2a2422'];
const TENUES = ['#8c8478', '#5e8a52', '#4d7391', '#c98a4b'];

/**
 * Habitant de 16 × 24 px, pieds en (x + 8, y + 23). Les enfants sont plus petits,
 * les aînés ont les cheveux gris ; la tenue suit l'activité.
 */
export function habitant(c: Ctx, x: number, y: number, a: Allure, pas: number, suivi = false): void {
  const enfant = a.age < 16, petit = a.age < 6;
  const peau = PEAUX[Math.floor(alea(a.graine, 1) * PEAUX.length)];
  const cheveux = a.age >= 65 ? '#c9c5bb' : CHEVEUX[Math.floor(alea(a.graine, 2) * CHEVEUX.length)];
  const tenue = enfant ? ['#c0705a', '#6b8fa8', '#d1a94e', '#7d9a6a'][Math.floor(alea(a.graine, 3) * 4)] : TENUES[a.metier] ?? TENUES[0];
  const bas = alea(a.graine, 4) < 0.5 ? '#4a4038' : '#5b5046';
  const hCorps = petit ? 4 : enfant ? 6 : 8, lCorps = petit ? 5 : enfant ? 6 : 8, hTete = petit ? 5 : enfant ? 6 : 7;
  const hJambes = petit ? 2 : enfant ? 3 : 4;
  const cx = x + 8, pied = y + 23;
  const gx = cx - Math.floor(lCorps / 2);
  rect(c, gx - 1, pied - 1, lCorps + 2, 2, C.ombre);
  const marche = pas % 2;
  rect(c, gx + 1, pied - hJambes + (marche ? 0 : 1), 2, hJambes - (marche ? 0 : 1), bas);
  rect(c, gx + lCorps - 3, pied - hJambes + (marche ? 1 : 0), 2, hJambes - (marche ? 1 : 0), bas);
  const yCorps = pied - hJambes - hCorps;
  rect(c, gx, yCorps, lCorps, hCorps, tenue);
  rect(c, gx + lCorps - 2, yCorps + 1, 2, hCorps - 1, 'rgba(0,0,0,0.16)');
  rect(c, gx - 1, yCorps + 1, 1, hCorps - 3, tenue);
  rect(c, gx + lCorps, yCorps + 1, 1, hCorps - 3, tenue);
  rect(c, gx - 1, yCorps + hCorps - 2, 1, 1, peau);
  rect(c, gx + lCorps, yCorps + hCorps - 2, 1, 1, peau);
  const lTete = lCorps - (enfant ? 0 : 2), tx = cx - Math.floor(lTete / 2), yTete = yCorps - hTete + 1;
  rect(c, tx, yTete, lTete, hTete, peau);
  rect(c, tx, yTete, lTete, Math.ceil(hTete / 2.4), cheveux);
  rect(c, tx, yTete, 1, hTete - 2, cheveux);
  if (alea(a.graine, 5) < 0.5) rect(c, tx + lTete - 1, yTete, 1, hTete - 1, cheveux);
  rect(c, tx + 1 + (lTete > 5 ? 1 : 0), yTete + Math.ceil(hTete / 2.4) + 1, 1, 1, C.encre);
  rect(c, tx + lTete - 2 - (lTete > 5 ? 1 : 0), yTete + Math.ceil(hTete / 2.4) + 1, 1, 1, C.encre);
  if (!enfant && a.metier === 1) rect(c, tx - 1, yTete, lTete + 2, 1, '#d8c27a');
  if (suivi) {
    rect(c, cx - 3, yTete - 7, 7, 2, C.alerte);
    rect(c, cx - 2, yTete - 5, 5, 1, C.alerte);
    rect(c, cx - 1, yTete - 4, 3, 1, C.alerte);
    rect(c, cx, yTete - 3, 1, 1, C.alerte);
  }
}

/** Charrette de livraison ; un fanion rouge marque une tournée de secours. */
export function charrette(c: Ctx, x: number, y: number, secours: boolean): void {
  rect(c, x - 2, y - 2, 5, 3, C.bois);
  rect(c, x - 1, y - 3, 3, 1, C.or);
  rect(c, x - 2, y + 1, 1, 1, C.encre);
  rect(c, x + 2, y + 1, 1, 1, C.encre);
  if (secours) {
    rect(c, x + 2, y - 6, 1, 4, C.encre);
    rect(c, x + 3, y - 6, 3, 2, C.alerte);
  }
}

/** Pluie fine, quand il pleut ce jour-là. */
export function pluie(c: Ctx, t: number, force: number): void {
  c.fillStyle = 'rgba(235,242,248,0.5)';
  const n = Math.min(120, Math.round(force * 12));
  for (let i = 0; i < n; i++) {
    const x = (alea(i, 11) * LARGEUR + t * 40) % LARGEUR, y = (alea(i, 12) * HAUTEUR + t * 160) % HAUTEUR;
    c.fillRect(Math.round(x), Math.round(y), 1, 3);
  }
}
