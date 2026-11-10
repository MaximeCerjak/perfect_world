// Petites courbes du tableau d'observation : une ligne par commune, un trait
// vertical sur le jour affiché, des libellés en clair en plus des couleurs.

export interface SerieNommee { nom: string; valeurs: number[] }
const COULEURS = ['#3f6f8f', '#b5532f', '#5d7a3a', '#8a5a9c', '#b8892b'];
const TIRETS: number[][] = [[], [5, 2], [2, 2], [7, 2, 2, 2], [1, 3]];

/** Trace les séries sur `canvas` ; `jour` est le jour affiché (à partir de 1). */
export function tracerCourbes(canvas: HTMLCanvasElement, series: SerieNommee[], jour: number, unite: string): void {
  const c = canvas.getContext('2d')!;
  const L = canvas.width, H = canvas.height, g = 30, b = 16, h = 26;
  const n = Math.max(2, ...series.map(s => s.valeurs.length));
  const max = Math.max(1, ...series.flatMap(s => s.valeurs)) * 1.05;
  const plafond = Math.min(max, unite === 'j' ? 60 : max);
  c.clearRect(0, 0, L, H);
  c.font = '10px system-ui, sans-serif';
  c.fillStyle = '#6b665c'; c.strokeStyle = '#d8cfbc'; c.lineWidth = 1;
  for (const f of [0, 0.5, 1]) {
    const y = h + (H - h - b) * (1 - f);
    c.beginPath(); c.moveTo(g, y + 0.5); c.lineTo(L - 4, y + 0.5); c.stroke();
    c.fillText(`${Math.round(plafond * f)} ${unite}`, 0, y + 3);
  }
  c.fillText('jour 1', g, H - 3);
  c.fillText(`jour ${n}`, L - 44, H - 3);
  series.forEach((s, i) => {
    c.strokeStyle = COULEURS[i % COULEURS.length]; c.lineWidth = 1.5; c.setLineDash(TIRETS[i % TIRETS.length]);
    c.beginPath();
    s.valeurs.forEach((v, k) => {
      const x = g + ((L - g - 4) * k) / (n - 1), y = h + (H - h - b) * (1 - Math.min(plafond, v) / plafond);
      if (k) c.lineTo(x, y); else c.moveTo(x, y);
    });
    c.stroke();
    const lx = g + (i % 3) * 104, ly = 8 + Math.floor(i / 3) * 11;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 16, ly); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#2b2a26'; c.fillText(s.nom, lx + 20, ly + 3);
  });
  const xj = g + ((L - g - 4) * (jour - 1)) / (n - 1);
  c.strokeStyle = '#2b2a26'; c.lineWidth = 1; c.setLineDash([2, 2]);
  c.beginPath(); c.moveTo(xj + 0.5, h); c.lineTo(xj + 0.5, H - b); c.stroke(); c.setLineDash([]);
}
