// Génère le jeu de démonstration (data/demo/demo.json) s'il manque : trois
// trajectoires A, B et C d'une région de 600 habitants, simulées par le moteur
// Python. Le site l'embarque pour fonctionner sans serveur.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('data/demo/demo.json')) {
  const env = { ...process.env, PYTHONPATH: 'server' };
  for (const args of [['comparer', '--population', '600'], ['exporter', 'A', 'B', 'C']]) {
    const r = spawnSync('python3', ['-m', 'ressources_egales', '--db', 'data/demo/demo.db', ...args], { env, stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) {
      console.error('Jeu de démonstration non généré : Python 3.11+ est requis (voir README-JEU.md).');
      process.exit(1);
    }
  }
  console.log('Jeu de démonstration généré : data/demo/demo.json');
}
