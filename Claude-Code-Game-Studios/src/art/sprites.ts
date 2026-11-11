// Sprites dessinés par le code : arbres, bâtiments en vue trois quarts,
// habitants, charrettes. La lumière vient du nord-ouest : faces claires en haut
// à gauche, ombres portées en bas à droite.

import { alea } from '../game/rules';
import type { Batiment } from '../monde/plan';
import { C, MURS, TOITS, type Palette, type Trio } from './palette';

type Ctx = CanvasRenderingContext2D;
export type Fenetre = [number, number, number, number];
const OMBRE = 'rgba(22,26,30,0.28)';

/** Rectangle plein aux coordonnées entières. */
export function r(c: Ctx, x: number, y: number, w: number, h: number, couleur: string): void {
  c.fillStyle = couleur;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function disque(c: Ctx, cx: number, cy: number, rayon: number, couleur: string, graine: number): void {
  c.fillStyle = couleur;
  for (let y = -rayon; y <= rayon; y++) {
    const w = Math.round(Math.sqrt(rayon * rayon - y * y) + (alea(graine, y) - 0.5) * 0.9);
    if (w >= 0) c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

/** Feuillu : une houppe sombre, un cœur plus clair, un éclat de lumière au nord-ouest. */
export function feuillu(c: Ctx, x: number, y: number, rayon: number, t: Trio, graine: number): void {
  disque(c, x + 2, y + 1, rayon, OMBRE, graine);
  disque(c, x, y - rayon + 1, rayon, t[0], graine);
  disque(c, x - 1, y - rayon, rayon - 1, t[1], graine + 1);
  if (rayon > 2) disque(c, x - 1, y - rayon - 1, rayon - 2.4, t[2], graine + 2);
  if (alea(graine, 9) < 0.5) r(c, x + 1, y - rayon + 1, 1, 1, t[2]);
}
/** Arbre nu de l'hiver : un tronc et quelques branches. */
export function arbreNu(c: Ctx, x: number, y: number, rayon: number, graine: number): void {
  r(c, x + 1, y, rayon + 1, 1, OMBRE);
  r(c, x, y - rayon - 1, 1, rayon + 2, '#5b4a40');
  for (let k = 0; k < rayon + 1; k++) {
    const cote = k % 2 ? 1 : -1, yy = y - 2 - k;
    r(c, x + cote, yy, 1, 1, '#6d5a4c'); r(c, x + cote * 2, yy - 1, 1, 1, '#84705f');
    if (alea(graine, k) < 0.5) r(c, x + cote * 3, yy - 1, 1, 1, '#84705f');
  }
}
/** Conifère : une pointe sombre, plus claire côté lumière. */
export function conifere(c: Ctx, x: number, y: number, t: Trio, neige: string | null, graine: number): void {
  const h = 9 + (graine % 4);
  r(c, x, y, 5, 1, OMBRE); r(c, x + 1, y + 1, 4, 1, OMBRE);
  for (let k = 0; k < h; k++) {
    const etage = k % 3, w = Math.min(3, Math.round(0.4 + (k / h) * 2.2 + etage * 0.5));
    r(c, x - w, y - h + k, w * 2 + 1, 1, t[0]);
    r(c, x - w, y - h + k, Math.max(1, w), 1, t[1]);
    if (etage === 0) r(c, x - w, y - h + k, 1 + (k > 3 ? 1 : 0), 1, neige ?? t[2]);
  }
  if (neige) r(c, x, y - h - 1, 1, 2, neige);
}

function toiture(c: Ctx, x: number, y: number, w: number, h: number, t: Trio, graine: number, neige: string | null): void {
  r(c, x, y, w, h, t[1]);
  for (let j = 1; j < h - 1; j++) for (let i = (j * 2 + graine) % 3; i < w - 2; i += 3) r(c, x + i, y + j, 1, 1, j % 2 ? t[0] : t[2]);
  r(c, x, y, w, 1, neige ?? t[2]);
  if (neige) for (let i = 0; i < w; i++) if (alea(i + graine, y) < 0.55) r(c, x + i, y + 1, 1, 1, neige);
  r(c, x, y + h - 1, w, 1, t[0]);
  r(c, x + w - 2, y + 1, 2, h - 1, t[0]);
}
function facade(c: Ctx, x: number, y: number, w: number, h: number, m: Trio): void {
  r(c, x, y - h, w, h, m[1]);
  r(c, x, y - h, w, 1, m[0]);
  r(c, x + w - 2, y - h, 2, h, m[0]);
  r(c, x, y - 1, w - 2, 1, m[2]);
}
function ombrePortee(c: Ctx, x: number, y: number, w: number, h: number): void {
  r(c, x + 2, y, w + 1, 2, OMBRE);
  r(c, x + w, y - h + 2, 3, h - 2, OMBRE);
}

/**
 * Dessine un bâtiment du plan et retourne ses fenêtres, que la nuit allume.
 * `neige` blanchit le faîte des toits en hiver.
 */
export function batir(c: Ctx, b: Batiment, neige: string | null): Fenetre[] {
  const toit = TOITS[b.toit], mur = MURS[b.mur], f: Fenetre[] = [];
  const { x, y, l } = b;
  if (b.genre === 'maison' || b.genre === 'cabane') {
    const hm = 6, ht = 7;
    ombrePortee(c, x, y, l, hm + 3);
    facade(c, x, y, l, hm, mur);
    if (b.pignon) {
      r(c, x - 1, y - hm - ht, l + 2, ht, toit[1]);
      r(c, x - 1, y - hm - ht, Math.ceil(l / 2) + 1, ht, toit[2]);
      r(c, x + Math.ceil(l / 2), y - hm - ht, l + 1 - Math.ceil(l / 2), ht, toit[0]);
      for (let j = 1; j < ht; j += 2) for (let i = (j + b.graine) % 3; i < l; i += 3) r(c, x + i, y - hm - ht + j, 1, 1, toit[1]);
      r(c, x + Math.ceil(l / 2) - 1, y - hm - ht, 1, ht, neige ?? toit[2]);
      const g = Math.min(4, Math.floor(l / 2) - 2);
      for (let k = 0; k < g; k++) { const d = Math.round(((k + 1) * (l / 2)) / (g + 1)); r(c, x + d, y - hm - 1 - k, l - d * 2, 1, mur[1]); }
      r(c, x + Math.floor(l / 2) - 1, y - hm - 2, 2, 2, C.sombre); f.push([x + Math.floor(l / 2) - 1, y - hm - 2, 2, 2]);
    } else {
      toiture(c, x - 1, y - hm - ht, l + 2, ht, toit, b.graine, neige);
      if (b.graine % 2 === 0) { r(c, x + l - 5, y - hm - ht - 2, 2, 3, mur[0]); r(c, x + l - 5, y - hm - ht - 3, 2, 1, C.sombre); }
    }
    const porte = x + (b.graine % 3 === 0 ? 2 : Math.floor(l / 2) - 1);
    r(c, porte, y - 4, 2, 4, C.bois);
    for (const fx of [x + 2, x + l - 5, x + Math.floor(l / 2) + 2]) {
      if (Math.abs(fx - porte) < 3 || fx > x + l - 4) continue;
      r(c, fx, y - 5, 2, 2, C.sombre); f.push([fx, y - 5, 2, 2]);
    }
    return f;
  }
  if (b.genre === 'grenier') {
    const hm = 8, ht = 9, bois: Trio = ['#5e432d', '#7c5a3b', '#9a744d'];
    ombrePortee(c, x, y, l, hm + 3);
    facade(c, x, y, l, hm, bois);
    for (let i = 2; i < l - 2; i += 3) r(c, x + i, y - hm + 1, 1, hm - 1, bois[0]);
    toiture(c, x - 2, y - hm - ht, l + 4, ht, TOITS[3], b.graine, neige);
    r(c, x + Math.floor(l / 2) - 4, y - 7, 8, 7, C.sombre);
    r(c, x + Math.floor(l / 2) - 4, y - 7, 1, 7, bois[2]); r(c, x + Math.floor(l / 2) + 3, y - 7, 1, 7, bois[2]);
    r(c, x + Math.floor(l / 2) - 1, y - hm - 3, 2, 2, C.sombre);
    return f;
  }
  if (b.genre === 'services' || b.genre === 'atelier') {
    const hm = 8, ht = 8;
    ombrePortee(c, x, y, l, hm + 4);
    facade(c, x, y, l, hm, mur);
    toiture(c, x - 1, y - hm - ht, l + 2, ht, toit, b.graine, neige);
    r(c, x + Math.floor(l / 2) - 1, y - 5, 3, 5, C.bois);
    for (let i = 2; i < l - 3; i += 4) { if (Math.abs(x + i - (x + l / 2)) < 3) continue; r(c, x + i, y - 6, 2, 3, C.sombre); f.push([x + i, y - 6, 2, 3]); }
    if (b.genre === 'services') {
      // Clocheton : on reconnaît l'école et la salle commune de loin.
      r(c, x + 2, y - hm - ht - 9, 6, 11, mur[1]); r(c, x + 6, y - hm - ht - 9, 2, 11, mur[0]);
      r(c, x + 1, y - hm - ht - 12, 8, 3, toit[1]); r(c, x + 2, y - hm - ht - 14, 6, 2, toit[2]); r(c, x + 4, y - hm - ht - 16, 2, 2, toit[2]);
      r(c, x + 4, y - hm - ht - 7, 2, 3, C.sombre); f.push([x + 4, y - hm - ht - 7, 2, 3]);
    } else {
      r(c, x + l - 7, y - hm - ht - 12, 4, 14, '#8a5a48'); r(c, x + l - 5, y - hm - ht - 12, 2, 14, '#6f4638'); r(c, x + l - 8, y - hm - ht - 13, 6, 2, C.sombre);
      r(c, x + 3, y - 6, 5, 6, C.sombre);
    }
    return f;
  }
  if (b.genre === 'entrepot') {
    const hm = 11, ht = 14;
    ombrePortee(c, x, y, l, hm + 6);
    facade(c, x, y, l, hm, MURS[0]);
    toiture(c, x - 2, y - hm - ht, l + 4, ht, toit, b.graine, neige);
    for (let i = 6; i < l - 6; i += 12) { r(c, x + i, y - hm - ht + 4, 6, 3, toit[0]); r(c, x + i + 1, y - hm - ht + 5, 4, 1, '#9fb4c2'); f.push([x + i + 1, y - hm - ht + 5, 4, 1]); }
    r(c, x, y - hm, l, 2, MURS[0][0]);
    return f;
  }
  if (b.genre === 'silos') {
    for (let k = 0; k < 3; k++) {
      const sx = x + k * 11, sy = y - (k === 1 ? 3 : 0);
      r(c, sx + 2, sy, 9, 2, OMBRE); r(c, sx + 8, sy - 16, 3, 16, OMBRE);
      r(c, sx, sy - 18, 9, 18, MURS[0][1]); r(c, sx, sy - 18, 2, 18, MURS[0][2]); r(c, sx + 6, sy - 18, 3, 18, MURS[0][0]);
      for (let j = 4; j < 17; j += 5) r(c, sx, sy - j, 9, 1, MURS[0][0]);
      r(c, sx - 1, sy - 21, 11, 3, TOITS[2][1]); r(c, sx + 1, sy - 23, 7, 2, neige ?? TOITS[2][2]); r(c, sx + 3, sy - 24, 3, 1, TOITS[2][2]);
      r(c, sx + 3, sy - 4, 3, 4, C.bois);
    }
    return f;
  }
  // Pompe : une cabane de pierre au bord de l'eau ; la roue est dessinée à chaque image.
  ombrePortee(c, x, y, l, 8);
  facade(c, x, y, l, 6, MURS[2]);
  toiture(c, x - 1, y - 11, l + 2, 5, TOITS[2], b.graine, neige);
  r(c, x + 2, y - 4, 2, 4, C.bois);
  return f;
}

/** Portes de l'entrepôt : une par tranche de capacité ; une porte réservée est grillée et porte une bannière. */
export function portesEntrepot(c: Ctx, b: Batiment, partReservee: number, nuit: boolean): void {
  const n = 5, lp = 9, pas = (b.l - 6) / n, reservees = Math.round(partReservee * n);
  for (let i = 0; i < n; i++) {
    const px = Math.round(b.x + 4 + i * pas), py = b.y - 9;
    if (i >= n - reservees) {
      r(c, px, py, lp, 9, C.droitSombre);
      for (let g = 0; g < lp; g += 2) r(c, px + g, py, 1, 9, C.droit);
      r(c, px, py + 4, lp, 1, C.droit);
      r(c, px + 3, py - 7, 3, 6, C.droit); r(c, px + 3, py - 1, 1, 1, C.droit); r(c, px + 5, py - 1, 1, 1, C.droit);
    } else {
      r(c, px, py, lp, 9, nuit ? '#4a3a22' : C.sombre);
      r(c, px, py, lp, 1, C.bois);
      if (nuit) r(c, px + 3, py + 3, 3, 3, C.lueur);
    }
  }
}

/** Sacs empilés près d'un grenier : la réserve se compte d'un regard. */
export function sacs(c: Ctx, x: number, y: number, nombre: number): void {
  for (let k = 0; k < nombre; k++) {
    const col = k % 4, rang = Math.floor(k / 4);
    r(c, x + col * 4 + (rang % 2) * 2, y - 3 - rang * 3, 4, 3, C.sac);
    r(c, x + col * 4 + (rang % 2) * 2, y - 1 - rang * 3, 4, 1, C.sacOmbre);
    r(c, x + col * 4 + (rang % 2) * 2 + 3, y - 3 - rang * 3, 1, 3, C.sacOmbre);
  }
}

/** Roue de la pompe : elle tourne tant que la pompe marche ; un fanion signale l'entretien en retard. */
export function rouePompe(c: Ctx, x: number, y: number, etat: number, t: number): void {
  const phase = etat >= 0.35 ? Math.floor(t * 5) % 4 : 0;
  r(c, x + 7, y - 6, 6, 6, '#4a3a2c');
  const rayons: [number, number][][] = [[[0, -2], [0, 2]], [[-2, -2], [2, 2]], [[-2, 0], [2, 0]], [[-2, 2], [2, -2]]];
  for (const [dx, dy] of rayons[phase]) r(c, x + 9.5 + dx, y - 3.5 + dy, 1, 1, '#c9a66b');
  r(c, x + 9, y - 4, 2, 2, '#8d6a47');
  if (etat < 0.85) { r(c, x - 2, y - 14, 1, 9, C.sombre); r(c, x - 1, y - 14, 4, 3, etat < 0.35 ? '#b53a2a' : '#e0b040'); }
}

export interface Allure { age: number; metier: number; graine: number }
const TENUES = ['#8c8478', '#5f8a4c', '#4a6f96', '#b0563e'];
const ENFANTS = ['#c96a5a', '#5f8fb0', '#d4a84a', '#7d9a6a'];

/** Habitant de 5 × 9 px, pieds en (x, y). Les enfants sont plus petits ; le chapeau de paille suit les champs. */
export function personne(c: Ctx, x: number, y: number, a: Allure, pas: number, suivi: boolean): void {
  const enfant = a.age < 16;
  const peau = C.peaux[Math.floor(alea(a.graine, 1) * C.peaux.length)];
  const cheveux = a.age >= 65 ? '#d0ccc2' : C.cheveux[Math.floor(alea(a.graine, 2) * C.cheveux.length)];
  const tenue = enfant ? ENFANTS[Math.floor(alea(a.graine, 3) * 4)] : TENUES[a.metier] ?? TENUES[0];
  const hc = enfant ? 2 : 3, hj = enfant ? 1 : 2;
  r(c, x - 1, y, 4, 1, OMBRE);
  r(c, x - 1, y - hj + (pas % 2), 1, hj - (pas % 2), '#3d342c'); r(c, x + 1, y - hj + ((pas + 1) % 2), 1, hj - ((pas + 1) % 2), '#3d342c');
  r(c, x - 1, y - hj - hc, 3, hc, tenue);
  r(c, x + 1, y - hj - hc, 1, hc, 'rgba(0,0,0,0.18)');
  r(c, x - 1, y - hj - hc - 3, 3, 3, peau);
  r(c, x - 1, y - hj - hc - 3, 3, 1, cheveux);
  if (!enfant && a.metier === 1) r(c, x - 2, y - hj - hc - 3, 5, 1, C.paille);
  if (suivi) {
    const haut = y - hj - hc - 9 - (Math.floor(pas / 2) % 2);
    r(c, x - 2, haut, 5, 3, '#fff3c4'); r(c, x - 1, haut + 3, 3, 1, '#fff3c4'); r(c, x, haut + 4, 1, 1, '#fff3c4');
    r(c, x - 1, haut + 1, 3, 1, C.droitSombre);
  }
}

/** Portrait agrandi d'un habitant, pour sa fiche : 12 × 16 px. */
export function portrait(c: Ctx, a: Allure): void {
  const enfant = a.age < 16;
  const peau = C.peaux[Math.floor(alea(a.graine, 1) * C.peaux.length)];
  const cheveux = a.age >= 65 ? '#d0ccc2' : C.cheveux[Math.floor(alea(a.graine, 2) * C.cheveux.length)];
  const tenue = enfant ? ENFANTS[Math.floor(alea(a.graine, 3) * 4)] : TENUES[a.metier] ?? TENUES[0];
  const yt = enfant ? 4 : 2;
  r(c, 1, yt + 9, 10, 16 - yt - 9, tenue); r(c, 8, yt + 10, 3, 16 - yt - 10, 'rgba(0,0,0,0.18)');
  r(c, 5, yt + 7, 2, 2, peau);
  r(c, 3, yt, 6, 8, peau); r(c, 8, yt + 2, 1, 5, 'rgba(0,0,0,0.12)');
  r(c, 3, yt, 6, 2, cheveux); r(c, 2, yt + 1, 1, 4, cheveux);
  if (alea(a.graine, 5) < 0.5) r(c, 9, yt + 1, 1, 5, cheveux);
  r(c, 4, yt + 4, 1, 1, C.sombre); r(c, 7, yt + 4, 1, 1, C.sombre);
  r(c, 5, yt + 6, 2, 1, '#9a5a4a');
  if (!enfant && a.metier === 1) { r(c, 1, yt, 10, 1, C.paille); r(c, 3, yt - 2, 6, 2, C.paille); }
}

/** Charrette et son attelage ; un fanion blanc à croix marque une tournée de secours. */
export function charrette(c: Ctx, x: number, y: number, versDroite: boolean, secours: boolean): void {
  const s = versDroite ? 1 : -1;
  r(c, x - 3, y + 1, 8, 1, OMBRE);
  r(c, x - 3, y - 3, 6, 3, C.boisClair); r(c, x - 3, y - 1, 6, 1, C.bois);
  r(c, x - 2, y - 5, 4, 2, C.sac);
  r(c, x - 3, y, 1, 1, C.sombre); r(c, x + 2, y, 1, 1, C.sombre);
  r(c, x + s * 5 - 1, y - 3, 3, 2, '#7a5a40'); r(c, x + s * 6, y - 4, 1, 1, '#7a5a40'); r(c, x + s * 5 - 1, y - 1, 1, 1, C.sombre); r(c, x + s * 5 + 1, y - 1, 1, 1, C.sombre);
  if (secours) { r(c, x - 1, y - 11, 1, 6, C.sombre); r(c, x, y - 11, 4, 3, '#f4f0e2'); r(c, x + 1, y - 10, 2, 1, '#b53a2a'); }
}

/** Barque sur le lac. */
export function barque(c: Ctx, x: number, y: number): void {
  r(c, x - 3, y, 7, 2, C.bois); r(c, x - 2, y - 1, 5, 1, C.boisClair); r(c, x, y - 6, 1, 5, C.sombre); r(c, x + 1, y - 6, 3, 4, '#efe9d8');
}

/** Tons d'une culture selon son état : sol nu, pousses, vert plein, blé mûr, culture sèche. */
export function tonsCulture(p: Palette, variante: number, phase: number, avancement: number, eau: number): { fond: string; rang: string; clair: string; nu: number } {
  const v = p.culture[variante % p.culture.length];
  if (phase === 0) return { fond: p.terre[0], rang: p.terre[1], clair: p.terre[1], nu: 1 };
  if (phase === 2 || avancement > 0.9) return { fond: C.ble[1], rang: C.ble[0], clair: C.ble[2], nu: 0 };
  if (eau < 0.62) return { fond: C.sec[1], rang: C.sec[0], clair: C.sec[2], nu: Math.min(0.6, (0.7 - eau) * 1.1) };
  if (avancement < 0.2) return { fond: p.terre[1], rang: v[1], clair: p.terre[1], nu: 0.55 };
  if (avancement > 0.74) return { fond: variante % 2 ? v[2] : C.ble[1], rang: v[1], clair: C.ble[2], nu: 0 };
  return { fond: v[1], rang: v[0], clair: v[2], nu: 0 };
}
