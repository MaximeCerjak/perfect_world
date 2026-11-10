// Règles de lecture du monde côté site : statuts des lieux, journal, emploi du
// temps affiché. TypeScript pur, sans navigateur : Vitest les exécute dans Node.
// Le calcul du monde lui-même est fait par le moteur Python.

import type { Chronologie, Evenement, FicheCourte } from '../types';

export type Niveau = 'ok' | 'alerte' | 'critique';
export interface Statut { cle: string; niveau: Niveau; picto: string; libelle: string }
export interface MesuresJour { [cle: string]: number }

/** Tirage stable dans [0, 1[ à partir de deux entiers : sert à placer le décor. */
export function alea(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mesures d'une commune (ou de la région) pour un jour donné, numéroté à partir de 1. */
export function mesuresDuJour(chrono: Chronologie, lieu: string, jour: number): MesuresJour {
  const series = lieu === 'region' ? chrono.region : chrono.communes[lieu];
  const i = Math.max(0, Math.min(chrono.jours, jour) - 1);
  const m: MesuresJour = {};
  for (const [cle, serie] of Object.entries(series ?? {})) m[cle] = serie[i] ?? 0;
  return m;
}

/** Statuts lisibles d'une commune : chaque statut a un pictogramme et un libellé, pas seulement une couleur. */
export function statutsCommune(m: MesuresJour): Statut[] {
  const s: Statut[] = [];
  const jours = m.jours_reserve ?? 0;
  if ((m.ration ?? 1) < 0.999) s.push({ cle: 'ration', niveau: 'critique', picto: '◐', libelle: `Rations à ${Math.round(m.ration * 100)} %` });
  s.push({
    cle: 'reserve', niveau: jours < 3 ? 'critique' : jours < 6 ? 'alerte' : 'ok', picto: '▤',
    libelle: `${jours < 10 ? jours.toFixed(1).replace('.', ',') : Math.round(jours)} j de réserve`,
  });
  if ((m.non_servi_depot_kg ?? 0) > 1 && (m.demande_depot_kg ?? 0) > 0) {
    s.push({ cle: 'livraison', niveau: 'alerte', picto: '⇥', libelle: `Livraison partielle (${Math.round((m.servi_depot_kg / m.demande_depot_kg) * 100)} %)` });
  }
  if ((m.secours_kg ?? 0) > 1) s.push({ cle: 'secours', niveau: 'alerte', picto: '✚', libelle: `Secours : ${Math.round(m.secours_kg)} kg` });
  if ((m.irrigation_satisfaction ?? 1) < 0.8) s.push({ cle: 'irrigation', niveau: m.irrigation_satisfaction < 0.4 ? 'critique' : 'alerte', picto: '≋', libelle: `Irrigation à ${Math.round(m.irrigation_satisfaction * 100)} %` });
  if ((m.pompe_etat ?? 1) < 0.35) s.push({ cle: 'pompe', niveau: 'critique', picto: '⚙', libelle: 'Pompe à l’arrêt' });
  else if ((m.pompe_etat ?? 1) < 0.85) s.push({ cle: 'pompe', niveau: 'alerte', picto: '⚙', libelle: `Pompe à ${Math.round(m.pompe_etat * 100)} %` });
  if ((m.entretien_reporte_h ?? 0) > 0.05) s.push({ cle: 'entretien', niveau: 'alerte', picto: '⚒', libelle: `Entretien reporté : ${m.entretien_reporte_h.toFixed(1).replace('.', ',')} h` });
  return s;
}

/** Niveau le plus grave d'une liste de statuts. */
export function niveauGlobal(statuts: Statut[]): Niveau {
  return statuts.some(s => s.niveau === 'critique') ? 'critique' : statuts.some(s => s.niveau === 'alerte') ? 'alerte' : 'ok';
}

/** Statut de l'entrepôt pour un jour donné. */
export function statutDepot(r: MesuresJour): Statut {
  if ((r.part_reservee ?? 0) > 0) {
    return { cle: 'acces', niveau: 'alerte', picto: '▥', libelle: `Accès réservé à ${Math.round(r.part_reservee * 100)} %` };
  }
  return { cle: 'acces', niveau: 'ok', picto: '▢', libelle: 'Accès commun' };
}

export interface LigneJournal extends Evenement { nouveau: boolean; portee: 'personnel' | 'commune' | 'region' }

/**
 * Journal d'un humain : ses faits personnels, ceux de sa commune et ceux qui
 * touchent toute la région, jusqu'au jour affiché, les plus récents d'abord.
 * `depuis` est le jour de la dernière visite : les faits postérieurs sont marqués nouveaux.
 */
export function fusionnerJournal(
  personnel: Evenement[], commune: Evenement[], ailleurs: Evenement[], jourVu: number, depuis: number | null,
): LigneJournal[] {
  const vus = new Set<string>();
  const lignes: LigneJournal[] = [];
  const ajouter = (liste: Evenement[], portee: LigneJournal['portee'], garder: (e: Evenement) => boolean): void => {
    for (const e of liste) {
      if (e.jour > jourVu || vus.has(e.id) || !garder(e)) continue;
      vus.add(e.id);
      lignes.push({ ...e, portee, nouveau: depuis !== null && e.jour > depuis });
    }
  };
  ajouter(personnel, 'personnel', () => true);
  ajouter(commune, 'commune', e => e.journal === true);
  ajouter(ailleurs, 'region', e => e.partout === true);
  return lignes.sort((a, b) => b.jour - a.jour || (a.id < b.id ? 1 : -1));
}

export type Lieu = 'logement' | 'champ' | 'pompe' | 'services';
export interface Position { lieu: Lieu; trajet: number; dehors: boolean }

/** Lieu de travail ou d'étude d'un habitant, d'après son âge et son activité. */
export function lieuDeJour(h: Pick<FicheCourte, 'age' | 'metier'>): Lieu {
  if (h.age < 6) return 'logement';
  if (h.age < 16) return 'services';
  if (h.age >= 75 || h.metier === 0) return 'logement';
  return h.metier === 1 ? 'champ' : h.metier === 2 ? 'pompe' : 'services';
}

/**
 * Où se trouve un habitant à une heure donnée : `trajet` vaut 0 au logement, 1 sur
 * son lieu de jour. Le départ est décalé d'une personne à l'autre par `decalage` (0 à 1).
 */
export function positionA(heure: number, h: Pick<FicheCourte, 'age' | 'metier'>, decalage: number): Position {
  const lieu = lieuDeJour(h);
  const depart = 6.5 + decalage * 1.5, retour = (h.age < 16 ? 16 : h.age >= 65 ? 12.5 : 17) + decalage;
  const duree = 1.2;
  let trajet = 0;
  if (lieu !== 'logement') {
    if (heure >= depart && heure < depart + duree) trajet = (heure - depart) / duree;
    else if (heure >= depart + duree && heure < retour) trajet = 1;
    else if (heure >= retour && heure < retour + duree) trajet = 1 - (heure - retour) / duree;
  }
  return { lieu, trajet, dehors: heure >= 6 && heure < 21.5 };
}

/** Quantité de denrées lisible : kilogrammes, puis tonnes. */
export function kg(x: number): string {
  return x >= 1000 ? `${(x / 1000).toFixed(1).replace('.', ',')} t` : `${Math.round(x)} kg`;
}

/** Identifiant affiché d'un humain ou d'un foyer : distinct de celui du participant. */
export function matricule(prefixe: 'H' | 'F', id: number): string {
  return `${prefixe}-${String(id).padStart(5, '0')}`;
}
