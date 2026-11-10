import { describe, expect, it } from 'vitest';
import { alea, fusionnerJournal, kg, lieuDeJour, matricule, mesuresDuJour, niveauGlobal, positionA, statutDepot, statutsCommune } from '../../src/game/rules';
import type { Chronologie, Evenement } from '../../src/types';

const evenement = (id: string, jour: number, plus: Partial<Evenement> = {}): Evenement => ({
  id, jour, date: '', lieu: 'plaine', lieu_nom: 'La Plaine', type: 'x', foyer: null, humain: null, humain2: null,
  mesure: {}, causes: [], titre: id, texte: '', ...plus,
});
const NORMAL = { jours_reserve: 12, ration: 1, pompe_etat: 1, irrigation_satisfaction: 1 };

describe('statuts d’une commune', () => {
  it('une commune sans tension ne montre que sa réserve', () => {
    const s = statutsCommune(NORMAL);
    expect(s.map(x => x.cle)).toEqual(['reserve']);
    expect(niveauGlobal(s)).toBe('ok');
  });
  it('signale la livraison partielle, le secours et l’entretien reporté par un pictogramme et un libellé', () => {
    const s = statutsCommune({ ...NORMAL, jours_reserve: 5.2, non_servi_depot_kg: 80, demande_depot_kg: 400, servi_depot_kg: 320, secours_kg: 75, entretien_reporte_h: 2.5 });
    expect(s.map(x => x.cle)).toEqual(['reserve', 'livraison', 'secours', 'entretien']);
    expect(s.every(x => x.picto.length > 0 && x.libelle.length > 0)).toBe(true);
    expect(s[1].libelle).toContain('80 %');
    expect(niveauGlobal(s)).toBe('alerte');
  });
  it('passe en critique quand les rations baissent ou que la pompe s’arrête', () => {
    expect(niveauGlobal(statutsCommune({ ...NORMAL, ration: 0.7, jours_reserve: 0 }))).toBe('critique');
    expect(statutsCommune({ ...NORMAL, pompe_etat: 0.3 }).find(x => x.cle === 'pompe')?.libelle).toContain('arrêt');
  });
  it('distingue l’accès commun de l’accès réservé à l’entrepôt', () => {
    expect(statutDepot({ part_reservee: 0 }).libelle).toBe('Accès commun');
    expect(statutDepot({ part_reservee: 0.4 }).libelle).toBe('Accès réservé à 40 %');
  });
});

describe('chronologie', () => {
  const chrono = { jours: 3, communes: { plaine: { ration: [1, 0.9, 0.8] } }, region: { debit_m3: [5, 6, 7] }, champs: {}, saisons: [], dates: [] } as unknown as Chronologie;
  it('lit le jour demandé et borne les jours hors période', () => {
    expect(mesuresDuJour(chrono, 'plaine', 2).ration).toBe(0.9);
    expect(mesuresDuJour(chrono, 'plaine', 99).ration).toBe(0.8);
    expect(mesuresDuJour(chrono, 'region', 0).debit_m3).toBe(5);
  });
});

describe('journal', () => {
  const personnel = [evenement('E0010-0001', 10), evenement('E0300-0002', 300)];
  const commune = [evenement('E0295-0001', 295, { journal: true }), evenement('E0100-0001', 100, { journal: false })];
  const region = [evenement('E0150-0001', 150, { partout: true, lieu: 'bourg' }), evenement('E0160-0001', 160, { lieu: 'bourg' })];
  it('mêle faits personnels, faits de la commune et faits de la région, les plus récents d’abord', () => {
    const j = fusionnerJournal(personnel, commune, region, 365, null);
    expect(j.map(e => e.id)).toEqual(['E0300-0002', 'E0295-0001', 'E0150-0001', 'E0010-0001']);
    expect(j.map(e => e.portee)).toEqual(['personnel', 'commune', 'region', 'personnel']);
  });
  it('s’arrête au jour affiché et marque ce qui a changé depuis la dernière visite', () => {
    const j = fusionnerJournal(personnel, commune, region, 296, 200);
    expect(j.map(e => e.id)).toEqual(['E0295-0001', 'E0150-0001', 'E0010-0001']);
    expect(j.map(e => e.nouveau)).toEqual([true, false, false]);
  });
  it('ne répète pas un fait présent dans deux listes', () => {
    expect(fusionnerJournal(personnel, [{ ...personnel[0], journal: true }], [], 365, null)).toHaveLength(2);
  });
});

describe('emploi du temps affiché', () => {
  it('envoie chacun vers son lieu de jour', () => {
    expect(lieuDeJour({ age: 3, metier: 0 })).toBe('logement');
    expect(lieuDeJour({ age: 10, metier: 0 })).toBe('services');
    expect(lieuDeJour({ age: 40, metier: 1 })).toBe('champ');
    expect(lieuDeJour({ age: 40, metier: 2 })).toBe('pompe');
    expect(lieuDeJour({ age: 80, metier: 3 })).toBe('logement');
  });
  it('part le matin, travaille le jour et rentre le soir', () => {
    const h = { age: 40, metier: 1 };
    expect(positionA(3, h, 0)).toEqual({ lieu: 'champ', trajet: 0, dehors: false });
    expect(positionA(7.1, h, 0).trajet).toBeCloseTo(0.5, 5);
    expect(positionA(12, h, 0).trajet).toBe(1);
    expect(positionA(17.6, h, 0).trajet).toBeCloseTo(0.5, 5);
    expect(positionA(20, h, 0).trajet).toBe(0);
  });
});

describe('mises en forme', () => {
  it('écrit les quantités et les identifiants', () => {
    expect(kg(720)).toBe('720 kg');
    expect(kg(57300)).toBe('57,3 t');
    expect(matricule('H', 42)).toBe('H-00042');
  });
  it('tire toujours le même nombre pour les mêmes entrées', () => {
    expect(alea(3, 7)).toBe(alea(3, 7));
    expect(alea(3, 7)).not.toBe(alea(7, 3));
    expect(alea(3, 7)).toBeGreaterThanOrEqual(0);
    expect(alea(3, 7)).toBeLessThan(1);
  });
});
