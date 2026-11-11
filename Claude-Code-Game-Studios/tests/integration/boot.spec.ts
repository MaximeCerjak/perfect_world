// Playwright : le fichier unique ouvert depuis le disque, avec le jeu de
// démonstration embarqué, piloté par le crochet d'état (src/hook.ts).
// npm run smoke ne lance que l'essai @boot.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string, route = ''): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}${route ? `#/${route}` : ''}`;
interface Etat { monde: string; jour: number; route: string; source: string; habitants: number; lecture: boolean; temps: number; zoom: number; camera: [number, number]; tranches: number; panneau: boolean }
const etat = (page: Page): Promise<Etat> => page.evaluate(() => window.game!.state as Etat);

/** Ouvre la page et recueille les erreurs de page et de console. */
async function ouvrir(page: Page, query: string, route = ''): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(build(query, route));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return erreurs;
}

test('démarre en plein écran sur la vallée, sans panneau ni erreur @boot', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1&heure=11');
  expect(await page.evaluate(() => window.game!.scene)).toBe('carte');
  const e = await etat(page);
  expect(e).toMatchObject({ source: 'demo', tranches: 1, panneau: false });
  const taille = await page.locator('#game').boundingBox();
  expect(taille && taille.width >= 1280 && taille.height >= 720).toBe(true);
  await expect(page.locator('#etiquettes a.nom:not(.lieu)')).toHaveCount(5);
  await expect(page.locator('#etiquettes a.nom', { hasText: 'Le Bourg' })).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('un parcours scripté se répète à l’identique', async ({ page }) => {
  async function parcours(): Promise<Etat> {
    await page.goto('about:blank'); // même adresse : sans cela la page ne serait pas rechargée
    await ouvrir(page, 'manual=1&monde=C&jour=100&heure=10', 'commune/plaine');
    await page.evaluate(() => { const g = window.game!; g.step(120); g.press('ArrowRight'); g.press('PageDown'); g.hold('KeyA', true); g.step(60); g.hold('KeyA', false); });
    return etat(page);
  }
  const premier = await parcours();
  expect(premier).toMatchObject({ monde: 'C', jour: 131, route: 'commune/plaine', panneau: true });
  expect(premier.habitants).toBeGreaterThan(0);
  expect(await parcours()).toEqual(premier);
});

test('la caméra se déplace, zoome par pas entiers et ne sort pas du monde', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=C&heure=11');
  const depart = await etat(page);
  await page.evaluate(() => { const g = window.game!; g.hold('KeyA', true); g.step(30); g.hold('KeyA', false); g.press('Equal'); g.step(1); });
  const apres = await etat(page);
  expect(apres.camera[0]).toBeLessThan(depart.camera[0]);
  expect(apres.zoom).toBe(depart.zoom + 1);
  await page.evaluate(() => { const g = window.game!; g.hold('KeyA', true); g.hold('KeyW', true); g.step(2000); });
  const coin = await etat(page);
  expect(coin.camera[0]).toBeGreaterThan(0);
  expect(coin.camera[1]).toBeGreaterThan(0);
  const taille = await page.locator('#game').boundingBox();
  expect(taille && taille.width >= 1280 && taille.height >= 720).toBe(true);
});

test('d’un fait de la commune, on remonte jusqu’au droit acquis sur l’entrepôt', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1&monde=C&heure=11', 'commune/plaine');
  await page.locator('.faits a', { hasText: 'ournée' }).first().click();
  await expect(page.locator('#contenu h2')).toContainText(/ournée/);
  const causes = page.locator('.causes');
  await expect(causes).toContainText('Livraison partielle');
  await expect(causes).toContainText("La capacité commune de l'entrepôt ne suffit plus");
  await expect(causes).toContainText('Un droit est acquis');
  expect(erreurs).toEqual([]);
});

test('le journal d’un humain s’ouvre depuis la commune et sa journée compte 24 cases', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=C&heure=11', 'commune/bourg');
  await page.locator('.gens a').first().click();
  await expect(page.locator('.identite')).toContainText('H-');
  await expect(page.locator('.heures i')).toHaveCount(24);
  await page.locator('button.action', { hasText: 'Suivre' }).click();
  await expect(page.locator('#mien')).toHaveAttribute('href', /humain/);
  await page.locator('#fermer').click();
  await expect(page.locator('#panneau')).toBeHidden();
});

test('les mondes A et B gardent l’entrepôt ouvert, le monde C le réserve, et l’écran partagé les compare', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=B&jour=300&heure=11', 'bien/depot');
  await expect(page.locator('#contenu')).toContainText('Accès commun.');
  await expect(page.locator('.droits')).toContainText('laissée ouverte à tous');
  await page.locator('#mondes button[data-monde="C"]').click();
  await expect(page.locator('#contenu')).toContainText('Accès réservé à 40 %');
  await page.goto(build('manual=1&monde=C&heure=11', 'mondes'));
  await expect(page.locator('#etiquettes .bandeau')).toHaveCount(3);
  expect(await etat(page)).toMatchObject({ tranches: 3, panneau: false });
  await page.locator('#comparer').click();
  await expect(page.locator('#contenu')).toContainText('tout se passe comme dans le monde A');
  await expect(page.locator('#contenu .vies a').first()).toBeVisible();
});

test('sur téléphone, le monde remplit l’écran et les communes restent accessibles au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrir(page, 'manual=1&monde=C&jour=300&heure=11');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const taille = await page.locator('#game').boundingBox();
  expect(taille && taille.width >= 390 && taille.height >= 844).toBe(true);
  const lien = page.locator('#etiquettes a.nom', { hasText: 'Le Bourg' });
  await lien.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenu h2')).toHaveText('Le Bourg');
  expect((await etat(page)).panneau).toBe(true);
});
