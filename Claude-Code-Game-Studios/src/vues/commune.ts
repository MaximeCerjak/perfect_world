// Vue d'une commune : champs, logements, grenier, pompe, bâtiments propres au
// lieu et habitants en mouvement, d'après l'état calculé du jour et l'heure.

import { HAUTEUR, LARGEUR, arbre, champ, chemin, entrepot, habitant, maison, palette, peindreSol, pluie, pompe, rect, silo, tramer, type Ambiance, type Palette } from '../art/dessin';
import { alea, mesuresDuJour, positionA, type Lieu } from '../game/rules';
import type { Chronologie, FicheCourte, Region } from '../types';
import { ambianceDuJour } from './carte';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

export interface Plan {
  maisons: Pt[]; champs: { id: string; x: number; y: number; w: number; h: number }[];
  grenier: Pt; services: Pt; pompe: Pt; special: Pt | null;
  lieux: { cle: string; nom: string; x: number; y: number; bien?: string }[];
}

/** Plan d'une commune : où se trouvent ses lieux sur le canevas de 360 × 232. */
export function planCommune(region: Region, id: string): Plan {
  const co = region.communes.find(x => x.id === id)!;
  const champs = region.champs.filter(ch => ch.commune === id);
  const zones: [number, number, number, number][] = champs.length > 1 ? [[26, 34, 96, 52], [26, 104, 96, 46]] : [[26, 38, 96, 104]];
  const n = Math.max(6, Math.min(15, Math.round((co.foyers / Math.max(1, region.communes.reduce((s, x) => s + x.foyers, 0))) * 48)));
  const maisons: Pt[] = [];
  for (let k = 0; k < n; k++) maisons.push([156 + (k % 5) * 38 + (Math.floor(k / 5) % 2) * 10, 100 + Math.floor(k / 5) * 30]);
  const special: Pt | null = id === 'bourg' || id === 'rives' || id === 'source' ? [270, 28] : null;
  const plan: Plan = {
    maisons, champs: champs.map((ch, i) => ({ id: ch.id, x: zones[i][0], y: zones[i][1], w: zones[i][2], h: zones[i][3] })),
    grenier: [156, 34], services: [212, 34], pompe: [70, 178], special, lieux: [],
  };
  plan.lieux.push({ cle: 'grenier', nom: 'Grenier', x: 176, y: 22 });
  plan.lieux.push({ cle: 'services', nom: id === 'bourg' ? 'Atelier, école' : 'École, soins', x: 232, y: 22, bien: id === 'bourg' ? 'atelier' : undefined });
  plan.lieux.push({ cle: 'pompe', nom: 'Pompe', x: 78, y: 166 });
  champs.forEach((ch, i) => plan.lieux.push({ cle: ch.id, nom: ch.culture.charAt(0).toUpperCase() + ch.culture.slice(1), x: zones[i][0] + 48, y: zones[i][1] - 12 }));
  if (id === 'bourg') plan.lieux.push({ cle: 'depot', nom: 'Entrepôt régional', x: 304, y: 16, bien: 'depot' });
  if (id === 'rives') plan.lieux.push({ cle: 'secours', nom: 'Réserve de secours', x: 300, y: 16, bien: 'secours' });
  if (id === 'source') plan.lieux.push({ cle: 'reserve_eau', nom: 'Réserve amont', x: 304, y: 16, bien: 'reserve_eau' });
  return plan;
}

function cible(plan: Plan, lieu: Lieu, graine: number): Pt {
  if (lieu === 'champ' && plan.champs.length) {
    const ch = plan.champs[Math.floor(alea(graine, 41) * plan.champs.length)];
    return [ch.x + 6 + alea(graine, 42) * (ch.w - 12), ch.y + 8 + alea(graine, 43) * (ch.h - 10)];
  }
  if (lieu === 'pompe') return plan.special && alea(graine, 44) < 0.5 ? [plan.special[0] + 10 + alea(graine, 45) * 40, plan.special[1] + 50] : [plan.pompe[0] + 4 + alea(graine, 46) * 26, plan.pompe[1] + 16];
  return [plan.services[0] - 12 + alea(graine, 47) * 62, plan.services[1] + 38 + alea(graine, 48) * 12];
}

const fonds = new Map<string, HTMLCanvasElement>();
function fond(id: string, plan: Plan, ambiance: Ambiance, nuit: number): HTMLCanvasElement {
  const cle = `${id}|${ambiance}|${nuit}`;
  let f = fonds.get(cle);
  if (f) return f;
  f = document.createElement('canvas'); f.width = LARGEUR; f.height = HAUTEUR;
  const c = f.getContext('2d')!, p = palette(ambiance, nuit);
  const haut = id === 'source' ? 1 : id === 'terrasses' ? 0.6 : 0;
  peindreSol(c, p, id.length * 3 + id.charCodeAt(0), (x, y) => Math.max(0, haut * (1 - (x * 0.9 + y * 2.2) / 150)), 20);
  chemin(c, [[18, 88], [LARGEUR - 18, 88]], p, true);
  chemin(c, [[138, 88], [138, 196], [92, 196]], p, true);
  for (let k = 0; k < Math.ceil(plan.maisons.length / 5); k++) chemin(c, [[146, 124 + k * 30], [LARGEUR - 22, 124 + k * 30]], p);
  for (let k = 0; k < 26; k++) {
    const x = 14 + Math.floor(alea(k, 51 + id.length) * (LARGEUR - 28)), y = 16 + Math.floor(alea(k, 52 + id.length) * 172);
    if (x > 16 && x < 132 && y > 24 && y < 160) continue;
    if (x > 140 && y > 20 && y < 196) continue;
    if (x > 56 && x < 146 && y > 160) continue;
    arbre(c, x, y, p, alea(k, 53) < 0.4, ambiance === 'hiver' && alea(k, 54) < 0.6);
  }
  for (let k = 0; k < 6; k++) arbre(c, 132 + (k % 2) * 5, 14 + k * 11, p, k % 3 === 0, ambiance === 'hiver' && k % 2 === 0);
  fonds.set(cle, f);
  return f;
}

function retenue(c: Ctx, x: number, y: number, p: Palette, plein: number, t: number): void {
  rect(c, x, y, 70, 44, p.t[4]);
  const h = Math.round(44 * plein), ret = Math.round((1 - plein) * 12);
  rect(c, x + ret, y + 44 - h, 70 - ret * 2, h, p.eau);
  for (let k = 0; k < 4 && h > 8; k++) rect(c, x + ret + 6 + ((k * 17 + Math.floor(t * 3)) % Math.max(8, 56 - ret * 2)), y + 48 - h + k * 7, 6, 1, p.eau2);
  rect(c, x - 2, y + 44, 74, 5, p.t[0]);
  tramer(c, x, y + 49, 74, 3, p.t[1], 0.5);
}

export interface Silhouette { id: number; x: number; y: number }

/**
 * Dessine la commune pour `jour` à l'heure `heure` (0 à 24) et retourne les
 * silhouettes dessinées, pour retrouver l'habitant sous un clic.
 */
export function dessinerCommune(
  c: Ctx, region: Region, chrono: Chronologie, id: string, jour: number, heure: number, t: number,
  habitants: FicheCourte[], monHumain: number | null,
): Silhouette[] {
  const ambiance = ambianceDuJour(chrono, region, jour);
  const nuit = heure < 5 || heure >= 21.5 ? 2 : heure < 6.2 || heure >= 20.3 ? 1 : 0;
  const p = palette(ambiance, nuit);
  const m = mesuresDuJour(chrono, id, jour), r = mesuresDuJour(chrono, 'region', jour);
  const plan = planCommune(region, id);
  const max = (cle: string): number => Math.max(...chrono.region[cle]) || 1;
  c.drawImage(fond(id, plan, ambiance, nuit), 0, 0);

  // Rivière au sud : son niveau suit le débit du jour, le lit clair reste visible.
  const niveau = Math.max(0.05, Math.min(1, (r.debit_m3 ?? 0) / (max('debit_m3') * 0.55)));
  for (let x = 14; x < LARGEUR - 14; x++) {
    const y0 = 204 + Math.round(Math.sin(x / 31) * 3);
    rect(c, x, y0, 1, 20, p.t[4]);
    const h = Math.max(1, Math.round(16 * niveau));
    rect(c, x, y0 + 10 - Math.floor(h / 2), 1, h, p.eau);
    if (h > 3 && (x + Math.floor(t * 8)) % 23 < 4) rect(c, x, y0 + 10 - Math.floor(h / 4) + ((x >> 4) % 2) * 3, 1, 1, p.eau2);
  }

  const i = Math.max(0, jour - 1);
  for (const ch of plan.champs) {
    const s = chrono.champs[ch.id];
    champ(c, ch.x, ch.y, ch.w, ch.h, p, s?.phase[i] ?? 0, s?.avancement[i] ?? 0, s?.eau[i] ?? 1);
  }
  if (plan.champs.length) {
    const coule = (m.irrigation_satisfaction ?? 1) > 0.05 && (m.pompe_etat ?? 1) >= 0.35;
    for (let y = 152; y < plan.pompe[1] + 2; y++) if (coule || y % 3) rect(c, plan.pompe[0] + 5, y, 2, 1, coule ? p.eau : p.t[1]);
  }
  rect(c, plan.pompe[0] + 18, plan.pompe[1] + 9, 2, 24, p.t[1]);

  entrepot(c, plan.grenier[0], plan.grenier[1], 44, 30, p, Math.min(1, (m.jours_reserve ?? 0) / 30), 0, nuit > 0);
  maison(c, plan.services[0], plan.services[1], 40, 30, p, nuit > 0, 1);
  rect(c, plan.services[0] + 17, plan.services[1] - 7, 6, 8, p.t[4]); rect(c, plan.services[0] + 16, plan.services[1] - 9, 8, 3, p.t[0]);
  if (plan.special) {
    const [x, y] = plan.special;
    if (id === 'bourg') entrepot(c, x - 4, y, 76, 42, p, (r.depot_kg ?? 0) / max('depot_kg'), r.part_reservee ?? 0, nuit > 0);
    else if (id === 'rives') for (let k = 0; k < 3; k++) silo(c, x + 8 + k * 18, y + 8 + (k % 2) * 4, p, (r.secours_kg ?? 0) / max('secours_kg'));
    else retenue(c, x, y, p, Math.max(0.06, Math.min(1, (r.reserve_m3 ?? 0) / max('reserve_m3'))), t);
  }
  plan.maisons.forEach((q, k) => {
    maison(c, q[0], q[1], 22, 19, p, nuit > 0, k + id.length);
    if (nuit === 0 && ambiance !== 'été' && ambiance !== 'sécheresse' && k % 2 === 0) {
      const f = Math.floor(t * 2 + k) % 4;
      rect(c, q[0] + 18 + (f > 1 ? 1 : 0), q[1] - 5 - f * 2, 2, 2, p.t[4]);
    }
  });
  pompe(c, plan.pompe[0], plan.pompe[1], p, m.pompe_etat ?? 1, t);

  // Habitants : du logement au lieu de jour, selon l'heure.
  const sil: (Silhouette & { h: FicheCourte; pas: number })[] = [];
  for (const h of habitants) {
    const pos = positionA(heure, h, alea(h.id, 61));
    if (!pos.dehors && h.id !== monHumain) continue;
    const base = plan.maisons[h.ilot % plan.maisons.length];
    const porte: Pt = [base[0] + 4 + alea(h.id, 62) * 14, base[1] + 23 + alea(h.id, 63) * 4];
    const but = cible(plan, pos.lieu, h.id);
    let x = porte[0] + (but[0] - porte[0]) * pos.trajet, y = porte[1] + (but[1] - porte[1]) * pos.trajet;
    const marche = pos.trajet > 0 && pos.trajet < 1;
    if (!marche && pos.dehors) { x += Math.sin(t * 0.7 + h.id) * 3; y += Math.cos(t * 0.5 + h.id * 1.7) * 1.5; }
    sil.push({ id: h.id, x: Math.round(x) - 8, y: Math.round(y) - 23, h, pas: marche ? Math.floor(t * 6 + h.id) : Math.floor(t * 1.2 + h.id) % 7 === 0 ? 1 : 0 });
  }
  sil.sort((a, b) => a.y - b.y);
  for (const s of sil) habitant(c, s.x, s.y, { age: s.h.age, metier: s.h.metier, graine: s.h.id }, s.pas, p, s.id === monHumain);

  if ((r.pluie_mm ?? 0) > 1.5) pluie(c, t, r.pluie_mm, p);
  return sil.map(({ id: hid, x, y }) => ({ id: hid, x, y }));
}
