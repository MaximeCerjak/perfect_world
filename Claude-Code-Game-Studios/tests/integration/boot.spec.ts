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

test('démarre sur la carte de la vallée, sans erreur @boot', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1');
  expect(await page.evaluate(() => window.game!.scene)).toBe('carte');
  expect((await etat(page)).source).toBe('demo');
  const taille = await page.locator('#game').boundingBox();
  expect(taille && taille.width >= 360 && taille.height >= 232).toBe(true);
  await expect(page.locator('#etiquettes a.nom')).toHaveCount(5);
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

test('la page prend les tons de la saison affichée', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=C&jour=20');
  const ton = (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t4').trim());
  const printemps = await ton();
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.game!.press('PageDown'); });
  expect(await ton()).not.toBe(printemps);
  await expect(page.locator('#date')).toContainText('jour 200');
});

test('d’un fait de la commune, on remonte jusqu’au droit acquis sur l’entrepôt', async ({ page }) => {
  const erreurs = await ouvrir(page, 'manual=1&monde=C', 'commune/plaine');
  await page.locator('.faits a', { hasText: 'ournée' }).first().click();
  await expect(page.locator('.carnet h2')).toContainText(/ournée/);
  const causes = page.locator('.causes');
  await expect(causes).toContainText('Livraison partielle');
  await expect(causes).toContainText("La capacité commune de l'entrepôt ne suffit plus");
  await expect(causes).toContainText('Un droit est acquis');
  expect(erreurs).toEqual([]);
});

test('le journal d’un humain s’ouvre depuis la commune et sa journée compte 24 cases', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=C', 'commune/bourg');
  await page.locator('.gens a').first().click();
  await expect(page.locator('.identite')).toContainText('H-');
  await expect(page.locator('.heures i')).toHaveCount(24);
  await page.locator('button.action', { hasText: 'Suivre' }).click();
  await expect(page.locator('#mien')).toHaveText('Mon humain');
});

test('les mondes A et B gardent l’entrepôt ouvert, le monde C le réserve, et la scène des trois mondes les compare', async ({ page }) => {
  await ouvrir(page, 'manual=1&monde=B&jour=300', 'bien/depot');
  await expect(page.locator('#contenu')).toContainText('Accès commun.');
  await expect(page.locator('.droits')).toContainText('laissée ouverte à tous');
  await page.locator('#mondes button[data-monde="C"]').click();
  await expect(page.locator('#contenu')).toContainText('Accès réservé à 40 %');
  await page.goto(build('manual=1&monde=C', 'mondes'));
  await expect(page.locator('#contenu')).toContainText('tout se passe comme dans le monde A');
  await expect(page.locator('#etiquettes button.bande')).toHaveCount(3);
  await expect(page.locator('#contenu .vies a').first()).toBeVisible();
});

test('sur téléphone, la carte tient dans l’écran et les communes restent accessibles au clavier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrir(page, 'manual=1&monde=C&jour=300');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const lien = page.locator('#etiquettes a.nom', { hasText: 'La Plaine' });
  await lien.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.carnet h2')).toHaveText('La Plaine');
  expect((await etat(page)).commune).toBe('plaine');
});
