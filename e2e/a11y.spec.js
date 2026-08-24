// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck, folderCount, folderAt, openFolderCard } = require('./helpers');

async function scan(page, label) {
	const results = await new AxeBuilder({ page })
		.include('#homecheck-app')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations, `${label} a11y violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test.describe('HomeCheck accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('view mode passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		await scan(page, 'view mode');
	});

	test('edit mode passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await scan(page, 'edit mode');
	});

	test('folder dialog passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		const count = await folderCount(page);
		if (count > 0) {
			await openFolderCard(folderAt(page, 0));
		} else {
			await page.locator('#hmk-edit-toggle').click();
			const before = await folderCount(page);
			await page.locator('#hmk-new-folder').click();
			await expect(page.locator('#hmk-status')).toContainText(/Saved|Gespeichert/i, { timeout: 15000 });
			await expect(page.locator('#hmk-grid .hmk-card[data-type="folder"]')).toHaveCount(before + 1);
			await openFolderCard(folderAt(page, before));
		}
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		await scan(page, 'folder dialog');
	});

	test('keyboard: skip link and edit toggle', async ({ page }) => {
		await openHomeCheck(page);
		const skip = page.locator('.hmk-skip');
		await skip.focus();
		await expect(skip).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('#hmk-main')).toBeFocused();
		await page.locator('#hmk-edit-toggle').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
	});
});
