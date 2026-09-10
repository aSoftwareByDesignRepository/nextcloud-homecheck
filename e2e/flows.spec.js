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
		await expect(err).toContainText(/Invalid JSON/i);
		await expect(err).toContainText(/fix the syntax|try again|syntax/i);

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
