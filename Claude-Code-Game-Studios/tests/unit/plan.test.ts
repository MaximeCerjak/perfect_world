import { describe, expect, it } from 'vitest';
import { BATIMENTS, CENTRES, LAC, MONDE_H, MONDE_L, PARCELLES, RIVIERE, STYLES, ancreNom, dansParcelle, lieux, maisonsDe, pointDeJour, rho, trajetLivraison, trajetSecours } from '../../src/monde/plan';

describe('plan du monde', () => {
  it('donne à chaque commune le nombre de maisons de son caractère, toutes dans le monde', () => {
    for (const [commune, style] of Object.entries(STYLES)) expect(maisonsDe(commune)).toHaveLength(style.maisons);
    for (const b of BATIMENTS) {
      expect(b.x).toBeGreaterThan(0); expect(b.x + b.l).toBeLessThan(MONDE_L);
      expect(b.y).toBeGreaterThan(20); expect(b.y).toBeLessThan(MONDE_H);
    }
  });
  it('ne pose aucune maison dans l’eau ni dans une parcelle', () => {
    for (const m of BATIMENTS.filter(b => b.genre === 'maison')) {
      expect(rho(LAC, m.x + m.l, m.y)).toBeGreaterThan(1);
      expect(RIVIERE.some(q => Math.abs(q[0] - m.x - m.l / 2) < m.l / 2 && Math.abs(q[1] - m.y + 3) < 4)).toBe(false);
      for (const p of PARCELLES) { const [a, b] = dansParcelle(p, m.x + m.l / 2, m.y - 3); expect(a >= 0 && a < 1 && b >= 0 && b < 1).toBe(false); }
    }
  });
  it('trie les bâtiments du nord au sud, pour que ceux de devant recouvrent ceux de derrière', () => {
    for (let k = 1; k < BATIMENTS.length; k++) expect(BATIMENTS[k].y).toBeGreaterThanOrEqual(BATIMENTS[k - 1].y);
  });
  it('donne des parcelles aux quatre champs de la simulation', () => {
    expect([...new Set(PARCELLES.map(p => p.champ))].sort()).toEqual(['plaine-arriere-saison', 'plaine-ete', 'rives-jardins', 'terrasses-cereales']);
  });
  it('nomme les communes sous leurs maisons et les biens sur leur bâtiment', () => {
    for (const commune of Object.keys(CENTRES)) {
      const [x, y] = ancreNom(commune);
      expect(Math.hypot(x - CENTRES[commune][0], y - CENTRES[commune][1])).toBeLessThan(90);
    }
    expect(lieux().map(l => l.bien).sort()).toEqual(['atelier', 'depot', 'reserve_eau', 'secours']);
  });
  it('fait partir les livraisons du Bourg et les tournées de secours des Rives', () => {
    expect(trajetLivraison('bourg')).toBeNull();
    for (const commune of ['source', 'terrasses', 'plaine', 'rives']) {
      const t = trajetLivraison(commune)!;
      expect(Math.hypot(t[0][0] - CENTRES.bourg[0], t[0][1] - CENTRES.bourg[1])).toBeLessThan(2);
      expect(Math.hypot(t[t.length - 1][0] - CENTRES[commune][0], t[t.length - 1][1] - CENTRES[commune][1])).toBeLessThan(2);
    }
    for (const commune of ['source', 'terrasses', 'plaine', 'bourg']) {
      const t = trajetSecours(commune);
      expect(Math.hypot(t[0][0] - CENTRES.rives[0], t[0][1] - CENTRES.rives[1])).toBeLessThan(2);
    }
  });
  it('envoie chaque habitant à un point stable de sa commune', () => {
    for (const commune of Object.keys(CENTRES)) for (const lieu of ['logement', 'champ', 'pompe', 'services'] as const) {
      const p = pointDeJour(commune, lieu, 42);
      expect(p).toEqual(pointDeJour(commune, lieu, 42));
      expect(Math.hypot(p[0] - CENTRES[commune][0], p[1] - CENTRES[commune][1])).toBeLessThan(170);
    }
  });
});
