// @ts-check
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck, resetLayoutToFlatApps, clickCardMenuItem, folderCount, folderAt, openFolderCard, waitForLayoutSave } = require('./helpers');

test.describe('HomeCheck launcher', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await resetLayoutToFlatApps(page);
	});

	test('grid renders and edit toggle works', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-banner')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).not.toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-banner')).toBeHidden();
	});

	test('creates folder, opens it in edit mode, removes member', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		const before = await folderCount(page);
		const firstApp = page.locator('#hmk-grid .hmk-card[data-type="app"]').first();
		const appName = ((await firstApp.locator('.hmk-card__name').textContent()) || 'App').trim();
		await clickCardMenuItem(firstApp, /New folder|Neuer Ordner/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before + 1, { timeout: 10000 });
		await openFolderCard(folderAt(page, before));
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		const member = page.locator('#hmk-folder-grid .hmk-card').filter({ hasText: appName }).first();
		await expect(member).toBeVisible({ timeout: 5000 });
		await clickCardMenuItem(member, /Remove from folder|Aus Ordner nehmen/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-folder-grid .hmk-card')).toHaveCount(0, { timeout: 10000 });
	});

	test('view mode launches an app card', async ({ page }) => {
		const picked = await page.evaluate(() => {
			const raw = document.getElementById('hmk-initial-state');
			if (!raw || !raw.textContent) {
				return false;
			}
			const state = JSON.parse(raw.textContent);
			const byId = {};
			(state.entries || []).forEach(function (e) {
				byId[e.id] = e;
			});
			const cards = document.querySelectorAll('#hmk-grid .hmk-card[data-type="app"]');
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i];
				const entry = byId[card.dataset.id || ''];
				const btn = card.querySelector('.hmk-card__launch');
				if (!entry || !btn || btn.disabled) {
					continue;
				}
				if (entry.href && entry.href.indexOf('/apps/homecheck') === -1) {
					/** @type {HTMLElement} */ (btn).click();
					return true;
				}
			}
			return false;
		});
		expect(picked).toBe(true);
		await page.waitForURL((url) => !/\/apps\/homecheck\/?$/.test(url.pathname), { timeout: 20000 });
	});
});
