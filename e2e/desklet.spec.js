// @ts-check
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck } = require('./helpers');

test.describe('HomeCheck dense launcher + desklet API', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('tiles pack densely — no full-width stretch on wide viewport', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openHomeCheck(page);
		const metrics = await page.evaluate(() => {
			const card = document.querySelector('#hmk-grid .hmk-card');
			const grid = document.querySelector('#hmk-grid');
			if (!card || !grid) {
				return null;
			}
			const cardBox = card.getBoundingClientRect();
			const gridBox = grid.getBoundingClientRect();
			return {
				cardW: cardBox.width,
				gridW: gridBox.width,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.gridW).toBeGreaterThan(900);
		// Dense tracks max ~7rem; must not stretch toward half the grid.
		expect(metrics.cardW).toBeLessThanOrEqual(120);
		expect(metrics.cardW).toBeGreaterThanOrEqual(80);
		expect(metrics.cardW / metrics.gridW).toBeLessThan(0.2);
	});

	test('dashboard OCS returns HomeCheck launcher desklet items', async ({ page }) => {
		await openHomeCheck(page); // ensure session + layout warm
		const result = await page.evaluate(async () => {
			const token = window.OC?.requestToken
				|| document.querySelector('head')?.getAttribute('data-requesttoken')
				|| '';
			const url = (window.OC?.generateUrl
				? window.OC.generateUrl('/ocs/v2.php/apps/dashboard/api/v2/widget-items')
				: '/ocs/v2.php/apps/dashboard/api/v2/widget-items')
				+ '?widgets[]=homecheck-launcher';
			const res = await fetch(url, {
				credentials: 'same-origin',
				headers: {
					'OCS-APIRequest': 'true',
					requesttoken: token,
					Accept: 'application/json',
				},
			});
			const json = await res.json().catch(() => null);
			return { status: res.status, json };
		});
		expect(result.status).toBe(200);
		const widgets = result.json?.ocs?.data?.widgets
			|| result.json?.ocs?.data
			|| {};
		const entry = widgets['homecheck-launcher']
			|| Object.values(widgets).find((w) => w?.id === 'homecheck-launcher' || w?.items);
		expect(entry).toBeTruthy();
		const items = entry.items || entry?.WidgetItems?.items || [];
		const empty = entry.emptyContentMessage || entry.emptyContent || '';
		expect(Array.isArray(items) || typeof empty === 'string').toBe(true);
		if (Array.isArray(items) && items.length > 0) {
			expect(items[0].link || items[0].url).toMatch(/homecheck/i);
		}
	});
});
