// La page : la vallée, ses communes, ses habitants et ses trois mondes.
// Les règles de lecture sont dans game/rules.ts, le dessin dans art/ et vues/,
// l'accès aux données dans api.ts ; ce que les essais pilotent est dans hook.ts.

import config from '../data/config.json';
import './style.css';
import { lire, ouvrir } from './api';
import { ENCRE_DROIT, ENCRE_EAU, GAMMES, HAUTEUR, LARGEUR, habitant, palette } from './art/dessin';
import { fusionnerJournal, kg, matricule, mesuresDuJour, niveauGlobal, statutDepot, statutsCommune, type LigneJournal, type Statut } from './game/rules';
import { clock, install, manual, params } from './hook';
import type { Chronologie, Comparaison, DetailEvenement, Evenement, Fiche, FicheBien, FicheCourte, Monde, Observation, Region } from './types';
import { ambianceDuJour, dessinerCarte, positionCommune } from './vues/carte';
import { dessinerCommune, planCommune, type Silhouette } from './vues/commune';
import { HAUTEUR_BANDE, dessinerMondes, hautBande } from './vues/mondes';
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
function memoire(cle: string, valeur?: string | null): string | null {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    if (valeur === null) localStorage.removeItem(cle); else localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible : la page marche sans */ }
  return valeur ?? null;
}
const NOMS_MONDES: Record<string, string> = { A: 'entrepôt commun', B: 'acquis, resté ouvert', C: 'acquis, en partie réservé' };
/** Faits qui tiennent au droit acquis sur l'entrepôt : ils portent le fil magenta. */
const surLeFil = (e: Evenement): boolean => e.type.startsWith('droit.') || e.type === 'depot.acces_limite' || (e.type === 'livraison.partielle' && e.mesure.raison === 'droits');

// ---- État de la page --------------------------------------------------------------------
interface Etat {
  source: 'api' | 'demo'; mondes: Monde[]; monde: string; region: Region | null; chrono: Chronologie | null;
  jour: number; lecture: boolean; route: string[]; habitants: FicheCourte[]; communeVue: string | null;
  monHumain: number | null; jeton: string | null; trois: { id: string; chrono: Chronologie }[];
}
const etat: Etat = {
  source: 'api', mondes: [], monde: '', region: null, chrono: null, jour: 1, lecture: false, route: ['carte'],
  habitants: [], communeVue: null, monHumain: null, jeton: memoire('re:jeton'), trois: [],
};
const cache = new Map<string, Promise<unknown>>();
function vue<T>(chemin: string, monde = etat.monde): Promise<T> {
  const cle = `${monde}|${chemin}`;
  if (!cache.has(cle)) cache.set(cle, lire<T>(chemin.replace('{m}', monde)));
  return cache.get(cle) as Promise<T>;
}
const enTroisMondes = (): boolean => etat.route[0] === 'mondes' || etat.route[0] === 'observation';

// ---- Squelette --------------------------------------------------------------------------
const $ = <T extends HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const canvas = $<HTMLCanvasElement>('#game'), ctx = canvas.getContext('2d')!;
canvas.width = LARGEUR; canvas.height = HAUTEUR;
const cadre = $('#cadre'), etiquettes = $('#etiquettes'), contenu = $('#contenu'), barreMondes = $('#mondes');
const curseur = $<HTMLInputElement>('#jour'), boutonLecture = $<HTMLButtonElement>('#lecture'), ruban = $<HTMLCanvasElement>('#ruban');
const texteDate = $('#date'), titreScene = $('#titre-scene'), legende = $('#legende');
let echelle = 1;
function ajuster(): void {
  const scene = cadre.parentElement!;
  const dpr = Math.max(1, Math.round(devicePixelRatio || 1));
  const place = Math.min(scene.clientWidth + 6, innerWidth);
  const haut = innerWidth < 900 ? innerHeight * 0.62 : Math.max(innerHeight * 0.5, innerHeight - (cadre.getBoundingClientRect().top + scrollY) - 92);
  // Facteur entier en pixels d'écran : le dessin reste net sur tous les écrans.
  const pixels = Math.max(1, Math.floor(Math.min((place * dpr) / LARGEUR, (haut * dpr) / HAUTEUR)));
  echelle = Math.max(pixels / dpr, Math.min(1, place / LARGEUR));
  cadre.style.width = `${LARGEUR * echelle}px`; cadre.style.height = `${HAUTEUR * echelle}px`;
  $('.temps').style.width = `${LARGEUR * echelle - 6}px`;
  ruban.parentElement!.style.height = `${Math.max(44, Math.round(30 * Math.min(echelle, 2)))}px`;
  placerEtiquettes();
}
addEventListener('resize', ajuster);

/** La page prend les tons de la saison affichée. */
let ambianceActive = '';
function teinter(): void {
  if (!etat.region || !etat.chrono) return;
  const a = ambianceDuJour(etat.chrono, etat.region, etat.jour);
  if (a === ambianceActive) return;
  ambianceActive = a;
  GAMMES[a].forEach((ton, i) => document.documentElement.style.setProperty(`--t${i}`, ton));
  document.documentElement.style.setProperty('--eau', ENCRE_EAU);
  document.documentElement.style.setProperty('--droit', ENCRE_DROIT);
  legende.replaceChildren(
    el('span', {}, el('i', { style: `background:${ENCRE_EAU}` }), 'débit de la rivière'),
    el('span', {}, el('i', { style: `background:${GAMMES[a][0]};height:2px;vertical-align:4px` }), 'stock de l’entrepôt'),
    el('span', {}, el('i', { style: `background:${ENCRE_DROIT}` }), 'part de l’entrepôt réservée'),
    el('span', {}, 'Flèches, Espace : parcourir l’année'));
}

// ---- Scène : vallée, commune ou trois mondes ---------------------------------------------
let t = 0, silhouettes: Silhouette[] = [];
const heure = (): number => (7 + t * config.heures_par_seconde.value) % 24;
function dessiner(): void {
  if (!etat.region || !etat.chrono) return;
  ctx.imageSmoothingEnabled = false;
  if (enTroisMondes() && etat.trois.length) dessinerMondes(ctx, etat.region, etat.trois, etat.jour, t, etat.trois.findIndex(m => m.id === etat.monde));
  else if (etat.communeVue) silhouettes = dessinerCommune(ctx, etat.region, etat.chrono, etat.communeVue, etat.jour, heure(), t, etat.habitants, etat.monHumain);
  else dessinerCarte(ctx, etat.region, etat.chrono, etat.jour, t, null);
}
function etatTexte(s: Statut): HTMLElement {
  return el('span', { class: `etat ${s.niveau}` }, el('span', { 'aria-hidden': 'true' }, `${s.picto} `), s.libelle);
}
function placerEtiquettes(): void {
  if (!etat.region || !etat.chrono) return;
  etiquettes.replaceChildren();
  const poser = (x: number, y: number, noeud: HTMLElement): void => {
    noeud.style.left = `${x * echelle}px`; noeud.style.top = `${y * echelle}px`;
    etiquettes.append(noeud);
  };
  const r = mesuresDuJour(etat.chrono, 'region', etat.jour);
  if (enTroisMondes()) {
    etat.trois.forEach((mo, i) => {
      const rm = mesuresDuJour(mo.chrono, 'region', etat.jour);
      const reserve = (rm.part_reservee ?? 0) > 0;
      const b = el('button', { class: `nom bande ${reserve ? 'droit' : ''}`, type: 'button', 'aria-pressed': mo.id === etat.monde, click: () => void changerMonde(mo.id).then(naviguer) },
        `Monde ${mo.id} : ${reserve ? `${pct(rm.part_reservee)} de l’entrepôt réservés` : NOMS_MONDES[mo.id] ?? ''}`);
      poser(22, hautBande(i) + 4, b);
    });
    return;
  }
  if (etat.communeVue) {
    for (const l of planCommune(etat.region, etat.communeVue).lieux) {
      const reserve = l.cle === 'depot' && (r.part_reservee ?? 0) > 0;
      const texte = reserve ? `${l.nom}, ${pct(r.part_reservee)} réservés` : l.nom;
      poser(l.x, l.y, l.bien ? lien(texte, `bien/${l.bien}`, `nom lieu ${reserve ? 'droit' : ''}`) : el('span', { class: 'nom lieu' }, texte));
    }
    return;
  }
  for (const co of etat.region.communes) {
    const [x, y] = positionCommune(co.carte);
    const statuts = statutsCommune(mesuresDuJour(etat.chrono, co.id, etat.jour));
    const notables = statuts.filter(s => s.niveau !== 'ok');
    const a = lien('', `commune/${co.id}`, `nom ${niveauGlobal(statuts)}`);
    a.append(el('b', {}, co.nom));
    if (notables.length) a.append(el('span', {}, echelle >= 2.5 ? notables[0].libelle : notables.map(s => s.picto).join(' ')));
    if (co.id === 'bourg' && (r.part_reservee ?? 0) > 0) a.append(el('span', { class: 'droit' }, echelle >= 2.5 ? `entrepôt réservé à ${pct(r.part_reservee)}` : `▥ ${pct(r.part_reservee)}`));
    a.setAttribute('aria-label', `${co.nom} : ${statuts.map(s => s.libelle).join(', ')}`);
    poser(x, y + (co.id === 'bourg' ? 21 : 19), a);
  }
}
canvas.addEventListener('click', e => {
  const b = canvas.getBoundingClientRect();
  const x = ((e.clientX - b.left) / b.width) * LARGEUR, y = ((e.clientY - b.top) / b.height) * HAUTEUR;
  if (enTroisMondes()) {
    const i = etat.trois.findIndex((_, k) => y >= hautBande(k) && y < hautBande(k) + HAUTEUR_BANDE);
    if (i >= 0 && etat.trois[i].id !== etat.monde) void changerMonde(etat.trois[i].id).then(naviguer);
    return;
  }
  if (!etat.communeVue) return;
  const touche = [...silhouettes].reverse().find(s => x >= s.x && x <= s.x + 16 && y >= s.y && y <= s.y + 24);
  if (touche) location.hash = `#/humain/${touche.id}`;
});

// ---- Temps -------------------------------------------------------------------------------
let rafraichir = 0;
function allerAuJour(j: number, parLecture = false): void {
  if (!etat.region || !etat.chrono) return;
  etat.jour = Math.max(1, Math.min(etat.region.monde.jour, Math.round(j)));
  curseur.value = String(etat.jour);
  const [jourMois, an] = (etat.chrono.dates[etat.jour - 1] ?? '').split(', an ');
  const saison = etat.chrono.saisons[etat.jour - 1] ?? '';
  texteDate.replaceChildren(jourMois, el('small', {}, `${saison}, jour ${etat.jour} de l’an ${an ?? 1}`));
  curseur.setAttribute('aria-valuetext', `${jourMois}, ${saison}, jour ${etat.jour}`);
  teinter();
  dessinerRuban(ruban, etat.region, etat.chrono, etat.jour);
  placerEtiquettes();
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
function appuyer(code: string): void {
  if (code === 'ArrowRight') allerAuJour(etat.jour + 1);
  else if (code === 'ArrowLeft') allerAuJour(etat.jour - 1);
  else if (code === 'PageDown') allerAuJour(etat.jour + 30);
  else if (code === 'PageUp') allerAuJour(etat.jour - 30);
  else if (code === 'Space') basculerLecture();
  else if (code === 'Escape') location.hash = '#/carte';
}
addEventListener('keydown', e => {
  const cible = e.target as HTMLElement;
  if (cible.matches('input, select, textarea, button, a') && e.code !== 'Escape') return;
  if (['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); appuyer(e.code); }
});

// ---- Boucle -------------------------------------------------------------------------------
let boucleActive = false, dernier = 0, resteJour = 0;
function avancer(dt: number): void {
  t += dt;
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

// ---- Carnet -------------------------------------------------------------------------------
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
function portrait(h: FicheCourte, zoom: number): HTMLCanvasElement {
  const c = el('canvas', { width: 16, height: 24, class: 'portrait', 'aria-hidden': 'true' });
  c.style.width = `${16 * zoom}px`; c.style.height = `${24 * zoom}px`;
  const a = etat.region && etat.chrono ? ambianceDuJour(etat.chrono, etat.region, etat.jour) : 'printemps';
  habitant(c.getContext('2d')!, 0, 0, { age: h.age, metier: h.metier, graine: h.id }, 0, palette(a));
  return c;
}
function carteHumain(h: FicheCourte): HTMLElement {
  const a = lien('', `humain/${h.id}`, h.id === etat.monHumain ? 'mien' : '');
  a.append(portrait(h, 2), el('span', {}, el('b', {}, `${h.prenom} ${h.nom}`), el('small', {}, `${h.age} ans, ${h.age >= 16 && h.metier ? h.metier_nom : h.etape}`)));
  return a;
}
function entete(titre: string, retour?: [string, string]): HTMLElement {
  return el('header', {}, retour && lien(`Retour : ${retour[0]}`, retour[1], 'retour'), el('h2', {}, titre));
}
const nomCommune = (id: string): string => etat.region?.communes.find(c => c.id === id)?.nom ?? (id === 'region' ? 'la région' : id);
const inventaire = (lignes: [string, string][]): HTMLElement => el('dl', { class: 'inventaire' }, ...lignes.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));

async function carnetVallee(): Promise<Noeuds> {
  const region = etat.region!, ch = etat.chrono!;
  const r = mesuresDuJour(ch, 'region', etat.jour);
  const faits = (await Promise.all(['region', ...region.communes.map(c => c.id)].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`))))
    .flatMap(x => x.evenements).filter(e => e.jour <= etat.jour).sort((a, b) => (a.id < b.id ? 1 : -1));
  const besoin = r.population * 1.2, reserve = (r.part_reservee ?? 0) > 0;
  const manque = r.depot_demande_kg - r.depot_servi_kg > 1;
  return [
    el('header', {}, el('h2', {}, 'La vallée')),
    el('p', { class: 'chapo' }, `${nombre(r.population)} habitants, cinq communes, une rivière. Elle roule ${nombre(r.debit_m3)} m³ aujourd’hui ; la retenue de La Source en garde ${nombre(r.reserve_m3)}. `,
      lien('L’entrepôt du Bourg', 'bien/depot'), ` tient ${kg(r.depot_kg)}, de quoi nourrir tout le monde ${jours(r.depot_kg / besoin)}.`),
    reserve && el('p', { class: 'chapo' }, el('strong', { class: 'droit' }, `${pct(r.part_reservee)} de ses portes sont réservées. `),
      manque ? `Il sert ${kg(r.depot_servi_kg)} sur les ${kg(r.depot_demande_kg)} que les communes demandent.` : 'Aujourd’hui, ce qui reste ouvert suffit.'),
    el('nav', { class: 'voisins', 'aria-label': 'Communes' }, ...region.communes.map(co => lien(co.nom, `commune/${co.id}`))),
    el('h3', {}, 'Ce qui s’est passé'),
    listeFaits(faits, 'Rien de notable pour l’instant. Faites défiler l’année.', 24),
  ];
}

async function carnetCommune(id: string): Promise<Noeuds> {
  const region = etat.region!, ch = etat.chrono!;
  const co = region.communes.find(c => c.id === id);
  if (!co) return [entete('Commune inconnue', ['la vallée', 'carte'])];
  const m = mesuresDuJour(ch, id, etat.jour);
  const [faits, gens] = await Promise.all([
    vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${id}/evenements`),
    vue<{ total: number; humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${id}&limite=60`)]);
  const biens = region.biens.filter(b => b.commune === id);
  return [
    entete(co.nom, ['la vallée', 'carte']),
    el('p', { class: 'chapo' }, co.role),
    el('p', { class: 'etats' }, ...statutsCommune(m).map(etatTexte)),
    inventaire([['Habitants', nombre(co.population)], ['Au grenier', kg(m.stock_kg)], ['Eau des foyers', pct(m.eau_domestique_couverture)], ['Temps libre, par adulte', `${nombre(m.temps_libre_moyen_h, 1)} h par jour`]]),
    biens.length ? el('p', { class: 'voisins' }, ...biens.map(b => lien(b.nom, `bien/${b.id}`))) : null,
    el('h3', {}, 'Ce qui s’est passé ici'),
    listeFaits(faits.evenements.filter(e => e.jour <= etat.jour).reverse(), 'Rien de notable pour l’instant.', 16),
    el('h3', {}, `${nombre(gens.total)} habitants, dont`),
    el('div', { class: 'gens' }, ...gens.humains.slice(0, 18).map(carteHumain)),
    el('nav', { class: 'voisins', 'aria-label': 'Autres communes' }, ...region.communes.filter(c => c.id !== id).map(c => lien(c.nom, `commune/${c.id}`))),
  ];
}

async function carnetHumain(id: number): Promise<Noeuds> {
  const f = await vue<Fiche>(`/api/mondes/{m}/humains/${id}`);
  const [lieu, bourg, region] = await Promise.all([f.commune, 'bourg', 'region'].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`)));
  const cleVisite = `re:vu:${etat.monde}:${id}`;
  const depuis = memoire(cleVisite);
  const journal = fusionnerJournal(f.journal, lieu.evenements, f.commune === 'bourg' ? region.evenements : [...bourg.evenements, ...region.evenements], etat.jour, depuis === null ? null : Number(depuis));
  const nouveaux = journal.filter(l => l.nouveau);
  if (!etat.lecture) memoire(cleVisite, String(Math.max(etat.jour, Number(depuis ?? 0))));
  const mien = etat.monHumain === id;
  const libelles: Record<string, string> = { essentiel: 'sommeil et repas', travail: 'travail', etude: 'école', soins_au_foyer: 'soins au foyer', soins_recus: 'soins reçus', ravitaillement: 'ravitaillement', libre: 'temps libre' };
  const parts = Object.entries(f.journee).filter(([, v]) => v > 0);
  const cases: HTMLElement[] = [];
  let cumul = 0;
  for (const [k, v] of parts) { cumul += v; while (cases.length < Math.round(cumul)) cases.push(el('i', { class: k })); }
  const activite = f.age >= 16 && f.metier ? `travaille dans ${f.metier === 1 ? 'l’agriculture' : f.metier === 2 ? 'l’équipe technique' : 'les services'}` : f.age < 6 ? 'est encore tout petit' : f.age < 16 ? 'va à l’école' : 'ne travaille plus';
  const suivre = el('button', { class: `action ${mien ? 'discret' : ''}`, click: () => { etat.monHumain = mien ? null : id; memoire('re:humain', mien ? null : String(id)); void afficher(); majTete(); } }, mien ? 'Ne plus suivre' : 'Suivre cet humain');
  return [
    entete(`${f.prenom} ${f.nom}`, [nomCommune(f.commune), `commune/${f.commune}`]),
    el('div', { class: 'identite' }, portrait(f, 5),
      el('p', {}, `${f.age} ans. ${f.prenom} ${activite} à ${nomCommune(f.commune)}${f.vivant ? '' : ' ; sa vie s’est achevée'}. Foyer ${f.foyer_detail.nom}, ${f.foyer_detail.type}.`,
        el('br'), el('span', { class: 'note' }, `${matricule('H', f.id)}, foyer ${matricule('F', f.foyer)}`))),
    etat.source === 'demo' || mien ? el('div', { class: 'actions' }, suivre) : null,
    el('h3', {}, 'Ses vingt-quatre heures'),
    el('div', {}, el('div', { class: 'heures', role: 'img', 'aria-label': parts.map(([k, v]) => `${libelles[k]} ${nombre(v, 1)} h`).join(', ') }, ...cases),
      el('p', { class: 'cles' }, ...parts.map(([k, v]) => el('span', {}, el('i', { class: k, style: `background:var(--t${k === 'essentiel' ? 0 : k === 'travail' || k === 'etude' ? 1 : k === 'libre' ? 3 : 2})` }), `${libelles[k]} ${nombre(v, 1)} h`)))),
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

async function carnetBien(id: string): Promise<Noeuds> {
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
    entete(b.bien.nom, [b.commune_nom, `commune/${b.bien.commune}`]),
    el('p', { class: 'chapo' }, b.bien.description),
    el('p', { class: 'chapo' }, reservee > 0 ? el('strong', { class: 'droit' }, `Accès réservé à ${pct(reservee)}.`) : el('strong', {}, 'Accès commun.'),
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
        ? el('p', {}, `Réserver ${pct(b.offre.part_proposee)} de plus laisserait ${kg(o.commun_kg_jour)} par jour ouverts à tous. Ces trente derniers jours, ${kg(o.servi_moyen_kg_jour)} sortent chaque jour : `, el('strong', { class: 'droit' }, `${kg(o.a_couvrir_ailleurs_kg_jour)} par jour`), ' devraient être trouvés ailleurs, reportés ou laissés non servis.')
        : el('p', {}, 'Toute la capacité est déjà engagée.'),
      el('p', { class: 'note' }, 'Les achats ouvriront dans une seconde phase. D’ici là, des événements d’essai produisent les mêmes changements de droits.'));
  }
  return n;
}

async function carnetFait(id: string): Promise<Noeuds> {
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
    entete(e.titre, e.humain !== null ? ['sa fiche', `humain/${e.humain}`] : e.lieu === 'region' ? ['la vallée', 'carte'] : [e.lieu_nom, `commune/${e.lieu}`]),
    el('p', { class: 'note' }, `${e.date}, jour ${e.jour}, ${e.lieu_nom}`),
    el('p', { class: 'chapo' }, e.texte),
    el('div', { class: 'actions' }, el('button', { class: 'action', click: () => allerAuJour(e.jour) }, 'Voir la vallée ce jour-là'),
      surLeFil(e) && lien('L’entrepôt du Bourg', 'bien/depot')),
    el('h3', {}, 'Pourquoi'),
    causes.length ? el('ol', { class: 'causes' }, ...causes.map(c => chaine(c, vus))) : el('p', { class: 'vide' }, 'Ce fait ne découle d’aucun autre : il est daté par le calendrier du monde.'),
    el('h3', {}, 'Ce que cela a entraîné'),
    listeFaits(d.consequences, 'Rien, pour l’instant.', 16),
  ];
}

async function carnetMondes(): Promise<Noeuds> {
  const region = etat.region!;
  const ids = etat.trois.map(m => m.id);
  const [obs, comp] = await Promise.all([
    vue<Observation>('/api/mondes/{m}/observation'),
    ids.length > 1 ? lire<Comparaison>(`/api/comparaison?mondes=${ids.join(',')}`).catch(() => null) : Promise.resolve(null)]);
  const n: Noeuds = [
    el('header', {}, el('h2', {}, 'Le même jour, dans trois mondes')),
    el('p', { class: 'chapo' }, 'Même vallée, même météo, mêmes habitants au départ. Une seule chose change : qui détient l’entrepôt du Bourg, et ce qu’il fait de ses portes.'),
  ];
  // Ce jour-là : une phrase par monde, tirée des mesures du jour.
  const phrases = etat.trois.map(mo => {
    const r = mesuresDuJour(mo.chrono, 'region', etat.jour);
    const bas = region.communes.filter(co => (mesuresDuJour(mo.chrono, co.id, etat.jour).jours_reserve ?? 99) < 6).map(co => co.nom);
    const manque = r.depot_demande_kg - r.depot_servi_kg > 1;
    const reserve = (r.part_reservee ?? 0) > 0;
    return el('li', { class: mo.id === etat.monde ? 'ici' : '' }, el('b', { class: reserve ? 'droit' : '' }, `Monde ${mo.id}. `),
      manque ? `L’entrepôt sert ${kg(r.depot_servi_kg)} sur ${kg(r.depot_demande_kg)} demandés. ` : 'L’entrepôt sert tout ce qu’on lui demande. ',
      bas.length ? `${bas.join(', ')} ${bas.length > 1 ? 'vivent' : 'vit'} sur moins de six jours de réserve.` : 'Aucun grenier n’est bas.');
  });
  n.push(el('ul', { class: 'ecarts' }, ...phrases));
  if (comp) {
    const c = comp.ecarts.find(e => !e.identique), b = comp.ecarts.find(e => e.identique);
    n.push(el('h3', {}, 'Ce que l’année a changé'));
    if (b) n.push(el('p', {}, `Dans le monde ${b.monde}, l’entrepôt change de mains mais reste ouvert : tout se passe comme dans le monde ${b.reference}. Seule différence, ${pct(comp.mondes.find(m => m.monde === b.monde)!.region.concentration_max)} de la capacité dépendent désormais d’un seul compte.`));
    if (c) {
      const mc = comp.mondes.find(m => m.monde === c.monde)!, mr = comp.mondes[0];
      const lignes: HTMLElement[] = [el('li', {}, el('b', { class: 'droit' }, `${nombre(mc.region.jours_limites_par_droits)} jours `), 'où ce qui reste ouvert à l’entrepôt ne suffit plus.')];
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
    a.append(portrait({ id: f.humain, age: 40, metier: 1 + (f.humain % 3) } as FicheCourte, 3), el('span', {}, el('b', {}, `Foyer ${f.nom}, ${nomCommune(f.commune)}`),
      el('p', {}, `${f.type}, ${f.personnes} personne${f.personnes > 1 ? 's' : ''}. ${nombre(f.temps_libre_h, 1)} h de temps libre par adulte et par jour`
        + (f.heures_trajet > 0.5 ? `, ${nombre(f.heures_trajet, 1)} h de trajets de secours` : '') + (f.couverture_besoins < 0.9995 ? `, besoins couverts à ${pct(f.couverture_besoins)}` : '') + '.')));
    return a;
  })));
  return n;
}

async function carnetMoi(): Promise<Noeuds> {
  const n: Noeuds = [entete('Retrouver mon humain', ['la vallée', 'carte'])];
  if (etat.source === 'demo') {
    const gens = await vue<{ humains: FicheCourte[] }>('/api/mondes/{m}/humains?limite=200');
    n.push(el('p', { class: 'chapo' }, 'Choisissez une vie à suivre. Son journal s’ouvrira sur ce qui a changé depuis votre dernière visite.'),
      el('p', { class: 'note' }, 'Vous regardez une démonstration sans serveur. Dans le monde partagé, un code reçu à l’inscription ouvre le journal rattaché à votre compte.'),
      el('div', { class: 'gens' }, ...gens.humains.slice(0, 36).map(carteHumain)));
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
      majTete(); location.hash = `#/humain/${moi.humain}`;
    } catch { message.textContent = 'Ce code n’ouvre aucun journal. Vérifiez-le dans le message reçu à l’inscription.'; }
  };
  n.push(el('form', { class: 'code', submit: (e: Event) => { e.preventDefault(); void ouvrirEspace(); } },
    el('label', { for: 'code' }, 'Code reçu à l’inscription'), champ, el('button', { class: 'action', type: 'submit' }, 'Ouvrir mon journal')), message);
  return n;
}

let tour = 0;
async function afficher(): Promise<void> {
  if (!etat.region) return;
  const [nom, arg] = etat.route;
  const monTour = ++tour;
  let noeuds: Noeuds;
  try {
    noeuds = nom === 'commune' ? await carnetCommune(arg) : nom === 'humain' ? await carnetHumain(Number(arg)) : nom === 'bien' ? await carnetBien(arg)
      : nom === 'fait' ? await carnetFait(arg) : enTroisMondes() ? await carnetMondes() : nom === 'moi' ? await carnetMoi() : await carnetVallee();
  } catch (e) {
    noeuds = [entete('Cette page n’existe pas dans ce monde', ['la vallée', 'carte']), el('p', { class: 'vide' }, (e as Error).message)];
  }
  if (monTour !== tour) return;
  contenu.replaceChildren(...noeuds.filter((x): x is Node => !!x));
  contenu.dataset.route = etat.route.join('/');
}

// ---- Navigation --------------------------------------------------------------------------
function majTete(): void {
  const mien = $<HTMLAnchorElement>('#mien');
  mien.href = etat.monHumain !== null ? `#/humain/${etat.monHumain}` : '#/moi';
  mien.textContent = etat.monHumain !== null ? 'Mon humain' : 'Retrouver mon humain';
  const section = enTroisMondes() ? 'mondes' : ['humain', 'moi'].includes(etat.route[0]) ? 'moi' : 'carte';
  document.querySelectorAll<HTMLAnchorElement>('nav.onglets a').forEach(a => a.toggleAttribute('aria-current', a.id === 'mien' ? section === 'moi' : a.hash === `#/${section}`));
  barreMondes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.monde === etat.monde)));
}
async function naviguer(): Promise<void> {
  const route = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  etat.route = route.length ? route : ['carte'];
  let commune: string | null = null;
  if (etat.route[0] === 'commune') commune = etat.route[1];
  else if (etat.route[0] === 'humain') commune = (await vue<Fiche>(`/api/mondes/{m}/humains/${etat.route[1]}`).catch(() => null))?.commune ?? null;
  else if (etat.route[0] === 'bien') commune = etat.region?.biens.find(b => b.id === etat.route[1])?.commune ?? null;
  if (commune && !etat.region?.communes.some(c => c.id === commune)) commune = null;
  if (enTroisMondes() && !etat.trois.length) {
    const cas = etat.mondes.filter(m => m.cas).slice(0, 3);
    etat.trois = await Promise.all((cas.length ? cas : etat.mondes.slice(0, 1)).map(async m => ({ id: m.id, chrono: await vue<Chronologie>('/api/mondes/{m}/chronologie', m.id) })));
  }
  if (commune !== etat.communeVue) {
    etat.communeVue = commune;
    etat.habitants = [];
    if (commune) etat.habitants = (await vue<{ humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${commune}&limite=60`)).humains.slice(0, config.humains_visibles.value);
  }
  if (etat.communeVue && etat.route[0] === 'humain') {
    const hid = Number(etat.route[1]);
    if (!etat.habitants.some(h => h.id === hid)) {
      const f = await vue<Fiche>(`/api/mondes/{m}/humains/${hid}`).catch(() => null);
      if (f) etat.habitants = [...etat.habitants.slice(0, config.humains_visibles.value - 1), f];
    }
  }
  if (enTroisMondes()) {
    titreScene.replaceChildren('Trois fois la même vallée, d’amont en aval');
    canvas.setAttribute('aria-label', 'Trois bandes, une par monde : l’entrepôt et ses portes, les cinq greniers avec leurs jours de réserve, les charrettes de livraison et de secours');
  } else if (etat.communeVue) {
    titreScene.replaceChildren(el('a', { href: '#/carte' }, 'La vallée'), `, ${nomCommune(etat.communeVue)}`);
    canvas.setAttribute('aria-label', `${nomCommune(etat.communeVue)} vue du dessus : champs, logements, grenier, pompe et habitants`);
  } else {
    titreScene.replaceChildren(etat.region?.monde.cas ? `La vallée, monde ${etat.region.monde.id}` : 'La vallée');
    canvas.setAttribute('aria-label', 'Carte de la vallée : la rivière, les chemins et cinq communes');
  }
  majTete(); placerEtiquettes(); dessiner();
  await afficher();
}
async function changerMonde(id: string): Promise<void> {
  etat.monde = id; memoire('re:monde', id);
  const [region, chrono] = await Promise.all([vue<Region>('/api/mondes/{m}/region'), vue<Chronologie>('/api/mondes/{m}/chronologie')]);
  etat.region = region; etat.chrono = chrono;
  curseur.max = String(region.monde.jour); curseur.min = '1';
  ambianceActive = '';
  allerAuJour(etat.jour === 1 && !params.get('jour') ? region.monde.jour : Number(params.get('jour')) && etat.jour === 1 ? Number(params.get('jour')) : etat.jour);
}
addEventListener('hashchange', () => void naviguer());

// ---- Démarrage ------------------------------------------------------------------------------
async function demarrer(): Promise<void> {
  etat.source = await ouvrir();
  document.body.dataset.source = etat.source;
  etat.mondes = (await lire<{ mondes: Monde[] }>('/api/mondes')).mondes.filter(m => m.jour > 0);
  if (!etat.mondes.length) {
    contenu.replaceChildren(el('h2', {}, 'Aucun monde n’a encore vécu'), el('p', { class: 'chapo' }, 'Lancez « python -m ressources_egales comparer », puis rechargez la page.'));
    return;
  }
  barreMondes.replaceChildren(...etat.mondes.map(m => el('button', { type: 'button', 'data-monde': m.id, class: m.cas === 'C' ? 'reserve' : '', 'aria-pressed': 'false', click: () => void changerMonde(m.id).then(naviguer) },
    el('b', {}, m.cas ? `Monde ${m.id}` : m.nom), m.cas ? el('span', {}, NOMS_MONDES[m.cas] ?? '') : null)));
  const souvenu = memoire('re:humain');
  etat.monHumain = souvenu === null ? null : Number(souvenu);
  const voulu = params.get('monde') ?? memoire('re:monde') ?? '';
  const depart = etat.mondes.find(m => m.id === voulu) ?? etat.mondes.find(m => m.cas === 'C') ?? etat.mondes[0];
  if (params.get('scene') && !location.hash) history.replaceState(null, '', `#/${params.get('scene')}`);
  await document.fonts?.ready;
  await changerMonde(depart.id);
  ajuster();
  await naviguer();
  install({
    get scene() { return etat.route[0]; },
    get state() { return { monde: etat.monde, jour: etat.jour, route: etat.route.join('/'), source: etat.source, commune: etat.communeVue, habitants: silhouettes.length, lecture: etat.lecture, temps: t }; },
    press(code: string) { appuyer(code); },
    hold() { /* aucune touche maintenue dans ce jeu */ },
    step(n = 1, draw = true) { for (let i = 0; i < n; i++) avancer(1 / 60); if (draw) dessiner(); },
  });
  if (!manual) { boucleActive = true; dernier = clock.now(); requestAnimationFrame(image); } else dessiner();
}
void demarrer();
