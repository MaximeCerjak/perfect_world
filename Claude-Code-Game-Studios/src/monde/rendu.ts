// Rendu du monde. Trois calques par monde affiché :
//  - le sol et les objets (arbres, bâtiments), peints une fois par saison ;
//  - le jour (cultures, niveau de l'eau), repeint quand le jour change ;
//  - le vivant (habitants, charrettes, fumées, reflets, nuit), à chaque image.

import { C, PALETTES, type Ambiance, type Palette } from '../art/palette';
import { arbreNu, barque, batir, charrette, conifere, feuillu, personne, portesEntrepot, r, rouePompe, sacs, tonsCulture, type Fenetre } from '../art/sprites';
import { alea, mesuresDuJour, positionA } from '../game/rules';
import type { Chronologie, FicheCourte, Region } from '../types';
import { BATIMENTS, CENTRES, LAC, MONDE_H, MONDE_L, PARCELLES, POMPES, RETENUE, RIVIERE, batiment, coinsParcelle, dansParcelle, demiLit, maisonsDe, pointDeJour, pointSur, trajetLivraison, trajetSecours, type Pt } from './plan';
import { CHEMIN, HERBE, LAC_, LIT, PARCELLE, RETENUE_, ROCHE, SABLE, TERRE, bruit, fbm, relief } from './relief';

type Ctx = CanvasRenderingContext2D;
const L = MONDE_L, H = MONDE_H;
const rvb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toile = (): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = L; c.height = H; return c; };

/** Ambiance du jour : la saison, ou la sécheresse pendant l'épisode sec. */
export function ambianceDuJour(chrono: Chronologie, region: Region, jour: number): Ambiance {
  const seche = (region.episodes ?? []).some(e => jour >= e.debut_jour + 8 && jour <= e.fin_jour);
  return seche ? 'sécheresse' : ((chrono.saisons[Math.max(0, jour - 1)] ?? 'printemps') as Ambiance);
}

export interface Couches { sol: HTMLCanvasElement; objets: HTMLCanvasElement; fenetres: Fenetre[] }
const memo = new Map<Ambiance, Couches>();

/** Sol et objets d'une saison, peints à la première demande. */
export function couches(a: Ambiance): Couches {
  const deja = memo.get(a);
  if (deja) return deja;
  const p = PALETTES[a], rel = relief();
  const sol = toile(), cs = sol.getContext('2d')!;
  const img = cs.createImageData(L, H), d = img.data;
  const herbe = p.herbe.map(rvb), roche = p.roche.map(rvb), eau = p.eau.map(rvb), sable = p.sable.map(rvb), gravier = p.gravier.map(rvb);
  const chemin = p.chemin.map(rvb), terre = p.terre.map(rvb), sousBois = rvb(p.sousBois), neige = p.neige?.map(rvb) ?? null, fleurs = p.fleurs?.map(rvb) ?? null;
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const i = y * L + x, cl = rel.classe[i], lum = rel.lumiere[i], h = rel.h[i], al = alea(x, y);
    let c: [number, number, number];
    if (cl === HERBE) {
      const v = lum + (bruit(x / 26, y / 20, 31) - 0.5) * 0.16;
      let k = v < 0.3 ? 0 : v < 0.44 ? 1 : v < 0.68 ? 2 : 3;
      if (rel.boise[i] > 0.6) k = Math.max(0, k - 1);
      if (al < 0.03) k = Math.min(3, k + 1); else if (al > 0.972) k = Math.max(0, k - 1);
      c = rel.boise[i] > 0.74 && k < 2 ? sousBois : herbe[k];
      if (fleurs && al > 0.4 && al < 0.4045 && rel.boise[i] < 0.55) c = fleurs[(x + y) % fleurs.length];
      if (neige) {
        const s = h * 0.95 + bruit(x / 21, y / 21, 41) * 0.45;
        if (s > 1.0) c = neige[lum > 0.46 ? 1 : 0]; else if (al > 0.5 && al < 0.5 + (s - 0.45) * 0.22) c = neige[0];
      }
    } else if (cl === ROCHE) {
      // Falaises à facettes : chaque cellule est un pan de roche, éclairé d'un seul ton.
      const fu = (x * 0.9 + y * 0.5) / 17, fv = (y - x * 0.4) / 12, iu = Math.floor(fu), iv = Math.floor(fv);
      let d1 = 9, d2 = 9, graine = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const qx = iu + di + alea(iu + di, iv + dj), qy = iv + dj + alea(iv + dj + 91, iu + di + 17), dd = (qx - fu) ** 2 + (qy - fv) ** 2;
        if (dd < d1) { d2 = d1; d1 = dd; graine = alea((iu + di) * 7 + 3, (iv + dj) * 13 + 5); } else if (dd < d2) d2 = dd;
      }
      const v = lum * 0.6 + 0.22 + (graine - 0.5) * 0.46;
      let k = v < 0.3 ? 0 : v < 0.46 ? 1 : v < 0.64 ? 2 : 3;
      if (Math.sqrt(d2) - Math.sqrt(d1) < 0.07) k = Math.max(0, k - 1);
      c = roche[k];
      if (neige && h > 0.86 + (bruit(x / 9, y / 9, 53) - 0.5) * 0.2 && k > 0) c = neige[k > 2 ? 1 : 0];
    } else if (cl === LAC_ || cl === RETENUE_) {
      const n = fbm(x / 48, y / 22, 61) + (bruit(x / 6, y / 3, 62) - 0.5) * 0.05;
      c = eau[n > 0.6 ? 2 : n > 0.46 ? 1 : 0];
    } else if (cl === LIT) c = gravier[al < 0.6 ? 1 : 0];
    else if (cl === SABLE) c = sable[bruit(x / 7, y / 7, 71) > 0.45 ? 1 : 0];
    else if (cl === TERRE) c = al < 0.08 ? chemin[0] : al > 0.9 ? chemin[2] : chemin[1];
    else if (cl === CHEMIN) c = al < 0.12 ? chemin[1] : chemin[2];
    else c = terre[al < 0.5 ? 0 : 1];
    const o = i * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  cs.putImageData(img, 0, 0);
  // Digue de la retenue : un arc de pierre au sud-est.
  for (let a2 = 0.2; a2 < 1.34; a2 += 0.045) {
    const x = RETENUE.cx + Math.cos(a2) * RETENUE.rx * 1.05, y = RETENUE.cy + Math.sin(a2) * RETENUE.ry * 1.07;
    r(cs, x - 2, y - 2, 5, 6, p.roche[1]); r(cs, x - 2, y - 2, 5, 2, p.roche[3]); r(cs, x - 2, y + 3, 5, 1, p.roche[0]);
  }
  // Haies basses et murets autour des parcelles.
  for (const pa of PARCELLES) {
    const co = coinsParcelle(pa);
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = co[k], [x1, y1] = co[(k + 1) % 4], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let j = 0; j <= n; j++) if (alea(j + k * 17, Math.round(x0 + y0)) < 0.8) r(cs, x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n, 1, 1, pa.terrasse ? p.roche[2] : p.herbe[0]);
    }
  }
  const objets = toile(), co2 = objets.getContext('2d')!;
  const fenetres: Fenetre[] = [];
  // Ponton des Rives et pont de pierre, à plat sous les arbres.
  r(co2, 768, 300, 18, 3, C.boisClair); r(co2, 768, 302, 18, 1, C.bois); for (let k = 0; k < 18; k += 5) r(co2, 769 + k, 303, 1, 2, C.bois);
  r(co2, 399, 348, 10, 22, p.roche[2]); r(co2, 399, 348, 2, 22, p.roche[3]); r(co2, 407, 348, 2, 22, p.roche[0]);
  for (let k = 0; k < 22; k += 4) r(co2, 401, 349 + k, 6, 1, p.roche[1]);
  let ib = 0;
  const neigeToit = p.neige ? p.neige[1] : null;
  for (const ar of rel.arbres) {
    while (ib < BATIMENTS.length && BATIMENTS[ib].y <= ar.y) fenetres.push(...batir(co2, BATIMENTS[ib++], neigeToit));
    if (ar.conifere) conifere(co2, ar.x, ar.y, p.conifere, neigeToit && alea(ar.graine, 4) < 0.7 ? neigeToit : null, ar.graine);
    else if (alea(ar.graine, 6) < p.nu) arbreNu(co2, ar.x, ar.y, ar.r, ar.graine);
    else feuillu(co2, ar.x, ar.y, ar.r, a === 'printemps' ? p.feuillus[alea(ar.graine, 7) < 0.07 ? 4 : ar.graine % 4] : p.feuillus[ar.graine % p.feuillus.length], ar.graine);
  }
  while (ib < BATIMENTS.length) fenetres.push(...batir(co2, BATIMENTS[ib++], neigeToit));
  const c = { sol, objets, fenetres };
  memo.set(a, c);
  return c;
}

// ---- Calque du jour -----------------------------------------------------------------------
interface CalqueJour { canvas: HTMLCanvasElement; img: ImageData; cle: string }
const jours = new Map<string, CalqueJour>();
const niveauRiviere = (chrono: Chronologie, jour: number): number => {
  const max = Math.max(...chrono.region.debit_m3) || 1;
  return Math.max(0.05, Math.min(1, (chrono.region.debit_m3[Math.max(0, jour - 1)] ?? 0) / (max * 0.55)));
};

/** Cultures et niveaux d'eau d'un monde pour un jour ; repeint seulement quand le jour change. */
export function calqueJour(monde: string, region: Region, chrono: Chronologie, jour: number): HTMLCanvasElement {
  const a = ambianceDuJour(chrono, region, jour), cle = `${jour}|${a}`;
  let cj = jours.get(monde);
  if (!cj) { const canvas = toile(); cj = { canvas, img: canvas.getContext('2d')!.createImageData(L, H), cle: '' }; jours.set(monde, cj); }
  if (cj.cle === cle) return cj.canvas;
  cj.cle = cle;
  const c = cj.canvas.getContext('2d')!, p = PALETTES[a], d = cj.img.data, i0 = Math.max(0, jour - 1), rel = relief();
  c.clearRect(0, 0, L, H);
  const neige = p.neige ? rvb(p.neige[0]) : null, terre = p.terre.map(rvb), mur = [rvb(p.roche[2]), rvb(p.roche[3])];
  for (const pa of PARCELLES) {
    const s = chrono.champs[pa.champ];
    const tons = tonsCulture(p, pa.variante, s?.phase[i0] ?? 0, s?.avancement[i0] ?? 0, s?.eau[i0] ?? 1);
    const fond = rvb(tons.fond), rang = rvb(tons.rang), clair = rvb(tons.clair);
    const co = coinsParcelle(pa), xs = co.map(q => q[0]), ys = co.map(q => q[1]);
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    const lv = Math.hypot(pa.v[0], pa.v[1]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [u, v] = dansParcelle(pa, x + 0.5, y + 0.5), o = (y * L + x) * 4;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const al = alea(x, y), sillon = Math.floor(v * lv) % 3 === 0;
      let col = sillon ? rang : fond;
      if (!sillon && al < 0.07) col = clair;
      if (tons.nu > 0 && bruit(x / 6, y / 6, 81 + pa.variante) * 0.7 + al * 0.3 < tons.nu * 0.8) col = terre[al < 0.5 ? 0 : 1];
      if (pa.terrasse && v > 0.84) col = mur[v > 0.92 ? 0 : 1];
      if (neige && al > 0.9) col = neige;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(cj.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
  // Rivière : le lit de gravier reste, l'eau suit le débit.
  const niveau = niveauRiviere(chrono, jour), n = RIVIERE.length;
  for (let passe = 0; passe < 2; passe++) {
    c.fillStyle = p.eau[passe ? 0 : 1];
    for (let k = 0; k < n - 1; k++) {
      const f = k / (n - 1), w = demiLit(f) * (0.2 + 0.8 * niveau) * (passe ? 0.5 : 1);
      if (passe && w < 0.9) continue;
      const [xa, ya] = RIVIERE[k], [xb, yb] = RIVIERE[k + 1], m = Math.ceil(Math.hypot(xb - xa, yb - ya));
      for (let j = 0; j < m; j++) c.fillRect(Math.round(xa + ((xb - xa) * j) / m - w), Math.round(ya + ((yb - ya) * j) / m - w * 0.8), Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(w * 1.6)));
    }
  }
  // Rives découvertes du lac et de la retenue.
  const maxRes = Math.max(...chrono.region.reserve_m3) || 1, plein = Math.max(0.05, Math.min(1, (chrono.region.reserve_m3[i0] ?? 0) / maxRes));
  for (const q of rel.rive) {
    if (q.rho <= (q.lac ? 0.2 + 0.8 * niveau : plein)) continue;
    const al = alea(q.x, q.y);
    c.fillStyle = al < 0.2 ? p.gravier[0] : al < 0.6 ? p.sable[0] : p.sable[1];
    c.fillRect(q.x, q.y, 1, 1);
  }
  // Rigoles d'irrigation, de la pompe aux parcelles : pleines quand l'eau arrive.
  for (const [commune, [px, py]] of Object.entries(POMPES)) {
    const ps = PARCELLES.filter(q => q.commune === commune);
    if (!ps.length) continue;
    const m = mesuresDuJour(chrono, commune, jour);
    const pousse = ps.some(q => (chrono.champs[q.champ]?.phase[i0] ?? 0) === 1);
    c.fillStyle = pousse && (m.irrigation_satisfaction ?? 1) > 0.05 && (m.pompe_etat ?? 1) >= 0.35 ? p.eau[2] : p.gravier[0];
    const cible = ps.reduce((best, q) => (Math.hypot(q.o[0] - px, q.o[1] - py) < Math.hypot(best.o[0] - px, best.o[1] - py) ? q : best));
    const [tx, ty] = [cible.o[0] + cible.v[0] / 2, cible.o[1] + cible.v[1] / 2];
    const pas = Math.ceil(Math.hypot(tx - px, ty - py));
    for (let k = 0; k < pas; k++) c.fillRect(Math.round(px + ((tx - px) * k) / pas), Math.round(py - 2 + ((ty - py + 2) * k) / pas), 1, 1);
  }
  return cj.canvas;
}

// ---- Le vivant ------------------------------------------------------------------------------
export interface Habitant { f: FicheCourte; maison: Pt; place: Pt; decalage: number }
/** Associe chaque habitant affiché à sa maison et à la place de sa commune. */
export function installer(fiches: FicheCourte[]): Habitant[] {
  return fiches.map(f => {
    const ms = maisonsDe(f.commune), m = ms[f.ilot % ms.length], [cx, cy] = CENTRES[f.commune];
    return { f, maison: [m.x + 2 + alea(f.id, 62) * (m.l - 4), m.y + 2 + alea(f.id, 63) * 2], place: [cx - 8 + alea(f.id, 64) * 16, cy + alea(f.id, 65) * 8], decalage: alea(f.id, 61) };
  });
}
export interface Silhouette { id: number; x: number; y: number }
export interface Scene { monde: string; region: Region; chrono: Chronologie; jour: number; habitants: Habitant[]; monHumain: number | null }
export interface Vue { x: number; y: number; l: number; h: number }

const CIEL: [number, [number, number, number]][] = [[0, [70, 88, 150]], [4.8, [70, 88, 150]], [6, [226, 176, 168]], [7.2, [255, 255, 255]], [18, [255, 255, 255]], [19.6, [240, 176, 126]], [21, [92, 106, 170]], [22, [70, 88, 150]], [24, [70, 88, 150]]];
function teinteCiel(heure: number): [number, number, number] {
  for (let k = 0; k < CIEL.length - 1; k++) {
    const [h0, c0] = CIEL[k], [h1, c1] = CIEL[k + 1];
    if (heure >= h0 && heure <= h1) { const f = (heure - h0) / (h1 - h0); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; }
  }
  return [255, 255, 255];
}

/**
 * Dessine la partie `vue` du monde sur le canevas, à partir de (dx, dy).
 * Retourne les silhouettes des habitants dessinés, en coordonnées du monde.
 */
export function dessinerMonde(c: Ctx, s: Scene, vue: Vue, dx: number, dy: number, t: number, heure: number): Silhouette[] {
  const a = ambianceDuJour(s.chrono, s.region, s.jour), p: Palette = PALETTES[a], co = couches(a);
  const jour = calqueJour(s.monde, s.region, s.chrono, s.jour);
  const reg = mesuresDuJour(s.chrono, 'region', s.jour);
  const max = (cle: string): number => Math.max(...s.chrono.region[cle]) || 1;
  const dans = (x: number, y: number, m = 30): boolean => x > vue.x - m && x < vue.x + vue.l + m && y > vue.y - m && y < vue.y + vue.h + m;
  c.save();
  c.beginPath(); c.rect(dx, dy, vue.l, vue.h); c.clip();
  c.fillStyle = '#1c2a2e'; c.fillRect(dx, dy, vue.l, vue.h);
  c.translate(dx - vue.x, dy - vue.y);
  const sx = Math.max(0, vue.x), sy = Math.max(0, vue.y), sl = Math.min(L, vue.x + vue.l) - sx, sh = Math.min(H, vue.y + vue.h) - sy;
  if (sl > 0 && sh > 0) for (const calque of [co.sol, jour]) c.drawImage(calque, sx, sy, sl, sh, sx, sy, sl, sh);
  // Reflets sur l'eau.
  const niveau = niveauRiviere(s.chrono, s.jour), n = RIVIERE.length;
  c.fillStyle = p.eau[3];
  for (let k = 3; k < n - 2; k += 7) {
    const q = RIVIERE[(k + Math.floor(t * 7)) % n], f = k / n;
    if (demiLit(f) * niveau > 1.6 && dans(q[0], q[1])) c.fillRect(Math.round(q[0] - 1), Math.round(q[1]), 2, 1);
  }
  for (let k = 0; k < 46; k++) {
    const x = LAC.cx - 110 + alea(k, 91) * 110 + ((t * 2 + k * 13) % 30), y = LAC.cy - 180 + alea(k, 92) * 300;
    if (dans(x, y) && Math.hypot((x - LAC.cx) / LAC.rx, (y - LAC.cy) / LAC.ry) < 0.86) c.fillRect(Math.round(x), Math.round(y), 3 + (k % 3), 1);
  }
  for (let k = 0; k < 5; k++) {
    const x = RETENUE.cx - 26 + alea(k, 93) * 40 + ((t * 2 + k * 9) % 14), y = RETENUE.cy - 12 + k * 5;
    if ((reg.reserve_m3 ?? 0) / max('reserve_m3') > 0.45) c.fillRect(Math.round(x), Math.round(y), 4, 1);
  }
  barque(c, 762 + Math.sin(t * 0.21) * 8, 372 + Math.round(Math.sin(t * 0.9)));
  barque(c, 790 + Math.cos(t * 0.17) * 10, 446 + Math.round(Math.cos(t * 0.8)));
  if (sl > 0 && sh > 0) c.drawImage(co.objets, sx, sy, sl, sh, sx, sy, sl, sh);

  // Ce que l'état du jour pose sur les bâtiments : portes, sacs, roues.
  const nuit = heure < 6 || heure > 20.4;
  const depot = batiment('entrepot', 'bourg')!;
  portesEntrepot(c, depot, reg.part_reservee ?? 0, nuit);
  sacs(c, depot.x + depot.l + 3, depot.y + 1, Math.round(((reg.depot_kg ?? 0) / max('depot_kg')) * 12));
  const silos = batiment('silos', 'rives')!;
  sacs(c, silos.x + 1, silos.y + 4, Math.round(((reg.secours_kg ?? 0) / max('secours_kg')) * 8));
  for (const co1 of s.region.communes) {
    const m = mesuresDuJour(s.chrono, co1.id, s.jour), g = batiment('grenier', co1.id)!;
    sacs(c, g.x + g.l + 2, g.y + 1, Math.max(0, Math.min(8, Math.round((m.jours_reserve ?? 0) / 2.5))));
    const [px, py] = POMPES[co1.id];
    if (dans(px, py)) rouePompe(c, px - 6, py, m.pompe_etat ?? 1, t);
    // Charrettes : livraisons de l'entrepôt et tournées de secours.
    const liv = trajetLivraison(co1.id);
    if (liv && (m.servi_depot_kg ?? 0) > 1) {
      const f = (t * 0.045 + alea(co1.population, 5)) % 1, [x, y] = pointSur(liv, f), [x2] = pointSur(liv, Math.min(1, f + 0.02));
      if (dans(x, y)) charrette(c, Math.round(x), Math.round(y), x2 >= x, false);
    }
    if ((m.secours_kg ?? 0) > 1 && co1.id !== 'rives') {
      const tr = trajetSecours(co1.id), f = (t * 0.035 + alea(co1.population, 6)) % 1, [x, y] = pointSur(tr, f), [x2] = pointSur(tr, Math.min(1, f + 0.02));
      if (dans(x, y)) charrette(c, Math.round(x), Math.round(y), x2 >= x, true);
    }
  }
  // Fumées des cheminées, aux heures et aux saisons où l'on chauffe.
  if (a === 'hiver' || a === 'automne' || heure < 9 || heure > 18) {
    c.fillStyle = 'rgba(236,236,230,0.75)';
    for (const b of BATIMENTS) {
      if ((b.genre !== 'maison' || b.pignon || b.graine % 2) && b.genre !== 'atelier') continue;
      if (!dans(b.x, b.y)) continue;
      const bx = b.genre === 'atelier' ? b.x + b.l - 6 : b.x + b.l - 5, by = b.y - (b.genre === 'atelier' ? 30 : 17);
      for (let k = 0; k < 4; k++) { const ph = (t * 1.4 + k * 0.9 + b.graine) % 4; c.fillRect(Math.round(bx + Math.sin(ph * 1.3 + b.graine) * 1.5 + ph * 0.6), Math.round(by - ph * 2.2), ph > 2 ? 3 : 2, ph > 2.6 ? 1 : 2); }
    }
  }
  // Habitants : de la maison à la place, puis au lieu de jour.
  const sil: (Silhouette & { hab: Habitant; pas: number })[] = [];
  for (const hab of s.habitants) {
    const pos = positionA(heure, hab.f, hab.decalage);
    if (!pos.dehors && hab.f.id !== s.monHumain) continue;
    const but = pointDeJour(hab.f.commune, pos.lieu, hab.f.id);
    const tr = pos.trajet;
    let x: number, y: number;
    if (tr < 0.35) { const f = tr / 0.35; x = hab.maison[0] + (hab.place[0] - hab.maison[0]) * f; y = hab.maison[1] + (hab.place[1] - hab.maison[1]) * f; }
    else { const f = (tr - 0.35) / 0.65; x = hab.place[0] + (but[0] - hab.place[0]) * f; y = hab.place[1] + (but[1] - hab.place[1]) * f; }
    const marche = tr > 0 && tr < 1;
    if (!marche && pos.dehors) { x += Math.sin(t * 0.5 + hab.f.id) * 2.5; y += Math.cos(t * 0.37 + hab.f.id * 1.7) * 1.2; }
    if (dans(x, y, 12)) sil.push({ id: hab.f.id, x: Math.round(x), y: Math.round(y), hab, pas: marche ? Math.floor(t * 6 + hab.f.id) : 0 });
  }
  sil.sort((u, v) => u.y - v.y);
  for (const q of sil) personne(c, q.x, q.y, { age: q.hab.f.age, metier: q.hab.f.metier, graine: q.hab.f.id }, q.pas, q.id === s.monHumain);

  if ((reg.pluie_mm ?? 0) > 1.5) {
    c.fillStyle = 'rgba(214,228,238,0.55)';
    const nb = Math.min(260, Math.round(reg.pluie_mm * 22));
    for (let k = 0; k < nb; k++) {
      const x = vue.x + ((alea(k, 11) * vue.l + t * 50) % vue.l), y = vue.y + ((alea(k, 12) * vue.h + t * 190) % vue.h);
      c.fillRect(Math.round(x), Math.round(y), 1, 3);
    }
  }
  // Heure : l'aube rosit, le soir dore, la nuit bleuit ; puis les fenêtres s'allument.
  const [cr, cg, cb] = teinteCiel(heure);
  if (cr + cg + cb < 760) {
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)})`;
    c.fillRect(vue.x, vue.y, vue.l, vue.h);
    c.globalCompositeOperation = 'source-over';
  }
  if (heure > 19.4 || heure < 6.6) {
    for (const [fx, fy, fw, fh] of co.fenetres) {
      if (!dans(fx, fy, 4) || alea(fx, fy) > (heure > 23 || heure < 5 ? 0.3 : 0.78)) continue;
      c.fillStyle = C.halo; c.fillRect(fx - 2, fy - 2, fw + 4, fh + 5);
      c.fillStyle = C.lueur; c.fillRect(fx, fy, fw, fh);
    }
  }
  c.restore();
  return sil.map(({ id, x, y }) => ({ id, x, y }));
}
