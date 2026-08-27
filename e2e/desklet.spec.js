// @ts-check
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck } = require('./helpers');

test.describe('HomeCheck responsive panes + desklet API', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('panes stay dashboard-sized and wrap on wide viewport', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await openHomeCheck(page);
		const metrics = await page.evaluate(() => {
			const panes = Array.from(document.querySelectorAll('#hmk-panels > .hmk-pane'));
			const host = document.querySelector('#hmk-panels');
			if (!host || panes.length < 2) {
				return null;
			}
			const hostBox = host.getBoundingClientRect();
			const widths = panes.map((p) => p.getBoundingClientRect().width);
			const tops = panes.map((p) => Math.round(p.getBoundingClientRect().top));
			const uniqueRows = new Set(tops).size;
			return {
				hostW: hostBox.width,
				minW: Math.min(...widths),
				maxW: Math.max(...widths),
				count: panes.length,
				uniqueRows,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.hostW).toBeGreaterThan(600);
		expect(metrics.maxW).toBeLessThanOrEqual(360);
		expect(metrics.minW).toBeGreaterThanOrEqual(240);
		/* At least two panes fit side-by-side on a 1280px viewport. */
		expect(metrics.hostW / metrics.maxW).toBeGreaterThan(2);
		expect(metrics.count).toBeGreaterThan(1);
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
