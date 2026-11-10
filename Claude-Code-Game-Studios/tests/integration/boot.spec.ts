// Playwright : le fichier unique ouvert depuis le disque, avec le jeu de
// démonstration embarqué, piloté par le crochet d'état (src/hook.ts).
// npm run smoke ne lance que l'essai @boot.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string, route = ''): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}${route ? `#/${route}` : ''}`;
interface Etat { monde: string; jour: number; route: string; source: string; commune: string | null; habitants: number; lecture: boolean; temps: number }
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

test('démarre sur la carte de la région, sans erreur @boot', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1');
  expect(await page.evaluate(() => window.game!.scene)).toBe('carte');
  expect((await etat(page)).source).toBe('demo');
  const taille = await page.locator('#game').boundingBox();
  expect(taille && taille.width >= 360 && taille.height >= 232).toBe(true);
  await expect(page.locator('#etiquettes a.commune')).toHaveCount(5);
  expect(erreurs).toEqual([]);
});

test('un parcours scripté se répète à l’identique', async ({ page }) => {
  async function parcours(): Promise<Etat> {
    await page.goto('about:blank'); // même adresse : sans cela la page ne serait pas rechargée
    await ouvrir(page, 'manual=1&monde=C&jour=100', 'commune/plaine');
    await page.evaluate(() => { const g = window.game!; g.step(120); g.press('ArrowRight'); g.press('PageDown'); g.step(60); });
    return etat(page);
  }
  const premier = await parcours();
  expect(premier).toMatchObject({ monde: 'C', jour: 131, commune: 'plaine', route: 'commune/plaine' });
  expect(premier.habitants).toBeGreaterThan(0);
  expect(await parcours()).toEqual(premier);
});

test('d’un fait de la commune, on remonte jusqu’au droit acquis sur l’entrepôt', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1&monde=C', 'commune/plaine');
  await page.locator('.fait a', { hasText: 'ournée' }).first().click();
  await expect(page.locator('.entete h2')).toContainText(/ournée/);
  const causes = page.locator('.causes');
  await expect(causes).toContainText('Livraison partielle');
  await expect(causes).toContainText('La capacité commune de l’entrepôt ne suffit plus'.replace('’', "'"));
  await expect(causes).toContainText('Un droit est acquis');
  expect(erreurs).toEqual([]);
});

test('le journal d’un humain s’ouvre depuis la commune et tient dans 24 heures', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=C', 'commune/bourg');
  await page.locator('.humains a.humain').first().click();
  await expect(page.locator('.identite')).toContainText('H-');
  await expect(page.locator('.journee')).toBeVisible();
  expect((await page.locator('.journee').boundingBox())!.height).toBeGreaterThan(20);
  await page.locator('button.action', { hasText: 'Suivre' }).click();
  await expect(page.locator('#mien')).toHaveText('Mon humain');
});

test('les cas A et B montrent un entrepôt aux mêmes conditions d’usage, le cas C un accès réservé', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=B&jour=300', 'bien/depot');
  await expect(page.locator('#contenu .badges')).toContainText('Accès commun');
  await expect(page.locator('.droits')).toContainText('laissée en accès commun');
  await page.selectOption('#monde', 'C');
  await expect(page.locator('#contenu .badges')).toContainText('Accès réservé à 40 %');
  await page.goto(build('manual=1&monde=C', 'observation'));
  await expect(page.locator('#contenu')).toContainText('B par rapport à A : mêmes conditions d’usage, mêmes résultats.');
  await expect(page.locator('#contenu table').first()).toBeVisible();
});

test('sur téléphone, la carte tient dans l’écran et les communes restent accessibles au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrir(page, 'manual=1&monde=C&jour=300');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const lien = page.locator('#etiquettes a.commune', { hasText: 'La Plaine' });
  await lien.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.entete h2')).toHaveText('La Plaine');
  expect((await etat(page)).commune).toBe('plaine');
});
