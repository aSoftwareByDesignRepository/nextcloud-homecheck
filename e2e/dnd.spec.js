// @ts-check
const { test, expect } = require('@playwright/test');
const {
	login,
	resetLayoutToFlatApps,
	clickCardMenuItem,
	waitForLayoutSave,
} = require('./helpers');

test.describe('HomeCheck drag-and-drop reorder', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await resetLayoutToFlatApps(page);
	});

	test('pointer drag reorders two app cards and persists', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);

		const first = page.locator('#hmk-grid .hmk-card[data-type="app"]').nth(0);
		const second = page.locator('#hmk-grid .hmk-card[data-type="app"]').nth(1);
		await expect(first).toBeVisible();
		await expect(second).toBeVisible();

		const idA = await first.getAttribute('data-id');
		const idB = await second.getAttribute('data-id');
		expect(idA).toBeTruthy();
		expect(idB).toBeTruthy();

		/* Drop on the right half of the neighbour so placeAfter swaps adjacent cards. */
		const boxA = await first.boundingBox();
		const boxB = await second.boundingBox();
		expect(boxA).not.toBeNull();
		expect(boxB).not.toBeNull();
		const fromX = boxA.x + boxA.width / 2;
		const fromY = boxA.y + Math.min(boxA.height / 2, 40);
		const toX = boxB.x + boxB.width * 0.75;
		const toY = boxB.y + Math.min(boxB.height / 2, 40);

		const savePromise = page.waitForResponse(
			(r) => r.url().includes('/api/layout') && r.request().method() === 'PUT',
			{ timeout: 15000 },
		);
		await page.mouse.move(fromX, fromY);
		await page.mouse.down();
		await page.mouse.move(fromX + 24, fromY + 4, { steps: 4 });
		await page.mouse.move(toX, toY, { steps: 12 });
		await page.mouse.up();

		const order = await page.locator('#hmk-grid .hmk-card[data-type="app"]').evaluateAll(
			(nodes) => nodes.map((n) => n.getAttribute('data-id')),
		);
		expect(order.indexOf(idB), `expected ${idB} before ${idA} in ${order}`).toBeLessThan(order.indexOf(idA));
		await savePromise;
	});

	test('move right menu reorders without drag', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		const first = page.locator('#hmk-grid .hmk-card[data-type="app"]').nth(0);
		const idA = await first.getAttribute('data-id');
		const savePromise = waitForLayoutSave(page);
		await clickCardMenuItem(first, /Move right|Nach rechts|Déplacer à droite|Mover a la derecha/i);
		await savePromise;
		const order = await page.locator('#hmk-grid .hmk-card[data-type="app"]').evaluateAll(
			(nodes) => nodes.map((n) => n.getAttribute('data-id')),
		);
		expect(order.indexOf(idA)).toBeGreaterThanOrEqual(1);
	});

	test('edit mode launch controls are not disabled (so drag can start)', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		const launch = page.locator('#hmk-grid .hmk-card[data-type="app"] .hmk-card__launch').first();
		await expect(launch).toHaveAttribute('aria-disabled', 'true');
		const isNativeDisabled = await launch.evaluate((el) => /** @type {HTMLButtonElement} */ (el).disabled);
		expect(isNativeDisabled).toBe(false);
	});
});
