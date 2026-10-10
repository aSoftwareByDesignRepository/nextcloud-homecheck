// @ts-check
/**
 * ATLAS_UI_INVARIANTS — HomeCheck representative surfaces.
 *
 * Wires the shared invariant helpers (_shared/e2e/atlas-ui-invariants.js)
 * against the two shipping surfaces: the launcher page (#homecheck-app) and
 * the admin seed settings (#hmk-admin). Classes covered:
 *   stored_xss_unescaped · a11y_dom_violations · mutation_freshness ·
 *   double_submit_dup · form_data_loss_on_5xx · n_plus_one_requests ·
 *   console_error_silent_degrade · raw_i18n_key_rendered
 *
 * XSS note: folder names are the only user free-text stored+rendered; the
 * server validator (LayoutValidator::NAME_PATTERN + explicit </> reject)
 * refuses every ATLAS_XSS_PAYLOADS member at the write boundary — the spec
 * proves the rejection live, then still sweeps the rendered DOM.
 */
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck, resetLayoutToFlatApps, hmkMsg } = require('./helpers');
const {
	ATLAS_XSS_PAYLOADS,
	assertNoInjection,
	assertA11yDom,
	assertSurfaceFresh,
	assertNoDuplicateSubmit,
	assertFormSurvivesFailure,
	countApiRequests,
	trackConsoleErrors,
	assertNoConsoleErrors,
	assertNoRawI18nKeys,
} = require('../../_shared/e2e/atlas-ui-invariants');

const BASE = (process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
const LAYOUT_API = '/apps/homecheck/api/layout';
const ADMIN_API = '/apps/homecheck/api/admin/template';

/** PUT /api/layout inside the page (carries session + requesttoken). */
async function apiPutLayout(page, items, revision) {
	return page.evaluate(async ({ items, revision }) => {
		const token = (window.OC && window.OC.requestToken) || '';
		const res = await fetch('/index.php/apps/homecheck/api/layout', {
			method: 'PUT',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', requesttoken: token, Accept: 'application/json' },
			body: JSON.stringify({ requesttoken: token, layout: { version: 1, revision, items } }),
		});
		return { status: res.status, data: await res.json() };
	}, { items, revision });
}

test.describe('ATLAS_UI_INVARIANTS', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('launcher: console clean, a11y DOM, raw i18n keys, O(1) API calls', async ({ page }) => {
		const errs = trackConsoleErrors(page);
		await openHomeCheck(page);

		const a11y = await assertA11yDom(page, {
			content: '#homecheck-app',
			/* .hmk-skip is the focus-to-expand skip link (1×1 clipped until
			   :focus — canonical a11y pattern, not a hit-target defect);
			   .hmk-credit/.hmk-nav-footer host small footer links. */
			sizeAllow: '.hmk-skip, .hmk-credit, .hmk-nav-footer',
		});
		expect(a11y, 'a11y DOM findings').toEqual([]);

		await assertNoRawI18nKeys(page, { content: '#homecheck-app' });

		const reqs = await countApiRequests(
			page,
			() => page.reload({ waitUntil: 'domcontentloaded' }).then(() =>
				page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 })),
			'/apps/homecheck/api/',
		);
		const gets = reqs.filter((r) => r.method === 'GET');
		/* The initial layout is server-embedded in #hmk-initial-state — 0 API
		   calls is the ideal; at most 1 refetch is acceptable. O(n) is the
		   defect this guards. */
		expect(gets.length, `list load must be O(1) — got ${gets.map((g) => g.url).join(', ')}`).toBeLessThanOrEqual(1);

		assertNoConsoleErrors(errs, { allow: [/favicon/i] });
	});

	test('stored-xss: every payload rejected at write boundary; DOM stays clean', async ({ page }) => {
		await openHomeCheck(page);
		const revision = await page.evaluate(() => {
			const raw = document.getElementById('hmk-initial-state');
			return JSON.parse(raw.textContent).layout.revision;
		});
		const baseItems = await page.evaluate(() => {
			const raw = document.getElementById('hmk-initial-state');
			return JSON.parse(raw.textContent).layout.items;
		});
		let rev = revision;
		for (const payload of ATLAS_XSS_PAYLOADS) {
			const items = baseItems.concat([{ type: 'folder', id: 'fld_xssprobe01', name: payload, children: [] }]);
			const out = await apiPutLayout(page, items, rev);
			/* The payload may never be persisted: 400 is the only acceptable
			   outcome. A 200 with the folder merged back would be the defect. */
			expect(out.status, `XSS payload must be rejected: ${payload.slice(0, 30)}`).toBe(400);
			expect(out.data.ok).toBe(false);
		}
		await assertNoInjection(page);
	});

	test('mutation freshness: API-created folder renders after reload', async ({ page }) => {
		await resetLayoutToFlatApps(page);
		const stamp = 'Atlas' + Math.random().toString(36).slice(2, 8);
		const state = await page.evaluate(() => JSON.parse(document.getElementById('hmk-initial-state').textContent));
		const fid = 'fld_atlas' + Math.random().toString(36).slice(2, 10);
		const items = state.layout.items.concat([{ type: 'folder', id: fid, name: stamp, children: [] }]);

		await assertSurfaceFresh(page, {
			mutate: async () => {
				const out = await apiPutLayout(page, items, state.layout.revision);
				if (!(out.status === 200 && out.data.ok)) {
					throw new Error('mutation failed: ' + JSON.stringify(out));
				}
			},
			visit: async () => {
				await page.reload({ waitUntil: 'domcontentloaded' });
				await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
			},
			expect: { present: stamp },
			content: '#homecheck-app',
		});

		/* cleanup — restore flat layout (server-side re-read for revision) */
		const after = await page.evaluate(() => JSON.parse(document.getElementById('hmk-initial-state').textContent));
		await apiPutLayout(page, after.layout.items.filter((i) => i.id !== fid), after.layout.revision);
	});

	test('double-submit: rename prompt emits at most one PUT', async ({ page }) => {
		await resetLayoutToFlatApps(page);
		/* create a folder to rename */
		const state = await page.evaluate(() => JSON.parse(document.getElementById('hmk-initial-state').textContent));
		const fid = 'fld_dblsub' + Math.random().toString(36).slice(2, 8);
		const out = await apiPutLayout(
			page,
			state.layout.items.concat([{ type: 'folder', id: fid, name: 'DblSubProbe', children: [] }]),
			state.layout.revision,
		);
		expect(out.status).toBe(200);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });

		/* enter edit mode, open rename prompt on the probe folder */
		await page.locator('#hmk-edit-toggle').click();
		const pane = page.locator(`#hmk-panels .hmk-pane[data-id="${fid}"]`);
		await pane.locator('summary').first().evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await pane.getByRole('menuitem', { name: await hmkMsg(page, 'rename') }).evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await expect(page.locator('#hmk-prompt-dialog[open]')).toBeVisible();
		await page.locator('#hmk-prompt-input').fill('DblSubProbe2');

		let puts = 0;
		const onReq = (req) => { if (req.method() === 'PUT' && req.url().includes(LAYOUT_API)) { puts += 1; } };
		page.on('request', onReq);
		try {
			await assertNoDuplicateSubmit(page, {
				mutatingUrl: LAYOUT_API,
				method: 'PUT',
				submit: () => page.locator('#hmk-prompt-ok').evaluate((el) => /** @type {HTMLElement} */ (el).click()),
			});
			/* debounced save (500 ms) — give it a beat, still ≤1 write */
			await page.waitForTimeout(1200);
		} finally {
			page.off('request', onReq);
		}
		expect(puts, `rename emitted ${puts} PUTs`).toBeLessThanOrEqual(1);

		/* cleanup */
		const after = await page.evaluate(() => JSON.parse(document.getElementById('hmk-initial-state').textContent));
		await apiPutLayout(page, after.layout.items.filter((i) => i.id !== fid), after.layout.revision);
	});

	test('admin: a11y DOM + form survives injected 500 + double-submit guard', async ({ page }) => {
		const response = await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' });
		test.skip(response?.status() !== 200, 'fixture user is not admin — admin section unreachable');
		await expect(page.locator('#hmk-admin')).toBeVisible({ timeout: 20000 });
		await page.locator('#hmk-admin').scrollIntoViewIfNeeded();

		const a11y = await assertA11yDom(page, { content: '#hmk-admin' });
		expect(a11y, 'admin a11y DOM findings').toEqual([]);

		/* form_data_loss_on_5xx — injected server failure must keep the draft */
		const draft = '{"version":1,"revision":0,"items":[{"type":"app","id":"files"}]}';
		await assertFormSurvivesFailure(page, {
			failUrl: ADMIN_API,
			method: 'PUT',
			fields: { '#hmk-admin-json': draft },
			submit: () => page.locator('#hmk-admin-save').click(),
			errorSel: '#hmk-admin-error',
		});
		await expect(page.locator('#hmk-admin-json')).toHaveValue(draft);

		/* double_submit_dup — in-flight guard on #hmk-admin-save */
		await page.locator('#hmk-admin-json').fill(draft);
		await assertNoDuplicateSubmit(page, {
			mutatingUrl: ADMIN_API,
			method: 'PUT',
			submit: () => page.locator('#hmk-admin-save').click(),
		});
	});
});
