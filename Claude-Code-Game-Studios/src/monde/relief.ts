// Relief du monde : hauteur, lumière, nature du sol et arbres. Calculé une fois,
// sans dessin ; les saisons ne changent que les couleurs.

import { alea } from '../game/rules';
import { BATIMENTS, CENTRES, CHEMINS, LAC, MONDE_H, MONDE_L, PARCELLES, RETENUE, RIVIERE, STYLES, coinsParcelle, dansParcelle, demiLit, rho } from './plan';

export const HERBE = 0, ROCHE = 1, LAC_ = 2, RETENUE_ = 3, LIT = 4, TERRE = 5, CHEMIN = 6, PARCELLE = 7, SABLE = 8;
export interface Arbre { x: number; y: number; r: number; conifere: boolean; graine: number }
export interface Relief {
  h: Float32Array; lumiere: Float32Array; classe: Uint8Array; boise: Float32Array; riviereF: Float32Array;
  arbres: Arbre[]; rive: { x: number; y: number; rho: number; lac: boolean }[];
}

/** Bruit lissé stable dans [0, 1]. */
export function bruit(x: number, y: number, graine: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = alea(xi + graine * 57, yi), b = alea(xi + 1 + graine * 57, yi), c = alea(xi + graine * 57, yi + 1), d = alea(xi + 1 + graine * 57, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Bruit à trois octaves, dans [0, 1]. */
export function fbm(x: number, y: number, graine: number): number {
  return bruit(x, y, graine) * 0.57 + bruit(x * 2.1, y * 2.1, graine + 1) * 0.29 + bruit(x * 4.3, y * 4.3, graine + 2) * 0.14;
}
const lisse = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

let memo: Relief | null = null;
/** Relief du monde, calculé à la première demande. */
export function relief(): Relief {
  if (memo) return memo;
  const L = MONDE_L, H = MONDE_H, n = L * H;
  // Distance à la rivière et fraction du cours, sur une grille de 4 px.
  const gl = Math.ceil(L / 4) + 1, gh = Math.ceil(H / 4) + 1;
  const gd = new Float32Array(gl * gh), gf = new Float32Array(gl * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gl; i++) {
    let best = 1e9, bf = 0;
    const x = i * 4, y = j * 4;
    for (let k = 0; k < RIVIERE.length; k += 2) {
      const d = (RIVIERE[k][0] - x) ** 2 + (RIVIERE[k][1] - y) ** 2;
      if (d < best) { best = d; bf = k / (RIVIERE.length - 1); }
    }
    gd[j * gl + i] = Math.sqrt(best); gf[j * gl + i] = bf;
  }
  const dRiv = (x: number, y: number): number => {
    const i = Math.floor(x / 4), j = Math.floor(y / 4), fx = x / 4 - i, fy = y / 4 - j, o = j * gl + i;
    return (gd[o] * (1 - fx) + gd[o + 1] * fx) * (1 - fy) + (gd[o + gl] * (1 - fx) + gd[o + gl + 1] * fx) * fy;
  };
  const h = new Float32Array(n), lumiere = new Float32Array(n), classe = new Uint8Array(n), boise = new Float32Array(n), riviereF = new Float32Array(n);
  const hauteur = (x: number, y: number): number => {
    const nord = lisse(1 - (x * 0.95 + y * 1.6) / 560) * 1.35;
    const haut = lisse(1 - (y + (bruit(x / 60, 0, 8) - 0.5) * 60) / 80) * 0.42 + lisse(1 - (Math.abs(x - 560) / 250 + y / 170)) * 0.6;
    const sud = lisse(1 - (x * 0.8 + (H - y) * 1.5) / 420) * 0.95 + lisse(1 - (Math.abs(x - 300) / 260 + (H - y) / 120)) * 0.45;
    const est = lisse(1 - ((L - x) * 1.1 + y * 1.5) / 330) * 0.6;
    const masses = nord + haut + sud + est;
    const d = dRiv(x, y);
    // Le fond de vallée reste calme ; le bruit ne sculpte que les hauteurs.
    return masses + (fbm(x / 70, y / 70, 3) - 0.5) * (0.1 + Math.min(1, masses) * 0.55) + (bruit(x / 19, y / 19, 6) - 0.5) * 0.1 * Math.min(1, masses * 1.5) - Math.exp(-((d / 70) ** 2)) * 0.2;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) h[y * L + x] = hauteur(x, y);
  const stylo = (cx: number, cy: number, r: number, c: number, seulement?: number): void => {
    for (let y = Math.max(0, Math.floor(cy - r - 2)); y <= Math.min(H - 1, cy + r + 2); y++) for (let x = Math.max(0, Math.floor(cx - r - 2)); x <= Math.min(L - 1, cx + r + 2); x++) {
      const i = y * L + x;
      if (seulement !== undefined && classe[i] !== seulement && classe[i] !== c) continue;
      if (Math.hypot(x - cx, y - cy) < r + (alea(x, y) - 0.5) * 1.6) classe[i] = c;
    }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const i = y * L + x;
    const gx = h[y * L + Math.min(L - 1, x + 2)] - h[y * L + Math.max(0, x - 2)], gy = h[Math.min(H - 1, y + 2) * L + x] - h[Math.max(0, y - 2) * L + x];
    const pente = Math.hypot(gx, gy);
    // Lumière de l'ouest et du sud : les pentes tournées vers le spectateur sont claires.
    lumiere[i] = 0.5 + (gx - gy * 0.7) * 8;
    const d = dRiv(x, y), f = gf[Math.floor(y / 4) * gl + Math.floor(x / 4)];
    riviereF[i] = f;
    const ondule = (bruit(x / 9, y / 9, 11) - 0.5) * 0.09;
    const rl = rho(LAC, x, y) + ondule, rr = rho(RETENUE, x, y) + ondule * 1.5;
    boise[i] = fbm(x / 74, y / 74, 21) * 0.62 + Math.min(1.1, Math.max(0, h[i])) * 0.62 + 0.08 - Math.exp(-((d / 72) ** 2)) * 0.3;
    if (rl < 1) classe[i] = LAC_;
    else if (rr < 1) classe[i] = RETENUE_;
    else if (d < demiLit(f) + 1.2 && y > 100) classe[i] = LIT;
    else if (rl < 1.045 || rr < 1.07 || (d < demiLit(f) + 3 + ondule * 20 && y > 100)) classe[i] = SABLE;
    else if ((pente > 0.05 && h[i] > 0.5) || h[i] > 1.12 + (bruit(x / 23, y / 23, 14) - 0.5) * 0.3) classe[i] = ROCHE;
    else classe[i] = HERBE;
  }
  // Places de village, chemins et parcelles.
  for (const [id, [cx, cy]] of Object.entries(CENTRES)) {
    const r = 15 + STYLES[id].maisons * 1.3;
    for (let k = 0; k < 26; k++) stylo(cx + (alea(k, cx) - 0.5) * r * 2.4, cy + (alea(cy, k) - 0.5) * r * 1.3 + 4, 5 + alea(k, k + cx) * 7, TERRE, HERBE);
  }
  for (const b of BATIMENTS) for (let dx = -2; dx <= b.l + 2; dx += 3) stylo(b.x + dx, b.y + 2, 4.5, TERRE, HERBE);
  for (const c of CHEMINS) for (let k = 0; k < c.points.length - 1; k++) {
    const [xa, ya] = c.points[k], [xb, yb] = c.points[k + 1], m = Math.ceil(Math.hypot(xb - xa, yb - ya));
    for (let j = 0; j < m; j++) for (const cible of [HERBE, ROCHE, SABLE, TERRE]) stylo(xa + ((xb - xa) * j) / m, ya + ((yb - ya) * j) / m, c.large ? 2.1 : 1.4, CHEMIN, cible);
  }
  for (const p of PARCELLES) {
    const coins = coinsParcelle(p), xs = coins.map(q => q[0]), ys = coins.map(q => q[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const [a, b] = dansParcelle(p, x + 0.5, y + 0.5);
      if (a >= 0 && a < 1 && b >= 0 && b < 1) classe[y * L + x] = PARCELLE;
    }
  }
  // Interdits pour les arbres : près de l'eau, des chemins, des parcelles, des bâtiments.
  const interdit = new Uint8Array(n);
  const tampon = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(L - 1, x1); x++) interdit[y * L + x] = 1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const c = classe[y * L + x];
    if (c !== HERBE && c !== TERRE) tampon(x - (c === ROCHE ? 1 : 4), y - (c === ROCHE ? 1 : 3), x + (c === ROCHE ? 1 : 4), y + (c === PARCELLE || c === CHEMIN || c === LIT ? 7 : 4));
  }
  for (const b of BATIMENTS) tampon(b.x - 6, b.y - 26, b.x + b.l + 6, b.y + 9);
  const arbres: Arbre[] = [];
  for (let y = 5; y < H - 2; y += 4) for (let x = 3; x < L - 3; x += 4) {
    const ax = x + Math.floor(alea(x, y) * 4), ay = y + Math.floor(alea(y + 9, x) * 4);
    if (ax >= L || ay >= H) continue;
    const i = ay * L + ax;
    if (interdit[i]) continue;
    const village = Object.values(CENTRES).reduce((m, q) => Math.min(m, Math.hypot(q[0] - ax, (q[1] - ay) * 1.4)), 1e9);
    const densite = boise[i] - (village < 62 ? 0.5 : village < 100 ? (100 - village) / 76 : 0);
    const p = Math.max(0.018, Math.min(1, (densite - 0.47) * 6));
    const haie = PARCELLES.some(pa => { const [a, b] = dansParcelle(pa, ax, ay - 2); return a > -0.25 && a < 1.25 && b > -0.5 && b < 1.5; });
    if (alea(ax + 13, ay + 7) > (haie ? Math.max(p, 0.2) : classe[i] === TERRE ? 0.05 : p)) continue;
    const conifere = h[i] > 0.6 + (alea(ax, ay + 3) - 0.5) * 0.3 && alea(ay + 5, ax + 2) < 0.8;
    arbres.push({ x: ax, y: ay, r: conifere ? 3 : 3 + Math.floor(alea(ax + 1, ay) * 2.8), conifere, graine: Math.floor(alea(ay, ax) * 1e6) });
  }
  arbres.sort((a, b) => a.y - b.y || a.x - b.x);
  // Rives : les pixels que l'eau découvre quand son niveau baisse.
  const rive: Relief['rive'] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const c = classe[y * L + x];
    if (c === LAC_ && rho(LAC, x, y) > 0.9) rive.push({ x, y, rho: (rho(LAC, x, y) - 0.9) / 0.1, lac: true });
    else if (c === RETENUE_ && rho(RETENUE, x, y) > 0.35) rive.push({ x, y, rho: (rho(RETENUE, x, y) - 0.35) / 0.65, lac: false });
  }
  memo = { h, lumiere, classe, boise, riviereF, arbres, rive };
  return memo;
}
