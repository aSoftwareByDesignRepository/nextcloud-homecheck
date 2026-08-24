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
		await expect(page.locator('#hmk-edit-banner')).toBeVisible();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before + 1);

		const folderName = 'QuickFolder' + Date.now().toString().slice(-5);
		const folderCard = folderAt(page, before);
		await clickCardMenuItem(folderCard, /Rename|Umbenennen/i);
		await page.locator('#hmk-prompt-input').fill(folderName);
		await page.locator('#hmk-prompt-ok').click();
		await waitForLayoutSave(page);
		await expect(page.getByRole('button', { name: new RegExp(folderName, 'i') })).toBeVisible();
	});

	test('creates folder from app menu without naming prompt', async ({ page }) => {
		await expect(page.locator('#hmk-grid .hmk-card[data-type="app"]').first()).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		const firstApp = page.locator('#hmk-grid .hmk-card[data-type="app"]').last();
		const appName = ((await firstApp.locator('.hmk-card__name').textContent()) || 'App').trim();
		await clickCardMenuItem(firstApp, /New folder|Neuer Ordner/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before + 1);
		await openFolderCard(folderAt(page, before));
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		await expect(page.locator('#hmk-folder-grid .hmk-card')).toHaveCount(1);
		await expect(page.locator('#hmk-folder-grid')).toContainText(appName);
	});

	test('delete folder uses accessible confirm dialog', async ({ page }) => {
		await expect(page.locator('#homecheck-app')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before + 1);
		await clickCardMenuItem(folderAt(page, before), /Delete folder|Ordner löschen/i);
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await page.locator('#hmk-confirm-ok').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before, { timeout: 10000 });
	});

	test('mobile viewport: grid and edit controls usable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('#hmk-grid .hmk-card__launch').first()).toBeVisible();

		const editBtn = page.locator('#hmk-edit-toggle');
		await editBtn.scrollIntoViewIfNeeded();
		const box = await editBtn.boundingBox();
		expect(box).not.toBeNull();
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(box.width).toBeGreaterThanOrEqual(44);

		await editBtn.click();
		await expect(page.locator('#hmk-edit-banner')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		expect(await page.locator('#hmk-grid .hmk-card').count()).toBeGreaterThan(0);
	});
});
