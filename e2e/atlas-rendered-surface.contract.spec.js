// @ts-check
/**
 * ATLAS_RENDERED_SURFACE_CONTRACT — HomeCheck page surfaces.
 *
 * Asserts the *rendered* truth of each app page: content lists keep markers,
 * selects vertically centre their value, icons render non-zero, form controls
 * are not centered by shell leaks. DOM-only specs pass on visually broken
 * pages (marker resets, sunken selects, 0×0 icons) — this catches them.
 *
 * HomeCheck surfaces: the launcher page (#homecheck-app) and the admin seed
 * settings section (#hmk-admin). Panes/folder rows are div lists
 * (role=list/listitem), not ul/ol — no listAllow needed. The one <input> is
 * the rename prompt inside a hidden <dialog> (invisible → skipped).
 */
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck } = require('./helpers');
const { assertAtlasRenderedSurface } = require('../../_shared/e2e/atlas-rendered-surface-contract');

const BASE = (process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');

test.describe('ATLAS_RENDERED_SURFACE_CONTRACT', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('ATLAS_RENDERED_SURFACE_CONTRACT launcher page', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openHomeCheck(page);
		await assertAtlasRenderedSurface(page, {
			content: '#homecheck-app',
			navExclude: '#app-navigation, nav, [role="navigation"], .hmk-nav-footer',
		});
	});

	test('ATLAS_RENDERED_SURFACE_CONTRACT admin seed settings', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		const response = await page.goto(`${BASE}/index.php/settings/admin/additional`, {
			waitUntil: 'domcontentloaded',
		});
		/* Non-admin fixture users cannot reach this section — fail honestly. */
		expect(response?.status(), 'admin settings must render (fixture user needs admin)').toBe(200);
		await expect(page.locator('#hmk-admin')).toBeVisible({ timeout: 20_000 });
		await assertAtlasRenderedSurface(page, {
			content: '#hmk-admin',
			navExclude: '#app-navigation, nav, [role="navigation"], .hmk-nav-footer',
		});
	});

	test('unknown app route → real HTTP 404 (no fake 200 error page)', async ({ page }) => {
		const response = await page.goto(`${BASE}/index.php/apps/homecheck/no-such-page`, {
			waitUntil: 'domcontentloaded',
		});
		expect(response, 'navigation response').toBeTruthy();
		expect(response?.status(), 'unknown app route must answer 404').toBe(404);
		await expect(page.locator('#homecheck-app')).toHaveCount(0);
	});
});
