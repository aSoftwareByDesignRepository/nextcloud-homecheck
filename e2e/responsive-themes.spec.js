// @ts-check
/**
 * HomeCheck responsive + REAL theme matrix.
 *
 * Learned class (Atlas ds_chrome): theme switching must be REAL — persisted
 * server-side via the theming OCS API, then a fresh navigation, then an
 * assertion on the rendered `body[data-theme-*]` attribute. Painting CSS
 * variables/classes in JS is a fake theme and was rejected (it cannot prove
 * the server-side stylesheet pairing and it silently diverges from what users
 * see). Accent overrides likewise go through the real admin theming ajax
 * endpoint — and are restored afterwards (shared instance).
 */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const crypto = require('crypto');
const {
	login, openHomeCheck, hmkMsg,
	THEME_IDS, setUserThemeOcs, assertRenderedTheme,
	getAccentColor, setAdminAccentColor,
} = require('./helpers');

/** @type {Array<{name: string, width: number, height: number}>} */
const VIEWPORTS = [
	{ name: 'narrow-mobile', width: 320, height: 568 },
	{ name: 'mobile', width: 390, height: 844 },
	{ name: 'tablet', width: 768, height: 1024 },
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'wide', width: 1920, height: 1080 },
];

/** Overflow/touch protocol — extra widths without exploding the theme matrix. */
const PROTOCOL_VIEWPORTS = [
	{ name: 'iphone-se', width: 375, height: 667 },
	{ name: 'iphone-plus', width: 414, height: 896 },
	{ name: 'nc-nav-collapse', width: 1024, height: 768 },
	{ name: 'desktop-1280', width: 1280, height: 800 },
];

/** Real-theme × representative viewport/mode axe proof without N×M explosion. */
const AXE_MATRIX = [
	{ viewport: VIEWPORTS[1], theme: 'default', mode: 'view' },
	{ viewport: VIEWPORTS[1], theme: 'dark', mode: 'edit' },
	{ viewport: VIEWPORTS[1], theme: 'light-highcontrast', mode: 'view' },
	{ viewport: VIEWPORTS[3], theme: 'dark-highcontrast', mode: 'view' },
	{ viewport: VIEWPORTS[3], theme: 'dark', mode: 'edit' },
];

/**
 * Apply a persisted OCS theme and prove it rendered.
 * @param {import('@playwright/test').Page} page
 * @param {string} themeId one of THEME_IDS
 */
async function applyRealTheme(page, themeId) {
	await setUserThemeOcs(page, themeId);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('#homecheck-app').waitFor({ state: 'visible', timeout: 20000 });
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
	await assertRenderedTheme(page, themeId);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function assertNoHorizontalOverflow(page, label) {
	const metrics = await page.evaluate(() => {
		const doc = document.documentElement;
		const app = document.getElementById('homecheck-app');
		return {
			docOverflow: doc.scrollWidth - doc.clientWidth,
			appOverflow: app ? app.scrollWidth - app.clientWidth : 0,
		};
	});
	expect(metrics.docOverflow, `${label} document overflow`).toBeLessThanOrEqual(1);
	expect(metrics.appOverflow, `${label} app overflow`).toBeLessThanOrEqual(1);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function scanAxe(page, label) {
	/* Leave primary CTA so :hover does not pull host --color-primary-element-hover. */
	await page.mouse.move(0, 0);
	const results = await new AxeBuilder({ page })
		.include('#homecheck-app')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations, `${label}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test.describe('HomeCheck responsive + real OCS theme matrix', () => {
	test.describe.configure({ mode: 'serial' }); /* per-user theme is shared state */

	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test.afterEach(async ({ page }) => {
		/* Always restore the default theme for the fixture user — even on
		   failure — so later specs are never theme-poisoned. */
		await setUserThemeOcs(page, 'default').catch(() => {});
	});

	test('wide viewport uses full shell width', async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await openHomeCheck(page);
		const widths = await page.evaluate(() => {
			const shell = document.getElementById('app-content-wrapper');
			const shellRoot = document.getElementById('app-content')
				|| document.querySelector('#content[class*="app-homecheck"]');
			return {
				shell: shell ? shell.getBoundingClientRect().width : 0,
				root: shellRoot ? shellRoot.getBoundingClientRect().width : 0,
				viewport: document.documentElement.clientWidth,
				hasWideShell: shell ? shell.classList.contains('hmk-shell--wide') : false,
				hasAppClass: shellRoot ? shellRoot.classList.contains('hmk-app') : false,
			};
		});
		expect(widths.hasWideShell).toBe(true);
		expect(widths.hasAppClass).toBe(true);
		expect(widths.shell).toBeGreaterThan(900);
		const contentColumn = widths.root > 0 ? widths.root : widths.viewport * 0.65;
		expect(widths.shell / contentColumn).toBeGreaterThan(0.85);
	});

	for (const viewport of VIEWPORTS) {
		for (const themeId of THEME_IDS) {
			const caseName = `${viewport.name} × ${themeId} (ocs)`;
			test(`layout: ${caseName}`, async ({ page }) => {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				await openHomeCheck(page);
				await applyRealTheme(page, themeId);

				await assertNoHorizontalOverflow(page, caseName);
				await expect(page.locator('#hmk-panels .hmk-pane__launch, #hmk-panels .hmk-pane__row-launch').first()).toBeVisible();

				const editBtn = page.locator('#hmk-edit-toggle');
				const box = await editBtn.boundingBox();
				expect(box).not.toBeNull();
				expect(box.height).toBeGreaterThanOrEqual(44);
				expect(box.width).toBeGreaterThanOrEqual(44);

				await editBtn.click();
				await expect(page.locator('#hmk-edit-hint')).toBeVisible();
				await assertNoHorizontalOverflow(page, `${caseName} edit`);
			});
		}
	}

	test('real themes render ≥4 distinct screenshots on the app route', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openHomeCheck(page);
		const sha = {};
		for (const themeId of THEME_IDS) {
			await applyRealTheme(page, themeId);
			const buf = await page.screenshot({ fullPage: false });
			sha[themeId] = crypto.createHash('sha256').update(buf).digest('hex');
		}
		expect(new Set(Object.values(sha)).size, JSON.stringify(sha)).toBe(THEME_IDS.length);
	});

	for (const viewport of PROTOCOL_VIEWPORTS) {
		test(`protocol overflow: ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openHomeCheck(page);
			await assertNoHorizontalOverflow(page, viewport.name);
			const editBtn = page.locator('#hmk-edit-toggle');
			const box = await editBtn.boundingBox();
			expect(box).not.toBeNull();
			expect(box.height).toBeGreaterThanOrEqual(44);
			expect(box.width).toBeGreaterThanOrEqual(44);
			await editBtn.click();
			await expect(page.locator('#hmk-edit-hint')).toBeVisible();
			await assertNoHorizontalOverflow(page, `${viewport.name} edit`);
			const kebab = page.locator('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__menu summary').first();
			await kebab.click();
			const menu = page.locator('#hmk-panels .hmk-pane[data-type="app"] .hmk-menu').first();
			await expect(menu.locator('button').first()).toBeVisible();
			const menuBox = await menu.boundingBox();
			expect(menuBox).not.toBeNull();
			expect(menuBox.x).toBeGreaterThanOrEqual(-1);
			expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width + 1);
			await assertNoHorizontalOverflow(page, `${viewport.name} menu`);
		});
	}

	for (const { viewport, theme, mode } of AXE_MATRIX) {
		test(`axe WCAG 2.1 AA: ${viewport.name} × ${theme} (${mode})`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openHomeCheck(page);
			await applyRealTheme(page, theme);
			if (mode === 'edit') {
				await page.locator('#hmk-edit-toggle').click();
				await expect(page.locator('#hmk-edit-hint')).toBeVisible();
			}
			await scanAxe(page, `${viewport.name}/${theme}/${mode}`);
		});
	}

	test('confirm dialog in real dark theme on mobile passes axe', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openHomeCheck(page);
		await applyRealTheme(page, 'dark');
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await page.waitForResponse(
			(r) => r.url().includes('/api/layout') && r.request().method() === 'PUT',
			{ timeout: 20000 },
		);
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').last();
		await folder.evaluate((el) => el.scrollIntoView({ block: 'center' }));
		await folder.locator('summary').evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await folder.getByRole('menuitem', { name: await hmkMsg(page, 'deleteFolder'), exact: true }).evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await scanAxe(page, 'confirm dark mobile');
		await assertNoHorizontalOverflow(page, 'confirm dialog');
	});

	test('chrome secondary buttons stay opaque AA on Check flat canvas (real dark + real pale accent)', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openHomeCheck(page);
		const measure = async () => page.evaluate(() => {
			const btn = document.querySelector('#hmk-home-toggle');
			if (!btn) {
				return null;
			}
			const cs = getComputedStyle(btn);
			const parse = (c) => {
				const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
			};
			const lum = (rgb) => {
				const n = rgb.map((v) => {
					const s = v / 255;
					return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
				});
				return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
			};
			const fg = parse(cs.color);
			const bg = parse(cs.backgroundColor);
			if (!fg || !bg) {
				return { ok: false, reason: 'unparsed', color: cs.color, backgroundColor: cs.backgroundColor };
			}
			const L1 = lum(fg);
			const L2 = lum(bg);
			const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
			return {
				ok: ratio >= 4.5,
				ratio: Math.round(ratio * 100) / 100,
				color: cs.color,
				backgroundColor: cs.backgroundColor,
			};
		});

		/* Capture the CONFIGURED accent on the default (light) theme BEFORE any
		   theme switch — under dark themes --color-primary-element resolves to a
		   derived bright variant, not the stored color. */
		const originalAccent = await getAccentColor(page);

		// Real persisted dark theme.
		await applyRealTheme(page, 'dark');
		let contrast = await measure();
		expect(contrast, 'dark').not.toBeNull();
		expect(contrast.ok, `dark: ${JSON.stringify(contrast)}`).toBe(true);

		// Real admin accent override (pale) — shared-instance mutation, restored
		// in finally. Proves the fill/ink pairing tracks the real server accent.
		try {
			await setAdminAccentColor(page, '#d9e3e8');
			await setUserThemeOcs(page, 'default');
			await page.reload({ waitUntil: 'domcontentloaded' });
			await page.locator('#homecheck-app').waitFor({ state: 'visible', timeout: 20000 });
			await assertRenderedTheme(page, 'default');
			contrast = await measure();
			expect(contrast, 'pale-accent').not.toBeNull();
			expect(contrast.ok, `pale-accent: ${JSON.stringify(contrast)}`).toBe(true);
		} finally {
			await setAdminAccentColor(page, originalAccent || '#0082c9').catch(() => {});
		}
	});
});
