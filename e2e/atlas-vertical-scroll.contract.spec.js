// @ts-check
/**
 * ATLAS_VERTICAL_SCROLL_CONTRACT — the transfer settings page must scroll to the end.
 * Guards CSS Overflow L3 unpaired overflow-x:clip truncating the import card
 * (the second, lower card on /settings/transfer).
 */
const { test } = require('@playwright/test');
const { login } = require('./helpers');
const { assertAtlasVerticalScrollReachable } = require('../../_shared/e2e/atlas-vertical-scroll-contract');

const BASE = (process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');

test.describe('ATLAS_VERTICAL_SCROLL_CONTRACT', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('transfer settings page scrolls to the import card end', async ({ page }) => {
		// Short viewport so both cards overflow and must scroll.
		await page.setViewportSize({ width: 1280, height: 640 });
		const response = await page.goto(`${BASE}/index.php/apps/homecheck/settings/transfer`, {
			waitUntil: 'domcontentloaded',
		});
		// The fixture user is the NC sysadmin — the page must render, not redirect.
		if (!response || response.status() !== 200) {
			throw new Error(`transfer settings page did not render: status=${response && response.status()}`);
		}
		await page.waitForSelector('#hmk-transfer-import-card', { timeout: 45_000 });

		await assertAtlasVerticalScrollReachable(page, {
			scrollport: '#app-content',
			target: '#hmk-transfer-import-card, #hmk-transfer-result-live',
			bottomSlopPx: 12,
		});
	});

	test('transfer settings stays reachable at phone height', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 667 });
		await page.goto(`${BASE}/index.php/apps/homecheck/settings/transfer`, {
			waitUntil: 'domcontentloaded',
		});
		await page.waitForSelector('#hmk-transfer-import-card', { timeout: 45_000 });

		await assertAtlasVerticalScrollReachable(page, {
			scrollport: '#app-content',
			target: '#hmk-transfer-import-card, #hmk-transfer-result-live',
			bottomSlopPx: 16,
		});
	});
});
