// La page : le monde en plein écran, une caméra libre, et une interface de jeu
// posée dessus. Le plan et le rendu du monde sont dans monde/, les sprites et
// palettes dans art/, les règles de lecture dans game/rules.ts, l'accès aux
// données dans api.ts ; ce que les essais pilotent est dans hook.ts.

import config from '../data/config.json';
import './style.css';
import { lire, ouvrir } from './api';
import { portrait as dessinerPortrait } from './art/sprites';
import { fusionnerJournal, kg, matricule, mesuresDuJour, statutsCommune, type LigneJournal, type Statut } from './game/rules';
import { clock, install, manual, params } from './hook';
import { BATIMENTS, CENTRES, MONDE_H, MONDE_L, RETENUE, batiment, lieux, maisonsDe, type Pt } from './monde/plan';
import { dessinerMonde, installer, type Habitant, type Silhouette, type Vue } from './monde/rendu';
import type { Chronologie, Comparaison, DetailEvenement, Evenement, Fiche, FicheBien, FicheCourte, Monde, Observation, Region } from './types';
import { dessinerRuban } from './vues/ruban';

// ---- Petits outils de page -------------------------------------------------------------
type Noeuds = (Node | null | false | undefined)[];
type Enfant = Node | string | null | undefined | false;
function el<K extends keyof HTMLElementTagNameMap>(balise: K, attributs: Record<string, string | number | boolean | ((e: Event) => void)> = {}, ...enfants: Enfant[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(balise);
  for (const [k, v] of Object.entries(attributs)) {
    if (typeof v === 'function') e.addEventListener(k, v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false) e.setAttribute(k, String(v));
  }
  for (const enfant of enfants) if (enfant) e.append(enfant);
  return e;
}
const lien = (texte: string, route: string, classe = ''): HTMLAnchorElement => el('a', { href: `#/${route}`, class: classe }, texte);
const nombre = (x: number, d = 0): string => x.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x: number): string => `${Math.round(x * 100)} %`;
const jours = (x: number): string => `${x < 10 ? nombre(x, 1) : nombre(x)} jour${x >= 2 ? 's' : ''}`;
const borne = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
function memoire(cle: string, valeur?: string | null): string | null {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    if (valeur === null) localStorage.removeItem(cle); else localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible : la page marche sans */ }
  return valeur ?? null;
}
const NOMS_MONDES: Record<string, string> = { A: 'entrepôt commun', B: 'entrepôt acquis, resté ouvert', C: 'entrepôt acquis, en partie réservé' };
/** Faits qui tiennent au droit acquis sur l'entrepôt : ils portent le fil de couleur. */
const surLeFil = (e: Evenement): boolean => e.type.startsWith('droit.') || e.type === 'depot.acces_limite' || (e.type === 'livraison.partielle' && e.mesure.raison === 'droits');

// ---- État de la page --------------------------------------------------------------------
interface Etat {
  source: 'api' | 'demo'; mondes: Monde[]; monde: string; region: Region | null; chrono: Chronologie | null;
  jour: number; lecture: boolean; route: string[]; habitants: Habitant[]; faits: Evenement[];
  monHumain: number | null; jeton: string | null; trois: { id: string; chrono: Chronologie }[];
}
const etat: Etat = {
  source: 'api', mondes: [], monde: '', region: null, chrono: null, jour: 1, lecture: false, route: ['carte'],
  habitants: [], faits: [], monHumain: null, jeton: memoire('re:jeton'), trois: [],
};
const cache = new Map<string, Promise<unknown>>();
function vue<T>(chemin: string, monde = etat.monde): Promise<T> {
  const cle = `${monde}|${chemin}`;
  if (!cache.has(cle)) cache.set(cle, lire<T>(chemin.replace('{m}', monde)));
  return cache.get(cle) as Promise<T>;
}
const partage = (): boolean => etat.route[0] === 'mondes' || etat.route[0] === 'observation';
const panneauOuvert = (): boolean => !['carte'].includes(etat.route[0]) && !(partage() && etat.route[1] !== 'bilan');
const nomCommune = (id: string): string => etat.region?.communes.find(c => c.id === id)?.nom ?? (id === 'region' ? 'la région' : id);

// ---- Squelette --------------------------------------------------------------------------
const $ = <T extends HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>('#game'), ctx = canvas.getContext('2d')!;
const etiquettes = $('#etiquettes'), panneau = $('#panneau'), contenu = $('#contenu'), barreMondes = $('#mondes'), depeche = $<HTMLAnchorElement>('#depeche');
const curseur = $<HTMLInputElement>('#jour'), boutonLecture = $<HTMLButtonElement>('#lecture'), ruban = $<HTMLCanvasElement>('#ruban'), texteDate = $('#date');

// ---- Caméra -----------------------------------------------------------------------------
// `zoom` compte les pixels d'écran par pixel du monde : toujours entier, pour un pixel net.
const cam = { x: MONDE_L / 2, y: MONDE_H / 2, cx: MONDE_L / 2, cy: MONDE_H / 2, zoom: 2, min: 1, dpr: 1, l: 0, h: 0 };
function ajuster(): void {
  cam.dpr = Math.max(1, Math.round(devicePixelRatio || 1));
  cam.min = Math.max(1, Math.ceil(Math.max((innerWidth * cam.dpr) / MONDE_L, (innerHeight * cam.dpr) / MONDE_H)));
  cam.zoom = borne(cam.zoom, cam.min, cam.min + 3);
  cam.l = Math.ceil((innerWidth * cam.dpr) / cam.zoom); cam.h = Math.ceil((innerHeight * cam.dpr) / cam.zoom);
  canvas.width = cam.l; canvas.height = cam.h;
  canvas.style.width = `${(cam.l * cam.zoom) / cam.dpr}px`; canvas.style.height = `${(cam.h * cam.zoom) / cam.dpr}px`;
  ctx.imageSmoothingEnabled = false;
  ruban.parentElement!.style.height = '44px';
  bornerCamera(); refaireEtiquettes();
}
function bornerCamera(): void {
  for (const k of ['x', 'cx'] as const) cam[k] = borne(cam[k], Math.min(cam.l, MONDE_L) / 2 - margeX(), MONDE_L - Math.min(cam.l, MONDE_L) / 2 + margeX());
  for (const k of ['y', 'cy'] as const) cam[k] = borne(cam[k], Math.min(cam.h, MONDE_H) / 2, MONDE_H - Math.min(cam.h, MONDE_H) / 2 + margeY());
}
// Quand le panneau couvre une partie de l'écran, la caméra peut aller plus loin pour montrer les bords.
const margeX = (): number => 0;
const margeY = (): number => 0;
/** Décalage du centre utile de l'écran, en pixels du monde, quand le panneau est ouvert. */
function decalagePanneau(): Pt {
  if (!panneauOuvert() || partage()) return [0, 0];
  const k = cam.dpr / cam.zoom;
  return innerWidth >= 900 ? [(Math.min(400, innerWidth - 24) + 12) * k * 0.5, 0] : [0, innerHeight * 0.56 * k * 0.5];
}
function viser(p: Pt, tout_de_suite = false): void {
  const [ox, oy] = decalagePanneau();
  cam.cx = p[0] + ox; cam.cy = p[1] + oy;
  bornerCamera();
  if (tout_de_suite || manual) { cam.x = cam.cx; cam.y = cam.cy; }
}
function zoomer(delta: number): void {
  const z = borne(cam.zoom + delta, cam.min, cam.min + 3);
  if (z === cam.zoom) return;
  cam.zoom = z; ajuster();
}
addEventListener('resize', ajuster);
$('#zoom-plus').addEventListener('click', () => zoomer(1));
$('#zoom-moins').addEventListener('click', () => zoomer(-1));
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomer(e.deltaY < 0 ? 1 : -1); }, { passive: false });

// Glisser pour se déplacer, pincer pour zoomer, toucher pour ouvrir.
const doigts = new Map<number, { x: number; y: number }>();
let glisse = 0, ecart = 0;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); glisse = 0; ecart = 0; });
canvas.addEventListener('pointermove', e => {
  const d = doigts.get(e.pointerId);
  if (!d) return;
  if (doigts.size === 2) {
    const [a, b] = [...doigts.entries()].map(([id, p]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : p));
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!ecart) ecart = dist;
    else if (dist > ecart * 1.35) { zoomer(1); ecart = dist; } else if (dist < ecart * 0.72) { zoomer(-1); ecart = dist; }
  } else {
    const k = cam.dpr / cam.zoom, dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
    glisse += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
    if (glisse > 6) { canvas.classList.add('glisse'); cam.cx = cam.x = cam.x - dx; cam.cy = cam.y = cam.y - dy; bornerCamera(); suivi = false; }
  }
  doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
const lacher = (e: PointerEvent): void => {
  const etait = doigts.size;
  doigts.delete(e.pointerId); canvas.classList.remove('glisse');
  if (etait === 1 && glisse <= 6 && e.type === 'pointerup') toucher(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', lacher); canvas.addEventListener('pointercancel', lacher);

// ---- Tranches : une seule en temps normal, trois quand on compare les mondes -------------
interface Tranche { id: string; chrono: Chronologie; dx: number; dy: number; l: number; h: number; vue: Vue; sil: Silhouette[] }
let tranches: Tranche[] = [];
function decouper(): void {
  if (!etat.region || !etat.chrono) { tranches = []; return; }
  const mondes = partage() && etat.trois.length ? etat.trois : [{ id: etat.monde, chrono: etat.chrono }];
  const n = mondes.length, colonnes = cam.l >= cam.h;
  tranches = mondes.map((m, i) => {
    const l = colonnes ? Math.floor(cam.l / n) : cam.l, h = colonnes ? cam.h : Math.floor(cam.h / n);
    const dx = colonnes ? i * l : 0, dy = colonnes ? 0 : i * h;
    const vue: Vue = { x: Math.round(borne(cam.x - l / 2, 0, Math.max(0, MONDE_L - l))), y: Math.round(borne(cam.y - h / 2, 0, Math.max(0, MONDE_H - h))), l, h };
    return { id: m.id, chrono: m.chrono, dx, dy, l, h, vue, sil: tranches[i]?.sil ?? [] };
  });
}
const ecran = (tr: Tranche, x: number, y: number): Pt => [((x - tr.vue.x + tr.dx) * cam.zoom) / cam.dpr, ((y - tr.vue.y + tr.dy) * cam.zoom) / cam.dpr];

// ---- Étiquettes posées sur le monde -------------------------------------------------------
interface Etiquette { noeud: HTMLElement; x: number; y: number; tranche: number; ancre: 'centre' | 'coin' }
let poses: Etiquette[] = [];
function refaireEtiquettes(): void {
  decouper();
  etiquettes.replaceChildren(); poses = [];
  if (!etat.region) return;
  const pres = cam.zoom > cam.min;
  tranches.forEach((tr, i) => {
    const r = mesuresDuJour(tr.chrono, 'region', etat.jour), reserve = (r.part_reservee ?? 0) > 0;
    if (partage()) {
      const bas = etat.region!.communes.filter(co => (mesuresDuJour(tr.chrono, co.id, etat.jour).jours_reserve ?? 99) < 6).length;
      const manque = r.depot_demande_kg - r.depot_servi_kg > 1;
      const b = el('button', { class: `bandeau ${reserve ? 'droit' : ''}`, type: 'button', 'aria-pressed': tr.id === etat.monde, click: () => void changerMonde(tr.id).then(naviguer) },
        el('b', {}, `Monde ${tr.id}`), reserve ? `${pct(r.part_reservee)} de l’entrepôt réservés. ` : `${NOMS_MONDES[tr.id] ?? ''}. `,
        manque ? `${kg(r.depot_servi_kg)} servis sur ${kg(r.depot_demande_kg)}. ` : '', bas ? `${bas} grenier${bas > 1 ? 's' : ''} sous six jours.` : 'Aucun grenier bas.');
      poses.push({ noeud: b, x: 0, y: 0, tranche: i, ancre: 'coin' });
    }
    for (const co of etat.region!.communes) {
      const statuts = statutsCommune(mesuresDuJour(tr.chrono, co.id, etat.jour)), notables = statuts.filter(s => s.niveau !== 'ok');
      const a = lien('', `commune/${co.id}`, `nom ${partage() || !pres ? 'petit' : ''}`);
      a.append(el('b', {}, co.nom));
      if (partage()) a.append(el('i', {}, `${nombre(mesuresDuJour(tr.chrono, co.id, etat.jour).jours_reserve ?? 0)} j`));
      else if (notables.length) a.append(el('i', {}, pres ? notables[0].libelle : notables.map(s => s.picto).join(' ')));
      a.setAttribute('aria-label', `${co.nom} : ${statuts.map(s => s.libelle).join(', ')}`);
      if (partage() && i > 0) a.tabIndex = -1;
      poses.push({ noeud: a, x: CENTRES[co.id][0], y: CENTRES[co.id][1] + 30, tranche: i, ancre: 'centre' });
    }
    for (const l of lieux()) {
      const marque = l.bien === 'depot' && reserve;
      if (!pres && !marque && !partage()) continue;
      if (partage() && l.bien !== 'depot') continue;
      const texte = marque ? `${l.nom} : ${pct(r.part_reservee)} réservés` : l.nom;
      const a = lien(texte, `bien/${l.bien}`, `nom lieu ${marque ? 'droit' : ''}`);
      if (partage()) a.tabIndex = -1;
      poses.push({ noeud: a, x: l.x, y: l.y, tranche: i, ancre: 'centre' });
    }
  });
  for (const p of poses) etiquettes.append(p.noeud);
  placerEtiquettes();
}
function placerEtiquettes(): void {
  for (const p of poses) {
    const tr = tranches[p.tranche];
    if (!tr) continue;
    if (p.ancre === 'coin') { const [x, y] = ecran(tr, tr.vue.x, tr.vue.y); p.noeud.style.transform = `translate(${Math.round(x + 10)}px, ${Math.round(y + (innerWidth < 900 ? 54 : 70))}px)`; continue; }
    const dedans = p.x > tr.vue.x + 4 && p.x < tr.vue.x + tr.vue.l - 4 && p.y > tr.vue.y && p.y < tr.vue.y + tr.vue.h;
    p.noeud.style.display = dedans ? '' : 'none';
    if (dedans) { const [x, y] = ecran(tr, p.x, p.y); p.noeud.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, 0)`; }
  }
}

// ---- Dessin -------------------------------------------------------------------------------
let t = 0, suivi = true;
/** Heure du monde : la nuit passe trois fois plus vite que le jour, et s'arrête pendant le défilement. */
function heure(): number {
  const fixe = params.get('heure');
  if (fixe) return Number(fixe);
  if (etat.lecture) return 12;
  const p = ((t * config.heures_par_seconde.value) / 24 + 0.2) % 1;
  return p < 0.8 ? 6.5 + (p / 0.8) * 14.5 : (21 + ((p - 0.8) / 0.2) * 9.5) % 24;
}
function dessiner(): void {
  if (!etat.region || !etat.chrono) return;
  decouper();
  const h = heure();
  for (const tr of tranches) {
    tr.sil = dessinerMonde(ctx, { monde: tr.id, region: etat.region, chrono: tr.chrono, jour: etat.jour, habitants: etat.habitants, monHumain: etat.monHumain }, tr.vue, tr.dx, tr.dy, t, h);
  }
  ctx.fillStyle = '#0a0e11';
  for (const tr of tranches.slice(1)) { if (tr.dx) ctx.fillRect(tr.dx - 1, 0, 2, cam.h); else ctx.fillRect(0, tr.dy - 1, cam.l, 2); }
  placerEtiquettes();
}
/** Un toucher sur le monde : un habitant, un bien, une commune, ou le monde d'une tranche. */
function toucher(cx: number, cy: number): void {
  const px = (cx * cam.dpr) / cam.zoom, py = (cy * cam.dpr) / cam.zoom;
  const tr = tranches.find(q => px >= q.dx && px < q.dx + q.l && py >= q.dy && py < q.dy + q.h);
  if (!tr) return;
  if (partage() && tr.id !== etat.monde) { void changerMonde(tr.id).then(naviguer); return; }
  const x = px - tr.dx + tr.vue.x, y = py - tr.dy + tr.vue.y;
  const qui = [...tr.sil].reverse().find(s => Math.abs(s.x - x) <= 4 && y >= s.y - 11 && y <= s.y + 3);
  if (qui) { location.hash = `#/humain/${qui.id}`; return; }
  const depot = batiment('entrepot', 'bourg')!, silos = batiment('silos', 'rives')!;
  const sur = (b: { x: number; y: number; l: number }, haut: number): boolean => x >= b.x - 2 && x <= b.x + b.l + 2 && y >= b.y - haut && y <= b.y + 2;
  if (sur(depot, 26)) { location.hash = '#/bien/depot'; return; }
  if (sur(silos, 26)) { location.hash = '#/bien/secours'; return; }
  if (Math.hypot(x - RETENUE.cx, (y - RETENUE.cy) * 1.5) < 44) { location.hash = '#/bien/reserve_eau'; return; }
  const proche = Object.entries(CENTRES).map(([id, [qx, qy]]) => [id, Math.hypot(qx - x, qy - y)] as const).sort((a, b) => a[1] - b[1])[0];
  if (proche[1] < 56) location.hash = `#/commune/${proche[0]}`;
}

// ---- Temps -------------------------------------------------------------------------------
let rafraichir = 0;
function allerAuJour(j: number, parLecture = false): void {
  if (!etat.region || !etat.chrono) return;
  etat.jour = borne(Math.round(j), 1, etat.region.monde.jour);
  curseur.value = String(etat.jour);
  const [jourMois, an] = (etat.chrono.dates[etat.jour - 1] ?? '').split(', an ');
  const saison = etat.chrono.saisons[etat.jour - 1] ?? '';
  texteDate.replaceChildren(jourMois, el('small', {}, `${saison}, an ${an ?? 1}, jour ${etat.jour}`));
  curseur.setAttribute('aria-valuetext', `${jourMois}, ${saison}, jour ${etat.jour}`);
  dessinerRuban(ruban, etat.region, etat.chrono, etat.jour);
  const dernier = etat.faits.find(e => e.jour <= etat.jour);
  depeche.replaceChildren(...(dernier ? [el('b', {}, `${dernier.titre}. `), `${dernier.lieu_nom}, ${dernier.date.split(',')[0]}`] : []));
  depeche.classList.toggle('fil', !!dernier && surLeFil(dernier));
  depeche.href = dernier ? `#/fait/${dernier.id}` : '#/chronique';
  refaireEtiquettes();
  clearTimeout(rafraichir);
  rafraichir = window.setTimeout(() => void afficher(), parLecture ? 400 : 60);
  if (!boucleActive) dessiner();
}
function basculerLecture(force?: boolean): void {
  etat.lecture = force ?? !etat.lecture;
  if (etat.lecture && etat.jour >= (etat.region?.monde.jour ?? 1)) allerAuJour(1);
  boutonLecture.dataset.lecture = etat.lecture ? '1' : '0';
  boutonLecture.setAttribute('aria-label', etat.lecture ? 'Mettre en pause' : 'Faire défiler les jours');
}
curseur.addEventListener('input', () => { basculerLecture(false); allerAuJour(Number(curseur.value)); });
boutonLecture.addEventListener('click', () => basculerLecture());
const tenues = new Set<string>();
function appuyer(code: string): void {
  if (code === 'ArrowRight') allerAuJour(etat.jour + 1);
  else if (code === 'ArrowLeft') allerAuJour(etat.jour - 1);
  else if (code === 'PageDown') allerAuJour(etat.jour + 30);
  else if (code === 'PageUp') allerAuJour(etat.jour - 30);
  else if (code === 'Space') basculerLecture();
  else if (code === 'Escape') location.hash = '#/carte';
  else if (code === 'Equal' || code === 'NumpadAdd') zoomer(1);
  else if (code === 'Minus' || code === 'NumpadSubtract') zoomer(-1);
}
const DEPLACEMENT = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
addEventListener('keydown', e => {
  const cible = e.target as HTMLElement;
  if (cible.matches('input, select, textarea, button, a') && e.code !== 'Escape') return;
  if (DEPLACEMENT.includes(e.code)) { tenues.add(e.code); suivi = false; return; }
  if (['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Space', 'Escape', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(e.code)) { e.preventDefault(); appuyer(e.code); }
});
addEventListener('keyup', e => tenues.delete(e.code));
addEventListener('blur', () => tenues.clear());

// ---- Boucle -------------------------------------------------------------------------------
let boucleActive = false, dernier = 0, resteJour = 0;
function avancer(dt: number): void {
  t += dt;
  const pas = (260 * dt * cam.dpr) / cam.zoom;
  if (tenues.size) {
    cam.cx += (tenues.has('KeyD') ? pas : 0) - (tenues.has('KeyA') ? pas : 0); cam.cy += (tenues.has('KeyS') ? pas : 0) - (tenues.has('KeyW') ? pas : 0);
    bornerCamera(); cam.x = cam.cx; cam.y = cam.cy;
  }
  // La caméra accompagne l'humain dont la fiche est ouverte.
  if (suivi && etat.route[0] === 'humain' && tranches[0]) {
    const s = tranches[0].sil.find(q => q.id === Number(etat.route[1]));
    if (s) viser([s.x, s.y - 4]);
  }
  const k = Math.min(1, dt * 5);
  cam.x += (cam.cx - cam.x) * k; cam.y += (cam.cy - cam.y) * k;
  if (etat.lecture && etat.region) {
    resteJour += dt * config.jours_par_seconde.value;
    if (resteJour >= 1) {
      const n = Math.floor(resteJour); resteJour -= n;
      if (etat.jour + n >= etat.region.monde.jour) { allerAuJour(etat.region.monde.jour, true); basculerLecture(false); }
      else allerAuJour(etat.jour + n, true);
    }
  }
}
function image(): void {
  const maintenant = clock.now();
  avancer(Math.min(0.1, maintenant - dernier)); dernier = maintenant;
  dessiner();
  requestAnimationFrame(image);
}

// ---- Panneau ------------------------------------------------------------------------------
function etatTexte(s: Statut): HTMLElement {
  return el('span', { class: `etat ${s.niveau}` }, el('span', { 'aria-hidden': 'true' }, `${s.picto} `), s.libelle);
}
function ligneFait(e: Evenement | LigneJournal): HTMLElement {
  const l = e as LigneJournal;
  return el('li', { class: `${surLeFil(e) ? 'fil' : ''} ${l.portee === 'personnel' ? 'personnel' : ''}` },
    el('a', { href: `#/fait/${e.id}` },
      el('time', {}, e.jour_fin && e.jour_fin !== e.jour ? `Du jour ${e.jour} au jour ${e.jour_fin}` : e.date, l.nouveau && el('span', { class: 'neuf' }, 'nouveau')),
      el('b', {}, e.titre), el('p', {}, e.texte),
      l.portee !== 'personnel' && el('span', { class: 'ou' }, e.lieu_nom)));
}
function listeFaits(faits: (Evenement | LigneJournal)[], vide: string, max = 30): HTMLElement {
  if (!faits.length) return el('p', { class: 'vide' }, vide);
  const ul = el('ol', { class: 'faits' }, ...faits.slice(0, max).map(ligneFait));
  if (faits.length > max) ul.append(el('li', { class: 'vide' }, `Et ${faits.length - max} faits plus anciens.`));
  return ul;
}
function portrait(h: Pick<FicheCourte, 'id' | 'age' | 'metier'>, zoom: number): HTMLCanvasElement {
  const c = el('canvas', { width: 12, height: 16, class: 'portrait', 'aria-hidden': 'true' });
  c.style.width = `${12 * zoom}px`; c.style.height = `${16 * zoom}px`;
  dessinerPortrait(c.getContext('2d')!, { age: h.age, metier: h.metier, graine: h.id });
  return c;
}
function carteHumain(h: FicheCourte): HTMLElement {
  const a = lien('', `humain/${h.id}`, h.id === etat.monHumain ? 'mien' : '');
  a.append(portrait(h, 3), el('span', {}, el('b', {}, `${h.prenom} ${h.nom}`), el('small', {}, `${h.age} ans, ${h.age >= 16 && h.metier ? h.metier_nom : h.etape}`)));
  return a;
}
const entete = (titre: string): HTMLElement => el('header', {}, el('h2', {}, titre));
const inventaire = (lignes: [string, string][]): HTMLElement => el('dl', { class: 'inventaire' }, ...lignes.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));

function panneauChronique(): Noeuds {
  const region = etat.region!, r = mesuresDuJour(etat.chrono!, 'region', etat.jour);
  const besoin = r.population * 1.2, reserve = (r.part_reservee ?? 0) > 0, manque = r.depot_demande_kg - r.depot_servi_kg > 1;
  return [
    entete('La vallée'),
    el('p', { class: 'chapo' }, `${nombre(r.population)} habitants, cinq communes, une rivière. Elle roule ${nombre(r.debit_m3)} m³ aujourd’hui ; la retenue de La Source en garde ${nombre(r.reserve_m3)}. `,
      lien('L’entrepôt du Bourg', 'bien/depot'), ` tient ${kg(r.depot_kg)}, de quoi nourrir tout le monde ${jours(r.depot_kg / besoin)}.`),
    reserve && el('p', { class: 'chapo' }, el('b', { class: 'droit' }, `${pct(r.part_reservee)} de ses portes sont réservées. `),
      manque ? `Il sert ${kg(r.depot_servi_kg)} sur les ${kg(r.depot_demande_kg)} que les communes demandent.` : 'Aujourd’hui, ce qui reste ouvert suffit.'),
    el('nav', { class: 'voisins', 'aria-label': 'Communes' }, ...region.communes.map(co => lien(co.nom, `commune/${co.id}`))),
    el('h3', {}, 'Ce qui s’est passé'),
    listeFaits(etat.faits.filter(e => e.jour <= etat.jour), 'Rien de notable pour l’instant. Faites défiler l’année.', 24),
  ];
}

async function panneauCommune(id: string): Promise<Noeuds> {
  const region = etat.region!;
  const co = region.communes.find(c => c.id === id);
  if (!co) return [entete('Commune inconnue')];
  const m = mesuresDuJour(etat.chrono!, id, etat.jour);
  const [faits, gens] = await Promise.all([
    vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${id}/evenements`),
    vue<{ total: number; humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${id}&limite=60`)]);
  const biens = region.biens.filter(b => b.commune === id);
  return [
    entete(co.nom),
    el('p', { class: 'chapo' }, co.role),
    el('p', { class: 'etats' }, ...statutsCommune(m).map(etatTexte)),
    inventaire([['Habitants', nombre(co.population)], ['Au grenier', kg(m.stock_kg)], ['Eau des foyers', pct(m.eau_domestique_couverture)], ['Temps libre par adulte', `${nombre(m.temps_libre_moyen_h, 1)} h par jour`]]),
    biens.length ? el('p', { class: 'voisins' }, ...biens.map(b => lien(b.nom, `bien/${b.id}`))) : null,
    el('h3', {}, 'Ce qui s’est passé ici'),
    listeFaits(faits.evenements.filter(e => e.jour <= etat.jour).reverse(), 'Rien de notable pour l’instant.', 14),
    el('h3', {}, `${nombre(gens.total)} habitants, dont`),
    el('div', { class: 'gens' }, ...gens.humains.slice(0, 16).map(carteHumain)),
    el('nav', { class: 'voisins', 'aria-label': 'Autres communes' }, ...region.communes.filter(c => c.id !== id).map(c => lien(c.nom, `commune/${c.id}`))),
  ];
}

async function panneauHumain(id: number): Promise<Noeuds> {
  const f = await vue<Fiche>(`/api/mondes/{m}/humains/${id}`);
  const [lieu, bourg, region] = await Promise.all([f.commune, 'bourg', 'region'].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`)));
  const cleVisite = `re:vu:${etat.monde}:${id}`, depuis = memoire(cleVisite);
  const journal = fusionnerJournal(f.journal, lieu.evenements, f.commune === 'bourg' ? region.evenements : [...bourg.evenements, ...region.evenements], etat.jour, depuis === null ? null : Number(depuis));
  const nouveaux = journal.filter(l => l.nouveau);
  if (!etat.lecture) memoire(cleVisite, String(Math.max(etat.jour, Number(depuis ?? 0))));
  const mien = etat.monHumain === id;
  const libelles: Record<string, string> = { essentiel: 'sommeil et repas', travail: 'travail', etude: 'école', soins_au_foyer: 'soins au foyer', soins_recus: 'soins reçus', ravitaillement: 'ravitaillement', libre: 'temps libre' };
  const couleurs: Record<string, string> = { essentiel: '#3d4a66', travail: '#c98a4b', etude: '#5f8fb0', soins_au_foyer: '#b0563e', soins_recus: '#b0563e', ravitaillement: '#d8c9a0', libre: '#84b655' };
  const parts = Object.entries(f.journee).filter(([, v]) => v > 0);
  const cases: HTMLElement[] = [];
  let cumul = 0;
  for (const [k, v] of parts) { cumul += v; while (cases.length < Math.round(cumul) && cases.length < 24) cases.push(el('i', { class: k })); }
  while (cases.length < 24) cases.push(el('i', { class: 'libre' }));
  const activite = f.age >= 16 && f.metier ? `travaille dans ${f.metier === 1 ? 'l’agriculture' : f.metier === 2 ? 'l’équipe technique' : 'les services'}` : f.age < 6 ? 'est encore tout petit' : f.age < 16 ? 'va à l’école' : 'ne travaille plus';
  const suivre = el('button', { class: `action ${mien ? 'discret' : ''}`, click: () => { etat.monHumain = mien ? null : id; memoire('re:humain', mien ? null : String(id)); void afficher(); majMenu(); } }, mien ? 'Ne plus suivre' : 'Suivre cet humain');
  return [
    entete(`${f.prenom} ${f.nom}`),
    el('div', { class: 'identite' }, portrait(f, 6),
      el('p', {}, `${f.age} ans. ${f.prenom} ${activite} à `, lien(nomCommune(f.commune), `commune/${f.commune}`), `${f.vivant ? '' : ' ; sa vie s’est achevée'}. Foyer ${f.foyer_detail.nom}, ${f.foyer_detail.type}.`,
        el('br'), el('span', { class: 'note' }, `${matricule('H', f.id)}, foyer ${matricule('F', f.foyer)}`))),
    etat.source === 'demo' || mien ? el('div', { class: 'actions' }, suivre) : null,
    el('h3', {}, 'Ses vingt-quatre heures'),
    el('div', {}, el('div', { class: 'heures', role: 'img', 'aria-label': parts.map(([k, v]) => `${libelles[k]} ${nombre(v, 1)} h`).join(', ') }, ...cases),
      el('p', { class: 'cles' }, ...parts.map(([k, v]) => el('span', {}, el('i', { style: `background:${couleurs[k]}` }), `${libelles[k]} ${nombre(v, 1)} h`)))),
    f.foyer_detail.trajets ? el('p', {}, `Le foyer est allé ${f.foyer_detail.trajets} fois chercher sa part aux Rives : ${nombre(f.foyer_detail.heures_trajet, 1)} h de trajet.`) : null,
    nouveaux.length ? el('h3', {}, 'Depuis votre dernière visite') : null,
    nouveaux.length ? listeFaits(nouveaux, '') : null,
    el('h3', {}, 'Son journal'),
    listeFaits(nouveaux.length ? journal.filter(l => !l.nouveau) : journal, 'Le journal commence avec le premier fait marquant.'),
    f.foyer_detail.membres.length > 1 ? el('h3', {}, 'Sous le même toit') : null,
    f.foyer_detail.membres.length > 1 ? el('div', { class: 'gens' }, ...f.foyer_detail.membres.filter(m => m.id !== f.id).map(carteHumain)) : null,
    f.liens.length ? el('h3', {}, 'Ses liens') : null,
    f.liens.length ? el('div', { class: 'gens' }, ...f.liens.map(carteHumain)) : null,
  ];
}

async function panneauBien(id: string): Promise<Noeuds> {
  const b = await vue<FicheBien>(`/api/mondes/{m}/biens/${id}`);
  const r = mesuresDuJour(etat.chrono!, 'region', etat.jour);
  const droits = b.droits.filter(d => d.debut <= etat.jour && (d.annule_jour === null || d.annule_jour > etat.jour));
  const reservee = id === 'depot' ? r.part_reservee ?? 0 : 0;
  const lignes: [string, string][] = [];
  if (id === 'depot') lignes.push(['En stock', kg(r.depot_kg)], ['Demandé aujourd’hui', kg(r.depot_demande_kg)], ['Servi aujourd’hui', kg(r.depot_servi_kg)]);
  if (id === 'secours') lignes.push(['En stock', kg(r.secours_kg)]);
  if (id === 'reserve_eau') lignes.push(['Volume', `${nombre(r.reserve_m3)} m³`], ['Capacité', `${nombre(b.bien.capacite_m3 ?? 0)} m³`]);
  if (b.passage) lignes.push(['Capacité de passage', `${kg(b.passage.capacite_kg_jour)} par jour`], ['Ouverte à tous', `${kg(b.passage.capacite_kg_jour * (1 - reservee))} par jour`]);
  const n: Noeuds = [
    entete(b.bien.nom),
    el('p', { class: 'chapo' }, b.bien.description, ' ', lien(b.commune_nom, `commune/${b.bien.commune}`), '.'),
    el('p', { class: 'chapo' }, reservee > 0 ? el('b', { class: 'droit' }, `Accès réservé à ${pct(reservee)}.`) : el('b', {}, 'Accès commun.'),
      reservee > 0 ? ' Le reste suit la règle commune.' : ' Les mêmes règles valent pour tous les usagers.'),
    lignes.length ? inventaire(lignes) : null,
    el('h3', {}, 'Qui détient quoi'),
    droits.length
      ? el('ul', { class: 'droits' }, ...droits.map(d => el('li', {}, el('b', {}, `${pct(d.part)} de la capacité. `), `Titulaire : ${d.compte}. `, d.acces === 'reserve' ? `Part réservée (${(d.usage ?? 'usage du titulaire').toLowerCase()}).` : 'Part laissée ouverte à tous.', ` Depuis le jour ${d.debut}${d.fin ? `, jusqu’au jour ${d.fin}` : ''}.`)))
      : el('p', {}, 'Personne : c’est un bien commun. La propriété et l’accès sont enregistrés séparément.'),
    el('h3', {}, 'Ce qui a changé'),
    listeFaits(b.changements.filter(e => e.jour <= etat.jour).reverse(), 'Aucun changement d’accès à ce jour.', 12),
  ];
  if (b.offre) {
    const o = b.offre.effet_si_reserve;
    n.push(el('h3', {}, 'Le droit qui sera mis en vente'), el('p', {}, b.offre.droit),
      b.offre.disponible
        ? el('p', {}, `Réserver ${pct(b.offre.part_proposee)} de plus laisserait ${kg(o.commun_kg_jour)} par jour ouverts à tous. Ces trente derniers jours, ${kg(o.servi_moyen_kg_jour)} sortent chaque jour : `, el('b', { class: 'droit' }, `${kg(o.a_couvrir_ailleurs_kg_jour)} par jour`), ' devraient être trouvés ailleurs, reportés ou laissés non servis.')
        : el('p', {}, 'Toute la capacité est déjà engagée.'),
      el('p', { class: 'note' }, 'Les achats ouvriront dans une seconde phase. D’ici là, des événements d’essai produisent les mêmes changements de droits.'));
  }
  return n;
}

async function panneauFait(id: string): Promise<Noeuds> {
  const d = await vue<DetailEvenement>(`/api/mondes/{m}/evenements/${id}`);
  const e = d.evenement;
  const chaine = (ev: Evenement, vus: Set<string>): HTMLElement => {
    const li = el('li', {}, el('a', { href: `#/fait/${ev.id}` }, el('time', {}, `${ev.date}, ${ev.lieu_nom}`), el('b', {}, ev.titre), el('p', {}, ev.texte)));
    const causes = ev.causes.map(c => d.causes[c]).filter(c => c && !vus.has(c.id));
    if (causes.length) { causes.forEach(c => vus.add(c.id)); li.append(el('ol', {}, ...causes.map(c => chaine(c, vus)))); }
    return li;
  };
  const causes = e.causes.map(c => d.causes[c]).filter(Boolean);
  const vus = new Set(causes.map(c => c.id));
  return [
    entete(e.titre),
    el('p', { class: 'note' }, `${e.date}, jour ${e.jour}, `, e.lieu === 'region' ? e.lieu_nom : lien(e.lieu_nom, `commune/${e.lieu}`)),
    el('p', { class: 'chapo' }, e.texte),
    el('div', { class: 'actions' }, e.jour !== etat.jour && el('button', { class: 'action', click: () => allerAuJour(e.jour) }, 'Voir la vallée ce jour-là'),
      e.humain !== null && lien('Sa fiche', `humain/${e.humain}`), surLeFil(e) && lien('L’entrepôt du Bourg', 'bien/depot')),
    el('h3', {}, 'Pourquoi'),
    causes.length ? el('ol', { class: 'causes' }, ...causes.map(c => chaine(c, vus))) : el('p', { class: 'vide' }, 'Ce fait ne découle d’aucun autre : il est daté par le calendrier du monde.'),
    el('h3', {}, 'Ce que cela a entraîné'),
    listeFaits(d.consequences, 'Rien, pour l’instant.', 16),
  ];
}

async function panneauBilan(): Promise<Noeuds> {
  const region = etat.region!, ids = etat.trois.map(m => m.id);
  const [obs, comp] = await Promise.all([
    vue<Observation>('/api/mondes/{m}/observation'),
    ids.length > 1 ? lire<Comparaison>(`/api/comparaison?mondes=${ids.join(',')}`).catch(() => null) : Promise.resolve(null)]);
  const n: Noeuds = [
    entete('Ce que l’année a changé'),
    el('p', { class: 'chapo' }, 'Même vallée, même météo, mêmes habitants au départ. Une seule chose change : qui détient l’entrepôt du Bourg, et ce qu’il fait de ses portes.'),
  ];
  if (comp) {
    const c = comp.ecarts.find(e => !e.identique), b = comp.ecarts.find(e => e.identique);
    if (b) n.push(el('p', {}, `Dans le monde ${b.monde}, l’entrepôt change de mains mais reste ouvert : tout se passe comme dans le monde ${b.reference}. Seule différence, ${pct(comp.mondes.find(m => m.monde === b.monde)!.region.concentration_max)} de la capacité dépendent désormais d’un seul compte.`));
    if (c) {
      const mc = comp.mondes.find(m => m.monde === c.monde)!, mr = comp.mondes[0];
      const lignes: HTMLElement[] = [el('li', {}, el('b', { class: 'droit' }, `${nombre(mc.region.jours_limites_par_droits)} jours `), `où ce qui reste ouvert à l’entrepôt ne suffit plus, dans le monde ${c.monde}.`)];
      for (const co of region.communes) {
        const x = mc.communes[co.id], y = mr.communes[co.id], morceaux: string[] = [];
        if (Math.abs(x.jours_reserve_min - y.jours_reserve_min) > 0.5) morceaux.push(`ses réserves descendent à ${jours(x.jours_reserve_min)} (${nombre(y.jours_reserve_min)} dans le monde ${mr.monde})`);
        if (x.secours_kg - y.secours_kg > 1) morceaux.push(`${kg(x.secours_kg - y.secours_kg)} viennent de la réserve de secours`);
        if (x.heures_tournee_secours - y.heures_tournee_secours > 0.5) morceaux.push(`son équipe passe ${nombre(x.heures_tournee_secours - y.heures_tournee_secours)} h sur la route des Rives`);
        if (x.entretien_reporte_h - y.entretien_reporte_h > 0.5) morceaux.push(`${nombre(x.entretien_reporte_h - y.entretien_reporte_h)} h d’entretien de la pompe sont reportées`);
        if (x.non_couvert_kg - y.non_couvert_kg > 1) morceaux.push(`${kg(x.non_couvert_kg - y.non_couvert_kg)} de besoins restent non couverts`);
        if (x.jours_ration_reduite - y.jours_ration_reduite > 0) morceaux.push(`${nombre(x.jours_ration_reduite - y.jours_ration_reduite)} jours de rations réduites`);
        if (morceaux.length) lignes.push(el('li', {}, el('b', {}, lien(co.nom, `commune/${co.id}`), ' : '), `${morceaux.join(' ; ')}.`));
      }
      n.push(el('ul', { class: 'ecarts' }, ...lignes));
      n.push(el('h3', {}, `Le fil des causes, dans le monde ${c.monde}`), listeFaits(c.evenements_nouveaux, '', 14));
    }
  }
  n.push(el('h3', {}, `Des vies à suivre dans le monde ${etat.monde}`), el('p', { class: 'note' }, 'Les foyers les plus touchés restent visibles à côté des moyennes.'));
  n.push(el('div', { class: 'vies' }, ...obs.plus_touches.slice(0, 6).map(f => {
    const a = lien('', `humain/${f.humain}`);
    a.append(portrait({ id: f.humain, age: 40, metier: 1 + (f.humain % 3) }, 3), el('span', {}, el('b', {}, `Foyer ${f.nom}, ${nomCommune(f.commune)}`),
      el('p', {}, `${f.type}, ${f.personnes} personne${f.personnes > 1 ? 's' : ''}. ${nombre(f.temps_libre_h, 1)} h de temps libre par adulte et par jour`
        + (f.heures_trajet > 0.5 ? `, ${nombre(f.heures_trajet, 1)} h de trajets de secours` : '') + (f.couverture_besoins < 0.9995 ? `, besoins couverts à ${pct(f.couverture_besoins)}` : '') + '.')));
    return a;
  })));
  return n;
}

async function panneauMoi(): Promise<Noeuds> {
  const n: Noeuds = [entete('Retrouver mon humain')];
  if (etat.source === 'demo') {
    const gens = await vue<{ humains: FicheCourte[] }>('/api/mondes/{m}/humains?limite=200');
    n.push(el('p', { class: 'chapo' }, 'Choisissez une vie à suivre. La caméra l’accompagnera, et son journal s’ouvrira sur ce qui a changé depuis votre dernière visite.'),
      el('p', { class: 'note' }, 'Vous regardez une démonstration sans serveur. Dans le monde partagé, un code reçu à l’inscription ouvre le journal rattaché à votre compte.'),
      el('div', { class: 'gens' }, ...gens.humains.slice(0, 30).map(carteHumain)));
    return n;
  }
  const champ = el('input', { type: 'text', id: 'code', autocomplete: 'off' });
  const message = el('p', { class: 'vide', role: 'status' });
  const ouvrirEspace = async (): Promise<void> => {
    try {
      const moi = await lire<{ monde: string; humain: number | null; derniere_visite_jour: number | null }>('/api/moi', champ.value.trim());
      etat.jeton = memoire('re:jeton', champ.value.trim());
      if (moi.humain === null) { message.textContent = 'Votre humain naîtra à la prochaine journée du monde. Revenez demain.'; return; }
      etat.monHumain = moi.humain; memoire('re:humain', String(moi.humain));
      if (moi.derniere_visite_jour !== null) memoire(`re:vu:${moi.monde}:${moi.humain}`, String(moi.derniere_visite_jour));
      if (moi.monde !== etat.monde) await changerMonde(moi.monde);
      majMenu(); location.hash = `#/humain/${moi.humain}`;
    } catch { message.textContent = 'Ce code n’ouvre aucun journal. Vérifiez-le dans le message reçu à l’inscription.'; }
  };
  n.push(el('form', { class: 'code', submit: (e: Event) => { e.preventDefault(); void ouvrirEspace(); } },
    el('label', { for: 'code' }, 'Code reçu à l’inscription'), champ, el('button', { class: 'action', type: 'submit' }, 'Ouvrir mon journal')), message);
  return n;
}

let tour = 0;
async function afficher(): Promise<void> {
  if (!etat.region) return;
  const ouvert = panneauOuvert();
  panneau.hidden = !ouvert;
  document.body.classList.toggle('ouvert', ouvert);
  if (!ouvert) { contenu.replaceChildren(); contenu.dataset.route = ''; return; }
  const [nom, arg] = etat.route, monTour = ++tour;
  let noeuds: Noeuds;
  try {
    noeuds = nom === 'commune' ? await panneauCommune(arg) : nom === 'humain' ? await panneauHumain(Number(arg)) : nom === 'bien' ? await panneauBien(arg)
      : nom === 'fait' ? await panneauFait(arg) : partage() ? await panneauBilan() : nom === 'moi' ? await panneauMoi() : panneauChronique();
  } catch (e) {
    noeuds = [entete('Cette page n’existe pas dans ce monde'), el('p', { class: 'vide' }, (e as Error).message)];
  }
  if (monTour !== tour) return;
  const meme = contenu.dataset.route === etat.route.join('/'), defilement = panneau.scrollTop;
  contenu.replaceChildren(...noeuds.filter((x): x is Node => !!x));
  contenu.dataset.route = etat.route.join('/');
  panneau.scrollTop = meme ? defilement : 0;
}

// ---- Navigation --------------------------------------------------------------------------
function majMenu(): void {
  const mien = $<HTMLAnchorElement>('#mien');
  mien.href = etat.monHumain !== null ? `#/humain/${etat.monHumain}` : '#/moi';
  const section = partage() ? 'comparer' : ['humain', 'moi'].includes(etat.route[0]) ? 'mien' : etat.route[0] === 'chronique' ? 'chronique' : '';
  document.querySelectorAll<HTMLAnchorElement>('.coin-menu > a').forEach(a => a.toggleAttribute('aria-current', a.id === section));
  const comparer = $<HTMLAnchorElement>('#comparer');
  comparer.href = partage() ? (etat.route[1] === 'bilan' ? '#/mondes' : '#/mondes/bilan') : '#/mondes';
  comparer.textContent = partage() ? (etat.route[1] === 'bilan' ? 'Trois mondes' : 'Ce qui a changé') : 'Comparer';
  $<HTMLAnchorElement>('#fermer').href = partage() ? '#/mondes' : '#/carte';
  barreMondes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.monde === etat.monde)));
}
async function naviguer(): Promise<void> {
  const route = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  etat.route = route.length ? route : ['carte'];
  suivi = true;
  if (partage() && !etat.trois.length) {
    const cas = etat.mondes.filter(m => m.cas).slice(0, 3);
    etat.trois = await Promise.all((cas.length ? cas : etat.mondes.slice(0, 1)).map(async m => ({ id: m.id, chrono: await vue<Chronologie>('/api/mondes/{m}/chronologie', m.id) })));
  }
  const [nom, arg] = etat.route;
  let cible: Pt | null = null;
  if (nom === 'commune' && CENTRES[arg]) cible = CENTRES[arg];
  else if (nom === 'bien') { const l = lieux().find(q => q.bien === arg); if (l) cible = [l.x, l.y + 20]; }
  else if (nom === 'humain') {
    const f = await vue<Fiche>(`/api/mondes/{m}/humains/${arg}`).catch(() => null);
    if (f) {
      if (!etat.habitants.some(h => h.f.id === f.id)) etat.habitants = [...etat.habitants, ...installer([f])];
      const ms = maisonsDe(f.commune), m = ms[f.ilot % ms.length];
      cible = [m.x + m.l / 2, m.y];
    }
  } else if (nom === 'fait') {
    const d = await vue<DetailEvenement>(`/api/mondes/{m}/evenements/${arg}`).catch(() => null);
    if (d && CENTRES[d.evenement.lieu]) cible = d.evenement.type.startsWith('droit.') || d.evenement.type.startsWith('depot.') ? [batiment('entrepot', 'bourg')!.x + 33, 262] : CENTRES[d.evenement.lieu];
  } else if (partage() && !tranches.some(q => q.id !== etat.monde)) cible = [batiment('entrepot', 'bourg')!.x + 20, 290];
  canvas.setAttribute('aria-label', partage() ? 'Le même endroit de la vallée dans trois mondes, côte à côte' : 'La vallée vue du ciel : la rivière, les chemins, cinq communes et leurs habitants');
  majMenu();
  await afficher();
  if (cible) viser(cible);
  refaireEtiquettes(); dessiner();
}
async function changerMonde(id: string): Promise<void> {
  etat.monde = id; memoire('re:monde', id);
  const [region, chrono] = await Promise.all([vue<Region>('/api/mondes/{m}/region'), vue<Chronologie>('/api/mondes/{m}/chronologie')]);
  const [gens, faits] = await Promise.all([
    Promise.all(region.communes.map(co => vue<{ humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${co.id}&limite=60`))),
    Promise.all(['region', ...region.communes.map(c => c.id)].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`)))]);
  etat.region = region; etat.chrono = chrono;
  etat.habitants = installer(gens.flatMap(g => g.humains.slice(0, config.humains_visibles.value)));
  etat.faits = faits.flatMap(x => x.evenements).sort((a, b) => (a.id < b.id ? 1 : -1));
  curseur.max = String(region.monde.jour); curseur.min = '1';
  allerAuJour(etat.jour === 1 ? Number(params.get('jour')) || region.monde.jour : etat.jour);
}
addEventListener('hashchange', () => void naviguer());

// ---- Démarrage ------------------------------------------------------------------------------
async function demarrer(): Promise<void> {
  etat.source = await ouvrir();
  document.body.dataset.source = etat.source;
  etat.mondes = (await lire<{ mondes: Monde[] }>('/api/mondes')).mondes.filter(m => m.jour > 0);
  if (!etat.mondes.length) {
    panneau.hidden = false;
    contenu.replaceChildren(entete('Aucun monde n’a encore vécu'), el('p', { class: 'chapo' }, 'Lancez « python -m ressources_egales comparer », puis rechargez la page.'));
    return;
  }
  barreMondes.replaceChildren(...etat.mondes.map(m => el('button', { type: 'button', 'data-monde': m.id, class: m.cas === 'C' ? 'reserve' : '', 'aria-pressed': 'false', title: m.cas ? `Monde ${m.id} : ${NOMS_MONDES[m.cas] ?? ''}` : m.nom, 'aria-label': m.cas ? `Monde ${m.id} : ${NOMS_MONDES[m.cas] ?? ''}` : m.nom,
    click: () => void changerMonde(m.id).then(naviguer) }, m.cas ? m.id : m.nom.slice(0, 10))));
  const souvenu = memoire('re:humain');
  etat.monHumain = souvenu === null ? null : Number(souvenu);
  const voulu = params.get('monde') ?? memoire('re:monde') ?? '';
  const depart = etat.mondes.find(m => m.id === voulu) ?? etat.mondes.find(m => m.cas === 'C') ?? etat.mondes[0];
  if (params.get('scene') && !location.hash) history.replaceState(null, '', `#/${params.get('scene')}`);
  await document.fonts?.ready;
  cam.zoom = Number(params.get('zoom')) || 0;
  ajuster();
  viser(CENTRES.bourg, true);
  await changerMonde(depart.id);
  await naviguer();
  cam.x = cam.cx; cam.y = cam.cy;
  install({
    get scene() { return etat.route[0]; },
    get state() {
      return { monde: etat.monde, jour: etat.jour, route: etat.route.join('/'), source: etat.source, habitants: tranches[0]?.sil.length ?? 0, lecture: etat.lecture, temps: t,
        zoom: cam.zoom, camera: [Math.round(cam.x), Math.round(cam.y)], tranches: tranches.length, panneau: !panneau.hidden };
    },
    press(code: string) { appuyer(code); },
    hold(code: string, on: boolean) { if (on) tenues.add(code); else tenues.delete(code); },
    step(n = 1, draw = true) { for (let i = 0; i < n; i++) avancer(1 / 60); if (draw) dessiner(); },
  });
  if (!manual) { boucleActive = true; dernier = clock.now(); requestAnimationFrame(image); } else dessiner();
}
void demarrer();
