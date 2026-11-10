// Accès aux données : l'API du serveur, ou le jeu de démonstration embarqué.
// Le jeu de démonstration contient les mêmes réponses, figées par
// `python -m ressources_egales exporter` ; il sert au fichier unique ouvert
// depuis le disque et aux démonstrations sans serveur.

import { params } from './hook';

let demo: Record<string, unknown> | null = null;
let mode: 'api' | 'demo' | null = null;

async function chargerDemo(): Promise<Record<string, unknown>> {
  if (!demo) {
    const module = await import('../data/demo/demo.json?raw');
    demo = JSON.parse(module.default) as Record<string, unknown>;
  }
  return demo;
}

/** Choisit la source : la démonstration avec `?demo=1`, depuis le disque ou sans serveur. */
export async function ouvrir(): Promise<'api' | 'demo'> {
  if (mode) return mode;
  if (params.get('demo') !== '1' && location.protocol !== 'file:') {
    try {
      const r = await fetch('/api/mondes');
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (mode = 'api');
    } catch { /* pas de serveur : démonstration */ }
  }
  await chargerDemo();
  return (mode = 'demo');
}

/** Lit une vue. Le chemin est celui de l'API, par exemple `/api/mondes/C/region`. */
export async function lire<T>(chemin: string, jeton?: string): Promise<T> {
  if ((await ouvrir()) === 'demo') {
    const donnees = (await chargerDemo())[chemin];
    if (donnees === undefined) throw new Error(`Absent de la démonstration : ${chemin}`);
    return donnees as T;
  }
  const r = await fetch(chemin, jeton ? { headers: { Authorization: `Bearer ${jeton}` } } : undefined);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erreur?: string }).erreur ?? `Erreur ${r.status}`);
  return (await r.json()) as T;
}
