// Formes des réponses de l'API (server/ressources_egales/service.py).

export interface Monde { id: string; nom: string; cas: string | null; jour: number; jours_max: number; population: number; description?: string }
export interface CommuneInfo { id: string; nom: string; role: string; carte: [number, number]; population: number; foyers: number }
export interface Droit { id: string; cle: string; compte: string; bien: string; part: number; acces: string; usage: string | null; debut: number; fin: number | null; annule_jour: number | null }
export interface Region {
  monde: Monde & { date: string; participants: number; mode_inscription: string };
  communes: CommuneInfo[];
  ordre_eau: string[];
  routes: { id: string; nom: string; de: string; vers: string; duree_h: number; capacite_kg_jour: number }[];
  biens: { id: string; nom: string; type: string; commune: string }[];
  champs: { id: string; nom: string; commune: string; culture: string; surface_ha: number }[];
  droits: Droit[];
}
export type Serie = number[];
export interface Chronologie {
  jours: number;
  communes: Record<string, Record<string, Serie>>;
  region: Record<string, Serie>;
  champs: Record<string, { phase: Serie; avancement: Serie; eau: Serie }>;
  saisons: string[];
  dates: string[];
}
export interface Evenement {
  id: string; jour: number; date: string; lieu: string; lieu_nom: string; type: string;
  foyer: number | null; humain: number | null; humain2: number | null;
  mesure: Record<string, unknown>; causes: string[]; titre: string; texte: string;
  journal?: boolean; partout?: boolean; nombre?: number; jour_fin?: number; occurrences?: number;
}
export interface FicheCourte {
  id: number; prenom: string; nom: string; age: number; etape: string; metier: number; metier_nom: string;
  foyer: number; ilot: number; commune: string; vivant: boolean; suivi: boolean;
}
export interface Fiche extends FicheCourte {
  journee: Record<string, number>;
  foyer_detail: { id: number; nom: string; type: string; membres: FicheCourte[]; trajets: number; heures_trajet: number; non_couvert_kg: number; garde_manger_kg: number };
  liens: FicheCourte[];
  journal: Evenement[];
}
export interface FicheBien {
  bien: { id: string; nom: string; type: string; commune: string; description: string; capacite_stockage_kg?: number; capacite_m3?: number };
  commune_nom: string; droits: Droit[]; part_reservee: number; comptes: Record<string, number>; acces: string;
  changements: Evenement[]; stock_kg?: number; volume_m3?: number;
  passage?: { capacite_kg_jour: number; commun_kg_jour: number };
  usage?: { servi_moyen_kg_jour: number; demande_moyenne_kg_jour: number };
  offre?: { disponible: boolean; part_proposee: number; droit: string; note: string; effet_si_reserve: { commun_kg_jour: number; servi_moyen_kg_jour: number; a_couvrir_ailleurs_kg_jour: number } };
}
export interface DetailEvenement { evenement: Evenement; causes: Record<string, Evenement>; consequences: Evenement[] }
export interface Observation {
  jour: number;
  repartition: { commune: string; type: string; foyers: number; personnes: number; temps_libre_h: number; couverture_besoins: number; heures_trajet: number; non_couvert_kg: number }[];
  plus_touches: { foyer: number; nom: string; commune: string; type: string; personnes: number; non_couvert_kg: number; heures_trajet: number; temps_libre_h: number; couverture_besoins: number; humain: number }[];
}
export interface Comparaison {
  mondes: { monde: string; nom: string; cas: string; communes: Record<string, Record<string, number>>; region: Record<string, number> }[];
  ecarts: { monde: string; reference: string; identique: boolean; mesures: { commune: string; mesure: string; reference: number; valeur: number }[]; evenements_nouveaux: Evenement[] }[];
}
