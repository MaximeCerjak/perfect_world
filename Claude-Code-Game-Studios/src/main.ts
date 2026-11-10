// La page : carte, vue de commune, fiches, journal et tableau d'observation.
// Les règles de lecture sont dans game/rules.ts, le dessin dans art/ et vues/,
// l'accès aux données dans api.ts ; ce que les essais pilotent est dans hook.ts.

import config from '../data/config.json';
import './style.css';
import { lire, ouvrir } from './api';
import { HAUTEUR, LARGEUR, habitant } from './art/dessin';
import { fusionnerJournal, kg, matricule, mesuresDuJour, niveauGlobal, statutDepot, statutsCommune, type LigneJournal, type Statut } from './game/rules';
import { clock, install, manual, params } from './hook';
import type { Chronologie, Comparaison, DetailEvenement, Evenement, Fiche, FicheBien, FicheCourte, Monde, Observation, Region } from './types';
import { dessinerCarte, positionCommune } from './vues/carte';
import { dessinerCommune, planCommune, type Silhouette } from './vues/commune';
import { tracerCourbes } from './vues/courbes';

// ---- Petits outils de page -------------------------------------------------------------
type Noeuds = (Node | null)[];
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
function memoire(cle: string, valeur?: string | null): string | null {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    if (valeur === null) localStorage.removeItem(cle); else localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible : la page marche sans */ }
  return valeur ?? null;
}

// ---- État de la page --------------------------------------------------------------------
interface Etat {
  source: 'api' | 'demo'; mondes: Monde[]; monde: string; region: Region | null; chrono: Chronologie | null;
  jour: number; lecture: boolean; route: string[]; habitants: FicheCourte[]; communeVue: string | null;
  monHumain: number | null; jeton: string | null;
}
const etat: Etat = {
  source: 'api', mondes: [], monde: '', region: null, chrono: null, jour: 1, lecture: false, route: ['carte'],
  habitants: [], communeVue: null, monHumain: null, jeton: memoire('re:jeton'),
};
const cache = new Map<string, Promise<unknown>>();
function vue<T>(chemin: string): Promise<T> {
  const cle = `${etat.monde}|${chemin}`;
  if (!cache.has(cle)) cache.set(cle, lire<T>(chemin.replace('{m}', etat.monde)));
  return cache.get(cle) as Promise<T>;
}
const NOMS_MESURES: Record<string, string> = {
  jours_reserve_min: 'Jours de réserve, au plus bas', jours_ration_reduite: 'Jours de rations réduites',
  non_couvert_kg: 'Demande non couverte (kg)', secours_kg: 'Reçu de la réserve de secours (kg)',
  heures_tournee_secours: 'Heures de tournée de secours', heures_trajet_foyers: 'Heures de trajet des foyers',
  entretien_reporte_h: 'Entretien reporté (h)', pompe_etat_fin: 'État de la pompe en fin de période',
  temps_libre_moyen_h: 'Temps libre moyen (h/jour)',
};

// ---- Squelette --------------------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
canvas.width = LARGEUR; canvas.height = HAUTEUR;
const cadre = document.querySelector<HTMLElement>('#cadre')!;
const etiquettes = document.querySelector<HTMLElement>('#etiquettes')!;
const contenu = document.querySelector<HTMLElement>('#contenu')!;
const selectMonde = document.querySelector<HTMLSelectElement>('#monde')!;
const curseur = document.querySelector<HTMLInputElement>('#jour')!;
const boutonLecture = document.querySelector<HTMLButtonElement>('#lecture')!;
const texteDate = document.querySelector<HTMLElement>('#date')!;
const titreScene = document.querySelector<HTMLElement>('#titre-scene')!;
let echelle = 1;
function ajuster(): void {
  const zone = cadre.parentElement!;
  echelle = Math.max(1, Math.floor(Math.min(zone.clientWidth / LARGEUR, (innerHeight * (innerWidth < 900 ? 0.5 : 0.78)) / HAUTEUR)));
  cadre.style.width = `${LARGEUR * echelle}px`; cadre.style.height = `${HAUTEUR * echelle}px`;
  placerEtiquettes();
}
addEventListener('resize', ajuster);

// ---- Scène : carte ou commune -----------------------------------------------------------
let t = 0, silhouettes: Silhouette[] = [];
const heure = (): number => (7 + t * config.heures_par_seconde.value) % 24;
function dessiner(): void {
  if (!etat.region || !etat.chrono) return;
  ctx.imageSmoothingEnabled = false;
  if (etat.communeVue) {
    silhouettes = dessinerCommune(ctx, etat.region, etat.chrono, etat.communeVue, etat.jour, heure(), t, etat.habitants, etat.monHumain);
  } else {
    dessinerCarte(ctx, etat.region, etat.chrono, etat.jour, t, etat.route[0] === 'commune' ? etat.route[1] : null);
  }
}
function badge(s: Statut): HTMLElement {
  return el('span', { class: `badge ${s.niveau}`, title: s.libelle }, el('span', { 'aria-hidden': 'true' }, s.picto), ` ${s.libelle}`);
}
function placerEtiquettes(): void {
  if (!etat.region || !etat.chrono) return;
  etiquettes.replaceChildren();
  const poser = (x: number, y: number, noeud: HTMLElement): void => {
    noeud.style.left = `${x * echelle}px`; noeud.style.top = `${y * echelle}px`;
    etiquettes.append(noeud);
  };
  const r = mesuresDuJour(etat.chrono, 'region', etat.jour);
  if (etat.communeVue) {
    for (const l of planCommune(etat.region, etat.communeVue).lieux) {
      const statut = l.cle === 'depot' ? statutDepot(r) : null;
      const texte = statut && statut.niveau !== 'ok' ? `${l.nom} · ${statut.picto} ${statut.libelle}` : l.nom;
      poser(l.x, l.y, l.bien ? lien(texte, `bien/${l.bien}`, `etiquette lieu ${statut?.niveau ?? ''}`) : el('span', { class: 'etiquette lieu' }, texte));
    }
    return;
  }
  for (const co of etat.region.communes) {
    const [x, y] = positionCommune(co.carte);
    const statuts = statutsCommune(mesuresDuJour(etat.chrono, co.id, etat.jour));
    const niveau = niveauGlobal(statuts);
    const notables = statuts.filter(s => s.niveau !== 'ok');
    const a = lien('', `commune/${co.id}`, `etiquette commune ${niveau}`);
    a.append(el('strong', {}, co.nom));
    // Petit écran : pictogrammes seuls, le libellé complet reste dans le titre et le panneau.
    if (echelle >= 3) for (const s of notables.slice(0, 2)) a.append(el('small', {}, `${s.picto} ${s.libelle}`));
    else if (notables.length) a.append(el('small', {}, notables.map(s => s.picto).join(' ')));
    if (co.id === 'bourg' && (r.part_reservee ?? 0) > 0) a.append(el('small', { class: 'reserve' }, echelle >= 3 ? `▥ Entrepôt réservé à ${Math.round(r.part_reservee * 100)} %` : `▥ ${Math.round(r.part_reservee * 100)} %`));
    a.title = statuts.map(s => s.libelle).join(' · ');
    a.setAttribute('aria-label', `${co.nom} : ${statuts.map(s => s.libelle).join(', ')}`);
    poser(x + 4, y + 21, a);
  }
}
canvas.addEventListener('click', e => {
  if (!etat.communeVue) return;
  const b = canvas.getBoundingClientRect();
  const x = ((e.clientX - b.left) / b.width) * LARGEUR, y = ((e.clientY - b.top) / b.height) * HAUTEUR;
  const touche = [...silhouettes].reverse().find(s => x >= s.x && x <= s.x + 16 && y >= s.y && y <= s.y + 24);
  if (touche) location.hash = `#/humain/${touche.id}`;
});

// ---- Temps -------------------------------------------------------------------------------
let rafraichir = 0;
function allerAuJour(j: number, parLecture = false): void {
  if (!etat.region) return;
  etat.jour = Math.max(1, Math.min(etat.region.monde.jour, Math.round(j)));
  curseur.value = String(etat.jour);
  const ch = etat.chrono!;
  texteDate.textContent = `${ch.dates[etat.jour - 1] ?? ''} · jour ${etat.jour} · ${ch.saisons[etat.jour - 1] ?? ''}`;
  curseur.setAttribute('aria-valuetext', texteDate.textContent);
  placerEtiquettes();
  clearTimeout(rafraichir);
  rafraichir = window.setTimeout(() => void afficher(), parLecture ? 400 : 60);
  if (!boucleActive) dessiner();
}
function basculerLecture(force?: boolean): void {
  etat.lecture = force ?? !etat.lecture;
  if (etat.lecture && etat.jour >= (etat.region?.monde.jour ?? 1)) allerAuJour(1);
  boutonLecture.textContent = etat.lecture ? '❚❚' : '▶';
  boutonLecture.setAttribute('aria-label', etat.lecture ? 'Mettre en pause' : 'Faire défiler les jours');
}
curseur.addEventListener('input', () => { basculerLecture(false); allerAuJour(Number(curseur.value)); });
boutonLecture.addEventListener('click', () => basculerLecture());
const touches = new Set<string>();
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

// ---- Panneaux -------------------------------------------------------------------------------
function ligneFait(e: Evenement | LigneJournal): HTMLElement {
  const nouveau = (e as LigneJournal).nouveau;
  const portee = (e as LigneJournal).portee;
  return el('li', { class: `fait ${nouveau ? 'nouveau' : ''} ${portee ?? ''}` },
    el('a', { href: `#/fait/${e.id}` },
      el('span', { class: 'quand' }, e.jour_fin && e.jour_fin !== e.jour ? `Jours ${e.jour} à ${e.jour_fin}` : `${e.date}`),
      el('strong', {}, e.titre), nouveau && el('span', { class: 'puce' }, 'nouveau'),
      el('span', { class: 'texte' }, e.texte),
      el('span', { class: 'ou' }, portee === 'personnel' ? 'Dans sa vie' : e.lieu_nom)));
}
function listeFaits(faits: (Evenement | LigneJournal)[], vide: string, max = 40): HTMLElement {
  if (!faits.length) return el('p', { class: 'vide' }, vide);
  const ul = el('ul', { class: 'faits' }, ...faits.slice(0, max).map(ligneFait));
  if (faits.length > max) ul.append(el('li', { class: 'vide' }, `… et ${faits.length - max} faits plus anciens.`));
  return ul;
}
function carteHumain(h: FicheCourte): HTMLElement {
  const a = lien('', `humain/${h.id}`, `humain ${h.id === etat.monHumain ? 'mien' : ''}`);
  a.append(portrait(h, 2), el('span', {}, el('strong', {}, `${h.prenom} ${h.nom}`), el('small', {}, `${h.age} ans · ${h.age >= 16 && h.metier ? h.metier_nom : h.etape}`)));
  return a;
}
function portrait(h: FicheCourte, zoom: number): HTMLCanvasElement {
  const c = el('canvas', { width: 16, height: 24, class: 'portrait', 'aria-hidden': 'true' });
  c.style.width = `${16 * zoom}px`; c.style.height = `${24 * zoom}px`;
  habitant(c.getContext('2d')!, 0, 0, { age: h.age, metier: h.metier, graine: h.id }, 0);
  return c;
}
function entete(titre: string, sousTitre: string, retour?: [string, string]): HTMLElement {
  return el('header', { class: 'entete' }, retour && lien(`← ${retour[0]}`, retour[1], 'retour'), el('h2', {}, titre), el('p', { class: 'sous-titre' }, sousTitre));
}
const nomCommune = (id: string): string => etat.region?.communes.find(c => c.id === id)?.nom ?? (id === 'region' ? 'la région' : id);

async function panneauCarte(): Promise<Noeuds> {
  const region = etat.region!, ch = etat.chrono!;
  const r = mesuresDuJour(ch, 'region', etat.jour);
  const faits = (await Promise.all(['region', ...region.communes.map(c => c.id)].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`))))
    .flatMap(x => x.evenements).filter(e => e.jour <= etat.jour).sort((a, b) => (a.id < b.id ? 1 : -1));
  const besoin = r.population * 1.2;
  const depot = statutDepot(r);
  return [
    entete(region.monde.nom, `${nombre(region.monde.population)} habitants · ${region.communes.length} communes sur un même bassin versant`),
    el('div', { class: 'chiffres' },
      el('div', {}, el('small', {}, 'Rivière'), el('strong', {}, `${nombre(r.debit_m3)} m³/j`)),
      el('div', {}, el('small', {}, 'Réserve amont'), el('strong', {}, `${nombre(r.reserve_m3)} m³`)),
      el('div', {}, el('small', {}, 'Entrepôt'), el('strong', {}, `${kg(r.depot_kg)} · ${nombre(r.depot_kg / besoin)} j`)),
      el('div', {}, el('small', {}, 'Réserve de secours'), el('strong', {}, kg(r.secours_kg)))),
    el('p', {}, lien(`${depot.picto} Entrepôt du Bourg : ${depot.libelle.toLowerCase()}`, 'bien/depot', `badge ${depot.niveau}`),
      r.depot_demande_kg - r.depot_servi_kg > 1 ? ` ${kg(r.depot_servi_kg)} servis sur ${kg(r.depot_demande_kg)} demandés ce jour.` : ''),
    el('h3', {}, 'Communes'),
    el('ul', { class: 'communes' }, ...region.communes.map(co => {
      const s = statutsCommune(mesuresDuJour(ch, co.id, etat.jour));
      return el('li', {}, lien(co.nom, `commune/${co.id}`), el('span', { class: 'role' }, co.role), el('span', { class: 'badges' }, ...s.map(badge)));
    })),
    el('h3', {}, 'Chronique de la région'),
    listeFaits(faits, 'Rien de notable pour l’instant.', 30),
  ];
}

async function panneauCommune(id: string): Promise<Noeuds> {
  const region = etat.region!, ch = etat.chrono!;
  const co = region.communes.find(c => c.id === id);
  if (!co) return [entete('Commune inconnue', '', ['Carte', 'carte'])];
  const m = mesuresDuJour(ch, id, etat.jour);
  const [faits, gens] = await Promise.all([
    vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${id}/evenements`),
    vue<{ total: number; humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${id}&limite=60`)]);
  const biens = region.biens.filter(b => b.commune === id);
  const autres = region.communes.filter(c => c.id !== id);
  return [
    entete(co.nom, co.role, ['Carte de la région', 'carte']),
    el('div', { class: 'badges' }, ...statutsCommune(m).map(badge)),
    el('div', { class: 'chiffres' },
      el('div', {}, el('small', {}, 'Habitants'), el('strong', {}, nombre(co.population))),
      el('div', {}, el('small', {}, 'Grenier'), el('strong', {}, kg(m.stock_kg))),
      el('div', {}, el('small', {}, 'Eau des foyers'), el('strong', {}, pct(m.eau_domestique_couverture))),
      el('div', {}, el('small', {}, 'Temps libre moyen'), el('strong', {}, `${nombre(m.temps_libre_moyen_h, 1)} h/j`))),
    biens.length ? el('p', { class: 'liens' }, 'Biens : ', ...biens.map(b => lien(b.nom, `bien/${b.id}`, 'badge'))) : null,
    el('nav', { class: 'liens', 'aria-label': 'Autres communes' }, 'Aller à : ', ...autres.map(c => lien(c.nom, `commune/${c.id}`, 'badge'))),
    el('h3', {}, `Faits de la commune`),
    listeFaits(faits.evenements.filter(e => e.jour <= etat.jour).reverse(), 'Rien de notable pour l’instant.', 20),
    el('h3', {}, `Habitants présents (${Math.min(gens.humains.length, gens.total)} sur ${nombre(gens.total)})`),
    el('div', { class: 'humains' }, ...gens.humains.slice(0, 24).map(carteHumain)),
  ];
}

async function panneauHumain(id: number): Promise<Noeuds> {
  const f = await vue<Fiche>(`/api/mondes/{m}/humains/${id}`);
  const [lieu, bourg, region] = await Promise.all([f.commune, 'bourg', 'region'].map(l => vue<{ evenements: Evenement[] }>(`/api/mondes/{m}/lieux/${l}/evenements`)));
  const cleVisite = `re:vu:${etat.monde}:${id}`;
  const depuis = memoire(cleVisite);
  const journal = fusionnerJournal(f.journal, lieu.evenements, f.commune === 'bourg' ? region.evenements : [...bourg.evenements, ...region.evenements], etat.jour, depuis === null ? null : Number(depuis));
  const nouveaux = journal.filter(l => l.nouveau);
  if (!etat.lecture) memoire(cleVisite, String(Math.max(etat.jour, Number(depuis ?? 0))));
  const mien = etat.monHumain === id;
  const parts = Object.entries(f.journee).filter(([, v]) => v > 0);
  const libelles: Record<string, string> = { essentiel: 'Sommeil, repas', travail: 'Travail', etude: 'École', soins_au_foyer: 'Soins au foyer', soins_recus: 'Soins reçus', ravitaillement: 'Ravitaillement', libre: 'Temps libre' };
  const suivre = el('button', { class: 'action', click: () => { etat.monHumain = mien ? null : id; memoire('re:humain', mien ? null : String(id)); void afficher(); majBarre(); } }, mien ? 'Ne plus suivre' : 'Suivre cet humain');
  return [
    entete(`${f.prenom} ${f.nom}`, `${f.age} ans · ${f.etape} · ${nomCommune(f.commune)}`, [nomCommune(f.commune), `commune/${f.commune}`]),
    el('div', { class: 'identite' }, portrait(f, 4),
      el('dl', {},
        el('dt', {}, 'Activité'), el('dd', {}, f.age >= 16 && f.metier ? f.metier_nom : f.etape),
        el('dt', {}, 'Foyer'), el('dd', {}, `${f.foyer_detail.nom} · ${f.foyer_detail.type} · ${matricule('F', f.foyer)}`),
        el('dt', {}, 'Humain'), el('dd', {}, `${matricule('H', f.id)}${f.vivant ? '' : ' · décédé'}`)),
      etat.source === 'demo' || mien ? suivre : null),
    el('h3', {}, 'Sa journée'),
    el('div', { class: 'journee', role: 'img', 'aria-label': parts.map(([k, v]) => `${libelles[k]} ${nombre(v, 1)} h`).join(', ') },
      ...parts.map(([k, v]) => { const d = el('span', { class: `part ${k}`, title: `${libelles[k]} : ${nombre(v, 1)} h` }, v >= 2.4 ? `${libelles[k]} ${nombre(v, 1)} h` : ''); d.style.flexGrow = String(v); return d; })),
    f.foyer_detail.trajets ? el('p', {}, `Trajets de secours du foyer : ${f.foyer_detail.trajets} (${nombre(f.foyer_detail.heures_trajet, 1)} h).`) : null,
    nouveaux.length ? el('h3', {}, `Depuis votre dernière visite (jour ${depuis})`) : null,
    nouveaux.length ? listeFaits(nouveaux, '') : null,
    el('h3', {}, 'Journal'),
    listeFaits(nouveaux.length ? journal.filter(l => !l.nouveau) : journal, 'Le journal commence avec le premier fait marquant.'),
    el('h3', {}, 'Son foyer'),
    el('div', { class: 'humains' }, ...f.foyer_detail.membres.filter(m => m.id !== f.id).map(carteHumain), f.foyer_detail.membres.length < 2 ? el('p', { class: 'vide' }, 'Vit seul.') : null),
    f.liens.length ? el('h3', {}, 'Ses liens') : null,
    f.liens.length ? el('div', { class: 'humains' }, ...f.liens.map(carteHumain)) : null,
  ];
}

async function panneauBien(id: string): Promise<Noeuds> {
  const b = await vue<FicheBien>(`/api/mondes/{m}/biens/${id}`);
  const r = mesuresDuJour(etat.chrono!, 'region', etat.jour);
  const droitsActifs = b.droits.filter(d => d.debut <= etat.jour && (d.annule_jour === null || d.annule_jour > etat.jour));
  const reservee = id === 'depot' ? r.part_reservee ?? 0 : 0;
  const n: Node[] = [
    entete(b.bien.nom, b.bien.description, [b.commune_nom, `commune/${b.bien.commune}`]),
    el('div', { class: 'badges' }, badge(id === 'depot' ? statutDepot(r) : { cle: 'acces', niveau: 'ok', picto: '▢', libelle: 'Accès commun' })),
  ];
  const chiffres = el('div', { class: 'chiffres' });
  if (id === 'depot') chiffres.append(el('div', {}, el('small', {}, 'Stock'), el('strong', {}, kg(r.depot_kg))), el('div', {}, el('small', {}, 'Demandé ce jour'), el('strong', {}, kg(r.depot_demande_kg))), el('div', {}, el('small', {}, 'Servi ce jour'), el('strong', {}, kg(r.depot_servi_kg))));
  if (id === 'secours') chiffres.append(el('div', {}, el('small', {}, 'Stock'), el('strong', {}, kg(r.secours_kg))));
  if (id === 'reserve_eau') chiffres.append(el('div', {}, el('small', {}, 'Volume'), el('strong', {}, `${nombre(r.reserve_m3)} m³`)), el('div', {}, el('small', {}, 'Capacité'), el('strong', {}, `${nombre(b.bien.capacite_m3 ?? 0)} m³`)));
  if (b.passage) chiffres.append(el('div', {}, el('small', {}, 'Capacité de passage'), el('strong', {}, `${kg(b.passage.capacite_kg_jour)}/j`)), el('div', {}, el('small', {}, 'En accès commun'), el('strong', {}, `${kg(b.passage.capacite_kg_jour * (1 - reservee))}/j`)));
  if (chiffres.childElementCount) n.push(chiffres);
  n.push(el('h3', {}, 'Conditions d’accès'));
  n.push(droitsActifs.length
    ? el('ul', { class: 'droits' }, ...droitsActifs.map(d => el('li', {}, el('strong', {}, `${pct(d.part)} de la capacité`), ` — titulaire : ${d.compte}. `, d.acces === 'reserve' ? `Part réservée (${d.usage ?? 'usage du titulaire'}).` : 'Part laissée en accès commun.', ` Depuis le jour ${d.debut}${d.fin ? `, jusqu’au jour ${d.fin}` : ''}.`)))
    : el('p', {}, 'Bien commun : les mêmes règles s’appliquent à tous les usagers. Propriété et accès sont enregistrés séparément.'));
  n.push(el('h3', {}, 'Changements datés'), listeFaits(b.changements.filter(e => e.jour <= etat.jour).reverse(), 'Aucun changement d’accès à ce jour.', 15));
  if (b.offre) {
    const o = b.offre.effet_si_reserve;
    n.push(el('h3', {}, 'Droit proposé à l’achat (phase 2)'), el('div', { class: 'offre' },
      el('p', {}, b.offre.droit),
      b.offre.disponible ? el('p', {}, `Si ${pct(b.offre.part_proposee)} de plus étaient réservés : ${kg(o.commun_kg_jour)} par jour resteraient en accès commun. Sur les 30 derniers jours, ${kg(o.servi_moyen_kg_jour)} sortent chaque jour ; ${kg(o.a_couvrir_ailleurs_kg_jour)} par jour devraient être couverts ailleurs, reportés ou non servis.`) : el('p', {}, 'Toute la capacité est déjà engagée.'),
      el('p', { class: 'vide' }, b.offre.note)));
  }
  return n;
}

async function panneauFait(id: string): Promise<Noeuds> {
  const d = await vue<DetailEvenement>(`/api/mondes/{m}/evenements/${id}`);
  const e = d.evenement;
  const chaine = (ev: Evenement, vus: Set<string>): HTMLElement => {
    const li = el('li', {}, el('a', { href: `#/fait/${ev.id}` }, el('span', { class: 'quand' }, `${ev.date} · ${ev.lieu_nom}`), el('strong', {}, ev.titre), el('span', { class: 'texte' }, ev.texte)));
    const causes = ev.causes.map(c => d.causes[c]).filter(c => c && !vus.has(c.id));
    if (causes.length) { causes.forEach(c => vus.add(c.id)); li.append(el('ul', {}, ...causes.map(c => chaine(c, vus)))); }
    return li;
  };
  const causes = e.causes.map(c => d.causes[c]).filter(Boolean);
  const vus = new Set(causes.map(c => c.id));
  return [
    entete(e.titre, `${e.date} · jour ${e.jour} · ${e.lieu_nom}`, e.humain !== null ? ['Fiche', `humain/${e.humain}`] : e.lieu === 'region' ? ['Carte', 'carte'] : [e.lieu_nom, `commune/${e.lieu}`]),
    el('p', { class: 'recit' }, e.texte),
    el('p', { class: 'liens' }, el('button', { class: 'action', click: () => allerAuJour(e.jour) }, `Voir le monde ce jour-là`),
      e.type.startsWith('droit.') || e.type.startsWith('depot.') ? lien('Fiche de l’entrepôt', 'bien/depot', 'badge') : null),
    el('h3', {}, 'Pourquoi'),
    causes.length ? el('ul', { class: 'causes' }, ...causes.map(c => chaine(c, vus))) : el('p', { class: 'vide' }, 'Événement daté : il ne découle d’aucun autre fait de la simulation.'),
    el('h3', {}, 'Ce que cela a entraîné'),
    listeFaits(d.consequences, 'Aucune suite enregistrée.', 20),
  ];
}

async function panneauObservation(): Promise<Noeuds> {
  const ids = etat.mondes.filter(m => m.cas).map(m => m.id);
  const [obs, comp] = await Promise.all([
    vue<Observation>('/api/mondes/{m}/observation'),
    ids.length > 1 ? lire<Comparaison>(`/api/comparaison?mondes=${ids.join(',')}`).catch(() => null) : Promise.resolve(null)]);
  const ch = etat.chrono!, region = etat.region!;
  const n: Node[] = [entete('Tableau d’observation', 'Ce que les mêmes ressources offrent selon les règles d’accès.', ['Carte', 'carte'])];
  const courbe = (titre: string, cle: string, unite: string): HTMLElement => {
    const c = el('canvas', { width: 340, height: 120, class: 'courbe', role: 'img', 'aria-label': `${titre}, par commune, sur ${ch.jours} jours` });
    tracerCourbes(c, region.communes.map(co => ({ nom: co.nom, valeurs: ch.communes[co.id][cle] })), etat.jour, unite);
    return el('figure', {}, el('figcaption', {}, titre), c);
  };
  n.push(courbe('Jours de réserve des greniers', 'jours_reserve', 'j'), courbe('Entretien en retard', 'arriere_h', 'h'));
  if (comp) {
    n.push(el('h3', {}, 'Trois trajectoires de la même année'));
    for (const e of comp.ecarts) {
      n.push(el('p', {}, el('strong', {}, `${e.monde} par rapport à ${e.reference} : `), e.identique ? 'mêmes conditions d’usage, mêmes résultats.' : `${e.mesures.length} mesures diffèrent.`));
    }
    const lignes: HTMLElement[] = [];
    for (const [cle, nom] of Object.entries(NOMS_MESURES)) {
      for (const co of region.communes) {
        const valeurs = comp.mondes.map(m => m.communes[co.id][cle] ?? 0);
        if (valeurs.every(v => Math.abs(v - valeurs[0]) < 1e-6)) continue;
        lignes.push(el('tr', {}, el('th', { scope: 'row' }, `${nom} — ${co.nom}`), ...valeurs.map(v => el('td', {}, nombre(v, v < 20 ? 2 : 0)))));
      }
    }
    lignes.push(el('tr', {}, el('th', { scope: 'row' }, 'Jours où la capacité commune de l’entrepôt ne suffit pas'), ...comp.mondes.map(m => el('td', {}, nombre(m.region.jours_limites_par_droits)))));
    lignes.push(el('tr', {}, el('th', { scope: 'row' }, 'Part de la capacité dépendant d’un même compte'), ...comp.mondes.map(m => el('td', {}, pct(m.region.concentration_max)))));
    n.push(el('div', { class: 'defile' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Mesure qui diffère'), ...comp.mondes.map(m => el('th', { scope: 'col' }, m.monde)))), el('tbody', {}, ...lignes))));
    const c = comp.ecarts.find(e => !e.identique);
    if (c) n.push(el('h3', {}, `Faits propres à ${c.monde}, reliés à leurs causes`), listeFaits(c.evenements_nouveaux, '', 20));
  }
  n.push(el('h3', {}, 'Par commune et par type de foyer'));
  n.push(el('div', { class: 'defile' }, el('table', {},
    el('thead', {}, el('tr', {}, ...['Commune', 'Foyer', 'Foyers', 'Temps libre (h/j)', 'Besoins couverts', 'Trajets (h)'].map(x => el('th', { scope: 'col' }, x)))),
    el('tbody', {}, ...obs.repartition.map(g => el('tr', {}, el('th', { scope: 'row' }, nomCommune(g.commune)), el('td', {}, g.type), el('td', {}, nombre(g.foyers)), el('td', {}, nombre(g.temps_libre_h, 1)), el('td', {}, pct(g.couverture_besoins)), el('td', {}, nombre(g.heures_trajet))))))));
  n.push(el('h3', {}, 'Foyers les plus touchés'), el('p', { class: 'vide' }, 'Les trajectoires les plus touchées restent visibles à côté des moyennes.'));
  n.push(el('ul', { class: 'faits' }, ...obs.plus_touches.map(f => el('li', { class: 'fait' }, el('a', { href: `#/humain/${f.humain}` },
    el('strong', {}, `Foyer ${f.nom} · ${nomCommune(f.commune)}`), el('span', { class: 'texte' }, `${f.type}, ${f.personnes} pers. · temps libre ${nombre(f.temps_libre_h, 1)} h/j · besoins couverts ${pct(f.couverture_besoins)} · trajets ${nombre(f.heures_trajet, 1)} h`))))));
  return n;
}

async function panneauMoi(): Promise<Noeuds> {
  const n: Node[] = [entete('Retrouver mon humain', 'Le journal personnel se consulte dans l’espace du participant.', ['Carte', 'carte'])];
  if (etat.source === 'demo') {
    const gens = await vue<{ humains: FicheCourte[] }>('/api/mondes/{m}/humains?limite=200');
    n.push(el('p', {}, 'Démonstration sans serveur : choisissez l’humain à suivre. Avec le serveur, un code d’accès reçu à l’inscription ouvre le journal rattaché au compte.'),
      el('div', { class: 'humains' }, ...gens.humains.slice(0, 40).map(carteHumain)));
    return n;
  }
  const champ = el('input', { type: 'text', id: 'code', autocomplete: 'off', placeholder: 'Code d’accès' });
  const message = el('p', { class: 'vide', role: 'status' });
  const ouvrirEspace = async (): Promise<void> => {
    try {
      const moi = await lire<{ monde: string; humain: number | null; derniere_visite_jour: number | null }>('/api/moi', champ.value.trim());
      etat.jeton = memoire('re:jeton', champ.value.trim());
      if (moi.humain === null) { message.textContent = 'Votre humain naîtra à la prochaine journée simulée.'; return; }
      etat.monHumain = moi.humain; memoire('re:humain', String(moi.humain));
      if (moi.derniere_visite_jour !== null) memoire(`re:vu:${moi.monde}:${moi.humain}`, String(moi.derniere_visite_jour));
      if (moi.monde !== etat.monde) await changerMonde(moi.monde);
      majBarre(); location.hash = `#/humain/${moi.humain}`;
    } catch (e) { message.textContent = (e as Error).message; }
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
    noeuds = nom === 'commune' ? await panneauCommune(arg) : nom === 'humain' ? await panneauHumain(Number(arg)) : nom === 'bien' ? await panneauBien(arg)
      : nom === 'fait' ? await panneauFait(arg) : nom === 'observation' ? await panneauObservation() : nom === 'moi' ? await panneauMoi() : await panneauCarte();
  } catch (e) {
    noeuds = [entete('Vue indisponible', (e as Error).message, ['Carte', 'carte'])];
  }
  if (monTour !== tour) return;
  const defilement = contenu.dataset.route === etat.route.join('/') ? contenu.scrollTop : 0;
  contenu.replaceChildren(...noeuds.filter((x): x is Node => x !== null));
  contenu.dataset.route = etat.route.join('/');
  contenu.scrollTop = defilement;
}

// ---- Navigation --------------------------------------------------------------------------
function majBarre(): void {
  const mien = document.querySelector<HTMLAnchorElement>('#mien')!;
  mien.href = etat.monHumain !== null ? `#/humain/${etat.monHumain}` : '#/moi';
  mien.textContent = etat.monHumain !== null ? 'Mon humain' : 'Retrouver mon humain';
  document.querySelectorAll<HTMLAnchorElement>('nav.onglets a').forEach(a => a.toggleAttribute('aria-current', a.hash === `#/${etat.route[0]}` || (a.id === 'mien' && ['humain', 'moi'].includes(etat.route[0]))));
}
async function naviguer(): Promise<void> {
  const route = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  etat.route = route.length ? route : ['carte'];
  let commune: string | null = null;
  if (etat.route[0] === 'commune') commune = etat.route[1];
  else if (etat.route[0] === 'humain') commune = (await vue<Fiche>(`/api/mondes/{m}/humains/${etat.route[1]}`).catch(() => null))?.commune ?? null;
  else if (etat.route[0] === 'bien') commune = etat.region?.biens.find(b => b.id === etat.route[1])?.commune ?? null;
  if (commune && !etat.region?.communes.some(c => c.id === commune)) commune = null;
  if (commune !== etat.communeVue) {
    etat.communeVue = commune;
    etat.habitants = [];
    if (commune) {
      const gens = await vue<{ humains: FicheCourte[] }>(`/api/mondes/{m}/humains?commune=${commune}&limite=60`);
      etat.habitants = gens.humains.slice(0, config.humains_visibles.value);
    }
  }
  if (etat.communeVue && etat.route[0] === 'humain') {
    const hid = Number(etat.route[1]);
    if (!etat.habitants.some(h => h.id === hid)) {
      const f = await vue<Fiche>(`/api/mondes/{m}/humains/${hid}`).catch(() => null);
      if (f) etat.habitants = [...etat.habitants.slice(0, config.humains_visibles.value - 1), f];
    }
  }
  titreScene.textContent = etat.communeVue ? `${nomCommune(etat.communeVue)} — vue de la commune` : 'Carte de la région';
  canvas.setAttribute('aria-label', etat.communeVue ? `Vue du dessus de ${nomCommune(etat.communeVue)} : champs, logements, grenier, pompe et habitants` : 'Carte de la région : rivière, routes et cinq communes');
  majBarre(); placerEtiquettes(); dessiner();
  await afficher();
}
async function changerMonde(id: string): Promise<void> {
  etat.monde = id; selectMonde.value = id; memoire('re:monde', id);
  const [region, chrono] = await Promise.all([vue<Region>('/api/mondes/{m}/region'), vue<Chronologie>('/api/mondes/{m}/chronologie')]);
  etat.region = region; etat.chrono = chrono;
  curseur.max = String(region.monde.jour); curseur.min = '1';
  const voulu = Number(params.get('jour')) || etat.jour;
  allerAuJour(etat.jour === 1 && !params.get('jour') ? region.monde.jour : voulu);
}
selectMonde.addEventListener('change', () => { void changerMonde(selectMonde.value).then(naviguer); });
addEventListener('hashchange', () => void naviguer());

// ---- Démarrage ------------------------------------------------------------------------------
async function demarrer(): Promise<void> {
  etat.source = await ouvrir();
  document.body.dataset.source = etat.source;
  etat.mondes = (await lire<{ mondes: Monde[] }>('/api/mondes')).mondes.filter(m => m.jour > 0);
  if (!etat.mondes.length) {
    contenu.replaceChildren(entete('Aucun monde simulé', 'Lancez « python -m ressources_egales comparer » puis rechargez la page.'));
    return;
  }
  selectMonde.replaceChildren(...etat.mondes.map(m => el('option', { value: m.id }, m.nom)));
  const souvenu = memoire('re:humain');
  etat.monHumain = souvenu === null ? null : Number(souvenu);
  const voulu = params.get('monde') ?? memoire('re:monde') ?? '';
  const depart = etat.mondes.find(m => m.id === voulu) ?? etat.mondes.find(m => m.cas === 'C') ?? etat.mondes[0];
  if (params.get('scene') && !location.hash) history.replaceState(null, '', `#/${params.get('scene')}`);
  await changerMonde(depart.id);
  ajuster();
  await naviguer();
  install({
    get scene() { return etat.route[0]; },
    get state() { return { monde: etat.monde, jour: etat.jour, route: etat.route.join('/'), source: etat.source, commune: etat.communeVue, habitants: silhouettes.length, lecture: etat.lecture, temps: t }; },
    press(code: string) { appuyer(code); },
    hold(code: string, on: boolean) { if (on) touches.add(code); else touches.delete(code); },
    step(n = 1, draw = true) { for (let i = 0; i < n; i++) avancer(1 / 60); if (draw) dessiner(); },
  });
  if (!manual) { boucleActive = true; dernier = clock.now(); requestAnimationFrame(image); } else dessiner();
}
void demarrer();
