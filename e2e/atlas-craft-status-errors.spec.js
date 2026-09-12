// @ts-check
/**
 * Narrow Atlas craft: status-bar error surfaces only (POLICY 3.5.10).
 * Does not recapture unrelated journey crafts (visual peer may be running).
 *
 * Run:
 *   HOMECHECK_E2E_USER=hmk_atlas HOMECHECK_E2E_PASS='…' \
 *     npx playwright test e2e/atlas-craft-status-errors.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { login, resetLayoutToFlatApps, clickCardMenuItem, waitForLayoutSave } = require('./helpers');

const outDir = path.resolve(
	__dirname,
	'../../../../.cursor/atlas-farm-v3/artifacts/homecheck/craft',
);

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {{ captured_at: string, files: Array<{ id: string, path: string, bytes: number }> }} meta
 */
async function shot(page, id, meta) {
	const file = path.join(outDir, `homecheck-web-${id}.png`);
	await page.waitForTimeout(350);
	await page.screenshot({ path: file, fullPage: false });
	const st = fs.statSync(file);
	expect(st.size, `${id} screenshot too small`).toBeGreaterThan(8_000);
	meta.files.push({ id, path: `craft/homecheck-web-${id}.png`, bytes: st.size });
	console.log('craft', file, st.size);
}

test.describe('HomeCheck status-bar error crafts', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await resetLayoutToFlatApps(page);
	});

	test('capture save-failed / cas-conflict / folder-children-limit / start-page-fail', async ({ page }) => {
		fs.mkdirSync(outDir, { recursive: true });
		const meta = {
			captured_at: new Date().toISOString(),
			files: /** @type {Array<{ id: string, path: string, bytes: number }>} */ ([]),
		};
		const status = page.locator('#hmk-status');

		/* --- save failed --- */
		await page.route('**/homecheck/api/layout**', async (route) => {
			if (route.request().method() === 'PUT') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ ok: false, error: { message: 'Could not save — try again' } }),
				});
				return;
			}
			await route.continue();
		});
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await expect(status).toContainText(/Could not save — try again|Speichern fehlgeschlagen/i, { timeout: 15_000 });
		await shot(page, 'save-failed', meta);
		await page.unroute('**/homecheck/api/layout**');
		await resetLayoutToFlatApps(page);

		/* --- CAS conflict (hold reload so status stays visible) --- */
		await page.evaluate(() => {
			window.__HMK_E2E_HOLD_RELOAD = true;
		});
		await page.route('**/homecheck/api/layout**', async (route) => {
			if (route.request().method() === 'PUT') {
				await route.fulfill({
					status: 409,
					contentType: 'application/json',
					body: JSON.stringify({
						ok: false,
						error: { message: 'Someone changed the layout — reloading' },
						data: { layout: { version: 1, revision: 99, items: [] } },
					}),
				});
				return;
			}
			await route.continue();
		});
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await expect(status).toContainText(/Someone changed the layout — reloading|woanders geändert/i, {
			timeout: 15_000,
		});
		await shot(page, 'cas-conflict', meta);
		await page.unroute('**/homecheck/api/layout**');
		await resetLayoutToFlatApps(page);

		/* --- folder children limit (route app.js with MAX_CHILDREN=1; copy still says max 40) --- */
		await page.route('**/homecheck/js/app.js**', async (route) => {
			const resp = await route.fetch();
			let body = await resp.text();
			if (!body.includes('const MAX_CHILDREN = 40;')) {
				throw new Error('MAX_CHILDREN const not found in app.js for e2e patch');
			}
			body = body.replace(/const MAX_CHILDREN = 40;/, 'const MAX_CHILDREN = 1;');
			await route.fulfill({
				status: resp.status(),
				headers: { ...resp.headers(), 'content-type': 'application/javascript' },
				body,
			});
		});
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20_000 });
		await page.locator('#hmk-edit-toggle').click();
		await clickCardMenuItem(
			page.locator('#hmk-panels .hmk-pane[data-type="app"]').last(),
			/New folder|Neuer Ordner/i,
		);
		await waitForLayoutSave(page);
		await clickCardMenuItem(
			page.locator('#hmk-panels .hmk-pane[data-type="app"]').first(),
			/Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i,
		);
		await expect(status).toContainText(/Too many apps in this folder \(max 40\)|Zu viele Apps|max\.?\s*40/i, {
			timeout: 10_000,
		});
		await shot(page, 'folder-children-limit', meta);
		await page.unroute('**/homecheck/js/app.js**');
		await resetLayoutToFlatApps(page);

		/* --- start page fail --- */
		await page.route('**/homecheck/api/default-landing**', async (route) => {
			if (route.request().method() === 'POST') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ ok: false, error: { message: 'Could not update start page' } }),
				});
				return;
			}
			await route.continue();
		});
		const homeToggle = page.locator('#hmk-home-toggle');
		const ctaYes = page.locator('#hmk-cta-yes');
		if (await homeToggle.isVisible().catch(() => false)) {
			await homeToggle.click();
		} else if (await ctaYes.isVisible().catch(() => false)) {
			await ctaYes.click();
		} else {
			await page.evaluate(() => {
				const btn = document.getElementById('hmk-home-toggle');
				if (btn) {
					btn.hidden = false;
					btn.click();
				}
			});
		}
		await expect(status).toContainText(/Could not update start page|Startseite konnte nicht/i, { timeout: 15_000 });
		await shot(page, 'start-page-fail', meta);
		await page.unroute('**/homecheck/api/default-landing**');

		expect(meta.files.length).toBe(4);
		fs.writeFileSync(path.join(outDir, 'craft-status-errors.log'), JSON.stringify(meta, null, 2) + '\n');
	});
});
