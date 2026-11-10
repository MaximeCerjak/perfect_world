// Vue d'une commune : champs, logements, grenier, pompe, bâtiments propres au
// lieu et habitants en mouvement, d'après l'état calculé du jour.

import { C, HAUTEUR, LARGEUR, arbre, champ, entrepot, habitant, maison, pluie, pompe, rect, silo, sol, trait } from '../art/dessin';
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
  const zones: [number, number, number, number][] = champs.length > 1 ? [[14, 30, 104, 58], [14, 104, 104, 50]] : [[14, 34, 104, 96]];
  const n = Math.max(6, Math.min(15, Math.round(co.foyers / Math.max(1, region.communes.reduce((s, x) => s + x.foyers, 0)) * 48)));
  const maisons: Pt[] = [];
  for (let k = 0; k < n; k++) maisons.push([150 + (k % 5) * 40 + (Math.floor(k / 5) % 2) * 12, 96 + Math.floor(k / 5) * 31]);
  const special: Pt | null = id === 'bourg' || id === 'rives' || id === 'source' ? [286, 26] : null;
  const plan: Plan = {
    maisons, champs: champs.map((ch, i) => ({ id: ch.id, x: zones[i][0], y: zones[i][1], w: zones[i][2], h: zones[i][3] })),
    grenier: [150, 30], services: [216, 30], pompe: [64, 180], special, lieux: [],
  };
  plan.lieux.push({ cle: 'grenier', nom: 'Grenier communal', x: 172, y: 26 });
  plan.lieux.push({ cle: 'services', nom: id === 'bourg' ? 'Atelier et école' : 'École et soins', x: 238, y: 26, bien: id === 'bourg' ? 'atelier' : undefined });
  plan.lieux.push({ cle: 'pompe', nom: 'Pompe', x: 72, y: 176 });
  champs.forEach((ch, i) => plan.lieux.push({ cle: ch.id, nom: ch.nom, x: zones[i][0] + 52, y: zones[i][1] - 4 }));
  if (id === 'bourg') plan.lieux.push({ cle: 'depot', nom: 'Entrepôt régional', x: 318, y: 22, bien: 'depot' });
  if (id === 'rives') plan.lieux.push({ cle: 'secours', nom: 'Réserve de secours', x: 300, y: 22, bien: 'secours' });
  if (id === 'source') plan.lieux.push({ cle: 'reserve_eau', nom: 'Réserve amont', x: 312, y: 22, bien: 'reserve_eau' });
  return plan;
}

function cible(plan: Plan, lieu: Lieu, graine: number): Pt {
  if (lieu === 'champ' && plan.champs.length) {
    const ch = plan.champs[Math.floor(alea(graine, 41) * plan.champs.length)];
    return [ch.x + 6 + alea(graine, 42) * (ch.w - 12), ch.y + 8 + alea(graine, 43) * (ch.h - 10)];
  }
  if (lieu === 'pompe') return plan.special && alea(graine, 44) < 0.5 ? [plan.special[0] + 10 + alea(graine, 45) * 30, plan.special[1] + 46] : [plan.pompe[0] + 4 + alea(graine, 46) * 26, plan.pompe[1] + 14];
  return [plan.services[0] + 6 + alea(graine, 47) * 30, plan.services[1] + 40 + alea(graine, 48) * 6];
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
  const m = mesuresDuJour(chrono, id, jour), r = mesuresDuJour(chrono, 'region', jour);
  const plan = planCommune(region, id);
  sol(c, ambiance, id.length + 7);

  // Rivière au sud ; son niveau suit le débit du jour.
  const niveau = Math.max(0, Math.min(1, (r.debit_m3 ?? 0) / ((Math.max(...chrono.region.debit_m3) || 1) * 0.6)));
  rect(c, 0, 200, LARGEUR, 32, C.sableSombre);
  rect(c, 0, 202, LARGEUR, 30, C.sable);
  const he = 4 + Math.round(niveau * 24);
  rect(c, 0, HAUTEUR - he, LARGEUR, he, C.eau);
  for (let x = 0; x < LARGEUR; x += 14) rect(c, x + Math.floor((t * 6 + x) % 14), HAUTEUR - he + 2 + ((x / 14) % 3) * 4, 5, 1, C.eauClaire);
  if (he > 14) rect(c, 0, HAUTEUR - 6, LARGEUR, 6, C.eauSombre);

  // Chemins.
  const rue: Pt[] = [[0, 82], [130, 82], [LARGEUR, 82]];
  trait(c, rue, 8, C.cheminBord); trait(c, rue, 6, C.chemin);
  trait(c, [[132, 82], [132, 192], [84, 192]], 6, C.cheminBord); trait(c, [[132, 82], [132, 192], [84, 192]], 4, C.chemin);
  for (let k = 0; k < Math.ceil(plan.maisons.length / 5); k++) {
    const y = 96 + k * 31 + 24;
    trait(c, [[140, y], [LARGEUR - 8, y]], 4, C.cheminBord); trait(c, [[140, y], [LARGEUR - 8, y]], 2, C.chemin);
  }

  // Champs : leur aspect suit la phase, l'avancement et l'eau reçue.
  const i = Math.max(0, jour - 1);
  for (const ch of plan.champs) {
    const s = chrono.champs[ch.id];
    champ(c, ch.x, ch.y, ch.w, ch.h, s?.phase[i] ?? 0, s?.avancement[i] ?? 0, s?.eau[i] ?? 1);
  }
  // Tuyau d'irrigation de la pompe vers les champs.
  if (plan.champs.length) trait(c, [[plan.pompe[0] + 6, plan.pompe[1]], [plan.pompe[0] + 6, 160]], 2, (m.irrigation_m3 ?? 1) > 0 || (m.irrigation_satisfaction ?? 1) >= 0.8 ? C.ardoise : C.pierreOmbre);

  entrepot(c, plan.grenier[0], plan.grenier[1], 44, 30, Math.min(1, (m.jours_reserve ?? 0) / 30));
  maison(c, plan.services[0], plan.services[1], 42, 30, 'ardoise');
  rect(c, plan.services[0] + 18, plan.services[1] - 5, 6, 6, C.mur); rect(c, plan.services[0] + 19, plan.services[1] - 8, 4, 3, C.ardoise);
  if (plan.special) {
    const [x, y] = plan.special;
    if (id === 'bourg') entrepot(c, x - 8, y, 70, 40, (r.depot_kg ?? 0) / (Math.max(...chrono.region.depot_kg) || 1), r.part_reservee ?? 0);
    else if (id === 'rives') { silo(c, x + 6, y + 6, (r.secours_kg ?? 0) / (Math.max(...chrono.region.secours_kg) || 1)); silo(c, x + 24, y + 10, (r.secours_kg ?? 0) / (Math.max(...chrono.region.secours_kg) || 1)); }
    else {
      const plein = Math.max(0.06, Math.min(1, (r.reserve_m3 ?? 0) / (Math.max(...chrono.region.reserve_m3) || 1)));
      rect(c, x - 2, y, 66, 44, C.sableSombre); rect(c, x, y + 2, 62, 40, C.sable);
      const hr = Math.round(40 * plein);
      rect(c, x + Math.round((1 - plein) * 10), y + 42 - hr, 62 - Math.round((1 - plein) * 20), hr, C.eau);
      rect(c, x + 12, y + 44 - hr, 14, 1, C.eauClaire);
      rect(c, x - 2, y + 42, 66, 5, C.pierre); rect(c, x - 2, y + 46, 66, 1, C.pierreOmbre);
    }
  }
  plan.maisons.forEach((p, k) => maison(c, p[0], p[1], 22, 20, (['tuile', 'ocre', 'tuile', 'ardoise'] as const)[Math.floor(alea(k, id.length) * 4)]));
  pompe(c, plan.pompe[0], plan.pompe[1], m.pompe_etat ?? 1, t);
  for (let k = 0; k < 14; k++) {
    const x = 8 + Math.floor(alea(k, 51 + id.length) * (LARGEUR - 16)), y = 168 + Math.floor(alea(k, 52) * 26);
    if (x > 50 && x < 140) continue;
    arbre(c, x, y, ambiance, alea(k, 53) < 0.4);
  }
  for (let k = 0; k < 5; k++) arbre(c, 126 + (k % 2) * 6, 8 + k * 12, ambiance);

  // Habitants : du logement au lieu de jour, selon l'heure.
  const sil: (Silhouette & { h: FicheCourte; pas: number })[] = [];
  for (const h of habitants) {
    const dec = alea(h.id, 61);
    const p = positionA(heure, h, dec);
    if (!p.dehors && h.id !== monHumain) continue;
    const base = plan.maisons[h.ilot % plan.maisons.length];
    const porte: Pt = [base[0] + 4 + alea(h.id, 62) * 14, base[1] + 22 + alea(h.id, 63) * 5];
    const but = cible(plan, p.lieu, h.id);
    let x = porte[0] + (but[0] - porte[0]) * p.trajet, y = porte[1] + (but[1] - porte[1]) * p.trajet;
    const marche = p.trajet > 0 && p.trajet < 1;
    if (!marche && p.dehors) { x += Math.sin(t * 0.7 + h.id) * 3; y += Math.cos(t * 0.5 + h.id * 1.7) * 1.5; }
    sil.push({ id: h.id, x: Math.round(x) - 8, y: Math.round(y) - 23, h, pas: marche ? Math.floor(t * 6 + h.id) : Math.floor(t * 1.2 + h.id) % 7 === 0 ? 1 : 0 });
  }
  sil.sort((a, b) => a.y - b.y);
  for (const s of sil) habitant(c, s.x, s.y, { age: s.h.age, metier: s.h.metier, graine: s.h.id }, s.pas, s.id === monHumain);

  if (heure < 6 || heure > 20.5) rect(c, 0, 0, LARGEUR, HAUTEUR, `rgba(24,32,58,${heure < 5 || heure > 21.5 ? 0.38 : 0.2})`);
  if ((r.pluie_mm ?? 0) > 1.5) pluie(c, t, r.pluie_mm);
  return sil.map(({ id: hid, x, y }) => ({ id: hid, x, y }));
}
