// @ts-check
/*
 * Atlas journey proofs — REAL server round-trips, no route mocks.
 * Covers happy paths the mocked status-bar specs cannot:
 *  - start-page toggle (POST /api/default-landing enable on/off)
 *  - top-bar apporder sync (PUT /api/layout + POST /api/sync-apporder)
 *  - CAS revision conflict (real stale PUT -> 409 + fresh server layout)
 *  - admin seed template GET/PUT round-trip (non-destructive)
 */
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck } = require('./helpers');

/**
 * Authenticated fetch inside the page (real session cookie + CSRF token).
 * @param {import('@playwright/test').Page} page
 * @param {string} method
 * @param {string} path  app-relative path e.g. '/apps/homecheck/api/layout'
 * @param {object} [body]
 */
async function api(page, method, path, body) {
	return page.evaluate(
		async ({ method, path, body }) => {
			const token = window.OC && window.OC.requestToken ? window.OC.requestToken : '';
			const url = window.OC && window.OC.generateUrl
				? window.OC.generateUrl(path)
				: '/index.php' + path;
			const res = await fetch(url, {
				method: method,
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					requesttoken: token,
					Accept: 'application/json',
				},
				body: body === undefined ? undefined : JSON.stringify({ requesttoken: token, ...body }),
			});
			return { status: res.status, data: await res.json() };
		},
		{ method, path, body },
	);
}

/**
 * Current layout object from the rendered initial state.
 * @param {import('@playwright/test').Page} page
 */
async function readInitialState(page) {
	return page.evaluate(() => {
		const raw = document.getElementById('hmk-initial-state');
		if (!raw || !raw.textContent) {
			throw new Error('missing #hmk-initial-state');
		}
		return JSON.parse(raw.textContent);
	});
}

test.describe('Atlas journey proofs (real server round-trips)', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('start-page toggle enables then disables default landing', async ({ page }) => {
		/* Normalize: landing off so the toggle is deterministic. */
		await openHomeCheck(page);
		await api(page, 'POST', '/apps/homecheck/api/default-landing', { enable: false });
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });

		const cta = page.locator('#hmk-cta');
		const toggle = page.locator('#hmk-home-toggle');

		if (await cta.isVisible().catch(() => false)) {
			/* CTA teaching card is the primary happy path: Use as start page. */
			const [enableRes] = await Promise.all([
				page.waitForResponse(
					(r) => r.url().includes('/api/default-landing') && r.request().method() === 'POST',
					{ timeout: 15000 },
				),
				page.locator('#hmk-cta-yes').click(),
			]);
			const enableData = await enableRes.json();
			expect(enableData.ok).toBe(true);
			expect(enableData.data && enableData.data.isDefaultLanding).toBe(true);
			await expect(cta).toBeHidden();
			await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		} else {
			await expect(toggle).toBeVisible();
			await expect(toggle).toHaveAttribute('aria-pressed', 'false');
			const [enableRes] = await Promise.all([
				page.waitForResponse(
					(r) => r.url().includes('/api/default-landing') && r.request().method() === 'POST',
					{ timeout: 15000 },
				),
				toggle.click(),
			]);
			const enableData = await enableRes.json();
			expect(enableData.ok).toBe(true);
			expect(enableData.data && enableData.data.isDefaultLanding).toBe(true);
			await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		}

		/* Disable again — restores pre-test state and proves enable:false round-trip. */
		const [disableRes] = await Promise.all([
			page.waitForResponse(
				(r) => r.url().includes('/api/default-landing') && r.request().method() === 'POST',
				{ timeout: 15000 },
			),
			toggle.click(),
		]);
		const disableData = await disableRes.json();
		expect(disableData.ok).toBe(true);
		expect(disableData.data && disableData.data.isDefaultLanding).toBe(false);
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	});

	test('layout save reports apporderSynced and manual resync succeeds', async ({ page }) => {
		await openHomeCheck(page);
		const state = await readInitialState(page);
		const layout = {
			version: state.layout.version,
			revision: state.layout.revision,
			items: state.layout.items,
		};
		const put = await api(page, 'PUT', '/apps/homecheck/api/layout', { layout });
		expect(put.status).toBe(200);
		expect(put.data.ok).toBe(true);
		expect(put.data.data && put.data.data.apporderSynced).toBe(true);

		const sync = await api(page, 'POST', '/apps/homecheck/api/sync-apporder', {});
		expect(sync.status).toBe(200);
		expect(sync.data.ok).toBe(true);
		expect(sync.data.data && sync.data.data.apporderSynced).toBe(true);
	});

	test('stale revision PUT loses CAS: 409 returns fresh server layout', async ({ page }) => {
		await openHomeCheck(page);
		const state = await readInitialState(page);
		const staleRevision = state.layout.revision;
		const layout = {
			version: state.layout.version,
			revision: staleRevision,
			items: state.layout.items,
		};

		const first = await api(page, 'PUT', '/apps/homecheck/api/layout', { layout });
		expect(first.status).toBe(200);
		expect(first.data.ok).toBe(true);

		const second = await api(page, 'PUT', '/apps/homecheck/api/layout', { layout });
		expect(second.status).toBe(409);
		expect(second.data.ok).toBe(false);
		const fresh = second.data.data && second.data.data.layout;
		expect(fresh).toBeTruthy();
		expect(fresh.revision).toBeGreaterThan(staleRevision);
	});

	test('admin seed template GET/PUT round-trips unchanged', async ({ page }) => {
		await openHomeCheck(page);
		const got = await api(page, 'GET', '/apps/homecheck/api/admin/template');
		expect(got.status).toBe(200);
		expect(got.data.ok).toBe(true);
		const template = got.data.data && got.data.data.template;
		expect(template).toBeTruthy();

		/* PUT the identical template back — proves write path, leaves state intact. */
		const put = await api(page, 'PUT', '/apps/homecheck/api/admin/template', { template });
		expect(put.status).toBe(200);
		expect(put.data.ok).toBe(true);

		const again = await api(page, 'GET', '/apps/homecheck/api/admin/template');
		expect(again.status).toBe(200);
		expect(again.data.ok).toBe(true);
		expect(again.data.data && again.data.data.template).toEqual(template);
	});
});
