// @ts-check
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck, resetLayoutToFlatApps, clickCardMenuItem, folderCount, folderAt, openFolderCard, waitForLayoutSave } = require('./helpers');

test.describe('HomeCheck user journeys', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await resetLayoutToFlatApps(page);
	});

	test('toolbar creates folder in one click then renames', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 1);

		const folderName = 'QuickFolder' + Date.now().toString().slice(-5);
		const folderPane = folderAt(page, before);
		await clickCardMenuItem(folderPane, /Rename|Umbenennen/i);
		await page.locator('#hmk-prompt-input').fill(folderName);
		await page.locator('#hmk-prompt-ok').click();
		await waitForLayoutSave(page);
		await expect(folderPane.locator('.hmk-pane__title-text')).toContainText(folderName);
	});

	test('creates folder from app menu without naming prompt', async ({ page }) => {
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		const firstApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').last();
		const appName = ((await firstApp.locator('.hmk-pane__title-text').textContent()) || 'App').trim();
		await clickCardMenuItem(firstApp, /New folder|Neuer Ordner/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 1);
		const folderPane = folderAt(page, before);
		await expect(folderPane.locator('.hmk-pane__row')).toHaveCount(1);
		await expect(folderPane).toContainText(appName);
		await openFolderCard(folderPane);
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		await expect(page.locator('#hmk-folder-grid .hmk-pane__row')).toHaveCount(1);
		await expect(page.locator('#hmk-folder-grid')).toContainText(appName);
	});

	test('delete folder uses accessible confirm dialog', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 1);
		await clickCardMenuItem(folderAt(page, before), /Delete folder|Ordner löschen/i);
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await page.locator('#hmk-confirm-ok').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before, { timeout: 10000 });
	});

	test('rename save restores focus to the rebuilt pane, not document.body', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		const pane = folderAt(page, before);
		const paneId = await pane.getAttribute('data-id');
		await clickCardMenuItem(pane, /Rename|Umbenennen/i);
		await expect(page.locator('#hmk-prompt-dialog')).toBeVisible();
		await page.locator('#hmk-prompt-input').fill('FocusProbe' + Date.now().toString().slice(-5));
		await page.locator('#hmk-prompt-ok').click();
		await waitForLayoutSave(page);
		/* render() detached the pre-dialog node; focus must land on the successor. */
		const focus = await page.evaluate(() => {
			const a = document.activeElement;
			const host = a && a.closest ? a.closest('[data-id]') : null;
			return { tag: a ? a.tagName : '', id: host ? host.getAttribute('data-id') : null };
		});
		expect(focus.tag).not.toBe('BODY');
		expect(focus.id).toBe(paneId);
	});

	test('folder-dialog row remove keeps focus inside the dialog, not on body', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first();
		/* One folder → Add to folder auto-adds without the picker. */
		const appPane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		await clickCardMenuItem(appPane, /Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i);
		await waitForLayoutSave(page);
		await openFolderCard(folder);
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		const row = page.locator('#hmk-folder-grid .hmk-pane__row').first();
		await expect(row).toBeVisible();
		/* Real clicks so the menuitem button genuinely holds DOM focus (the
		   path the critic probed: repaint detached it → body). */
		await row.locator('summary').click();
		await row.getByRole('menuitem', { name: /Remove from folder|Aus Ordner entfernen/i }).click();
		await waitForLayoutSave(page);
		const focus = await page.evaluate(() => {
			const a = document.activeElement;
			return {
				tag: a ? a.tagName : '',
				id: a ? a.id : '',
				inDialog: !!(a && a.closest && a.closest('#hmk-folder-dialog')),
			};
		});
		expect(focus.tag).not.toBe('BODY');
		expect(focus.inDialog).toBe(true);
	});

	test('delete confirm restores focus to a stable control after the pane is gone', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await clickCardMenuItem(folderAt(page, before), /Delete folder|Ordner löschen/i);
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await page.locator('#hmk-confirm-ok').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before, { timeout: 10000 });
		const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
		expect(focusedId).toBe('hmk-edit-toggle');
	});

	test('Add to folder opens picker: cancel leaves app; confirm adds member', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();

		/* Need ≥2 folders so Add to folder shows the picker (not auto-add). */
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(2);

		const appPane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		const appId = await appPane.getAttribute('data-id');
		expect(appId).toBeTruthy();
		const appName = ((await appPane.locator('.hmk-pane__title-text').textContent()) || 'App').trim();

		await clickCardMenuItem(appPane, /Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i);
		await expect(page.locator('#hmk-folder-picker')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-folder-picker-title')).toContainText(/Choose a folder|Ordner wählen|Choisir/i);
		await expect(page.locator('#hmk-folder-picker-list [role="listitem"]')).toHaveCount(2);

		await page.locator('#hmk-folder-picker-cancel').click();
		await expect(page.locator('#hmk-folder-picker')).toBeHidden();
		await expect(page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`)).toBeVisible();

		await clickCardMenuItem(
			page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`),
			/Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i,
		);
		await expect(page.locator('#hmk-folder-picker')).toBeVisible({ timeout: 10_000 });
		await page.locator('#hmk-folder-picker-list [role="listitem"]').first().click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-folder-picker')).toBeHidden();
		await expect(page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`)).toHaveCount(0);
		const targetFolder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first();
		await expect(targetFolder).toContainText(appName);
	});

	test('hide app → hidden dialog restore + cancel close', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();

		const appPane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		const appId = await appPane.getAttribute('data-id');
		const appName = ((await appPane.locator('.hmk-pane__title-text').textContent()) || 'App').trim();
		expect(appId).toBeTruthy();

		await clickCardMenuItem(appPane, /Hide|Ausblenden|Masquer|Ocultar/i);
		await waitForLayoutSave(page);
		await expect(page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`)).toHaveCount(0);
		await expect(page.locator('#hmk-hidden-apps')).toBeVisible();

		await page.locator('#hmk-hidden-apps').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-hidden-list .hmk-hidden-row')).toContainText(appName);

		await page.locator('#hmk-hidden-cancel').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeHidden();
		await expect(page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`)).toHaveCount(0);

		await page.locator('#hmk-hidden-apps').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeVisible();
		const row = page.locator('#hmk-hidden-list .hmk-hidden-row').filter({ hasText: appName }).first();
		await row.getByRole('button', { name: /Show again|Wieder anzeigen|Réafficher|Mostrar/i }).click();
		await waitForLayoutSave(page);
		await expect(page.locator(`#hmk-panels .hmk-pane[data-type="app"][data-id="${appId}"]`)).toBeVisible({ timeout: 10_000 });
		await page.locator('#hmk-hidden-close').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeHidden();
	});

	test('rename validation shows prompt error for empty name', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		const folderPane = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first();
		await clickCardMenuItem(folderPane, /Rename|Umbenennen|Renommer|Cambiar nombre|Rinomina/i);
		await expect(page.locator('#hmk-prompt-dialog')).toBeVisible();
		await page.locator('#hmk-prompt-input').fill('');
		await page.locator('#hmk-prompt-ok').click();
		const err = page.locator('#hmk-prompt-error');
		await expect(err).toBeVisible();
		await expect(err).toContainText(/Name must be 1–40 characters|1.?40|Zeichen/i);
		await expect(page.locator('#hmk-prompt-dialog')).toBeVisible();
		await page.locator('#hmk-prompt-cancel').click();
		await expect(page.locator('#hmk-prompt-dialog')).toBeHidden();
	});

	test('admin seed Invalid JSON and Save failed surface #hmk-admin-error', async ({ page }) => {
		const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
		await page.goto(base + '/index.php/settings/admin/additional');
		await page.waitForLoadState('domcontentloaded');
		const admin = page.locator('#hmk-admin');
		await expect(admin).toBeVisible({ timeout: 20_000 });
		const err = page.locator('#hmk-admin-error');
		const seedBox = page.locator('#hmk-admin-json');

		await seedBox.fill('{ not-json');
		await page.locator('#hmk-admin-save').click();
		/* EN "Invalid JSON" / DE "Ungültiges JSON" (and sibling locales). */
		await expect(err).toContainText(/Invalid JSON|Ungültiges JSON|JSON/i);
		await expect(err).toContainText(/fix the syntax|try again|syntax|korrigieren|erneut/i);

		await seedBox.fill(JSON.stringify({ version: 1, revision: 0, items: [{ type: 'app', id: 'files' }] }, null, 2));
		await page.route('**/apps/homecheck/api/admin/template**', async (route) => {
			if (route.request().method() === 'PUT') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ ok: false, error: { message: 'Could not save the seed — fix any errors and try again' } }),
				});
				return;
			}
			await route.continue();
		});
		await page.locator('#hmk-admin-save').click();
		await expect(err).toContainText(/Could not save the seed|Save failed|try again/i);
		await page.unroute('**/apps/homecheck/api/admin/template**');
	});

	test('status-bar save failed: PUT layout 500 → Could not save — try again', async ({ page }) => {
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
		const status = page.locator('#hmk-status');
		await expect(status).toContainText(/Could not save — try again|Speichern fehlgeschlagen/i, { timeout: 15_000 });
		await expect(status).toHaveClass(/is-error/);
		await page.unroute('**/homecheck/api/layout**');
	});

	test('status-bar CAS conflict: PUT layout 409 → Someone changed the layout — reloading', async ({ page }) => {
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
		const status = page.locator('#hmk-status');
		await expect(status).toContainText(/Someone changed the layout — reloading|woanders geändert|neu laden/i, {
			timeout: 15_000,
		});
		await expect(status).toHaveClass(/is-error/);
		await page.unroute('**/homecheck/api/layout**');
	});

	test('status-bar folder children limit: Add to folder at max 40 → Too many apps', async ({ page }) => {
		/* Merger drops non-live nav ids, so lower MAX_CHILDREN via app.js route to exercise the same guard. */
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
		/* New folder from app menu → folder already has 1 child (= MAX when patched). */
		const firstApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').last();
		await clickCardMenuItem(firstApp, /New folder|Neuer Ordner/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(1);
		const secondApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		await clickCardMenuItem(secondApp, /Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i);
		const status = page.locator('#hmk-status');
		await expect(status).toContainText(/Too many apps in this folder \(max 40\)|Zu viele Apps|máx\.?\s*40|max\.?\s*40/i, {
			timeout: 10_000,
		});
		await expect(status).toHaveClass(/is-error/);
		await page.unroute('**/homecheck/js/app.js**');
	});

	test('status-bar start-page fail: default-landing !ok → Could not update start page', async ({ page }) => {
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
		/* Prefer chrome toggle; if CTA is teaching, use CTA Yes instead. */
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
		const status = page.locator('#hmk-status');
		await expect(status).toContainText(/Could not update start page|Startseite konnte nicht|página inicial|start page/i, {
			timeout: 15_000,
		});
		await expect(status).toHaveClass(/is-error/);
		await page.unroute('**/homecheck/api/default-landing**');
	});

	test('Help feedback footer: open menu, mailto/GitHub links, Escape dismiss', async ({ page }) => {
		const help = page.locator('#hmk-nav-footer .hmk-nav-footer__trigger');
		await help.scrollIntoViewIfNeeded();
		await expect(help).toBeVisible();
		await help.click();
		const menu = page.locator('#hmk-feedback-menu');
		await expect(menu).toBeVisible();
		await expect(page.locator('#hmk-feedback-problem')).toHaveAttribute('href', /mailto:/);
		await expect(page.locator('#hmk-feedback-idea')).toHaveAttribute('href', /mailto:/);
		await expect(page.locator('#hmk-feedback-github')).toHaveAttribute('href', /github\.com/);
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
		await expect(help).toHaveAttribute('aria-expanded', 'false');
	});

	test('mobile viewport: panes and edit controls usable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('#hmk-panels .hmk-pane__launch, #hmk-panels .hmk-pane__row-launch').first()).toBeVisible();

		const editBtn = page.locator('#hmk-edit-toggle');
		await editBtn.scrollIntoViewIfNeeded();
		const box = await editBtn.boundingBox();
		expect(box).not.toBeNull();
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(box.width).toBeGreaterThanOrEqual(44);

		await editBtn.click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		expect(await page.locator('#hmk-panels .hmk-pane').count()).toBeGreaterThan(0);
		const paneW = await page.locator('#hmk-panels .hmk-pane').first().evaluate((el) => el.getBoundingClientRect().width);
		expect(paneW).toBeGreaterThan(280);
	});
});
