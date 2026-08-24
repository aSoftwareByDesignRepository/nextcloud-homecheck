// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck } = require('./helpers');

/** @type {Array<{name: string, bodyClass?: string, vars: Record<string, string>}>} */
const THEME_PRESETS = [
	{ name: 'default-light', vars: {} },
	{
		name: 'dark',
		bodyClass: 'theme--dark',
		vars: {
			'--color-main-background': '#181818',
			'--color-main-text': '#ededed',
			'--color-text-maxcontrast': '#a8a8a8',
			'--color-primary-element': '#0082c9',
			'--color-primary-element-text': '#ffffff',
			'--color-border': '#3a3a3a',
			'--color-border-maxcontrast': '#6a6a6a',
			'--color-element-error': '#ff5050',
			'--color-error-text': '#ff8080',
		},
	},
	{
		name: 'custom-accent-purple',
		vars: {
			'--color-primary-element': '#6b21a8',
			'--color-primary-element-text': '#ffffff',
		},
	},
	{
		name: 'light-accent-pale',
		vars: {
			'--color-primary-element': '#d9e3e8',
			'--color-primary-element-text': '#1d1d1d',
			'--color-main-background': '#ffffff',
			'--color-main-text': '#1d1d1d',
		},
	},
];

/** @type {Array<{name: string, width: number, height: number}>} */
const VIEWPORTS = [
	{ name: 'narrow-mobile', width: 320, height: 568 },
	{ name: 'mobile', width: 390, height: 844 },
	{ name: 'tablet', width: 768, height: 1024 },
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'wide', width: 1920, height: 1080 },
];

/** Representative axe cases — full WCAG proof without N×M explosion */
const AXE_MATRIX = [
	{ viewport: VIEWPORTS[1], theme: THEME_PRESETS[0], mode: 'view' },
	{ viewport: VIEWPORTS[1], theme: THEME_PRESETS[1], mode: 'edit' },
	{ viewport: VIEWPORTS[3], theme: THEME_PRESETS[2], mode: 'view' },
	{ viewport: VIEWPORTS[3], theme: THEME_PRESETS[3], mode: 'edit' },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{bodyClass?: string, vars: Record<string, string>}} preset
 */
async function applyThemePreset(page, preset) {
	await page.evaluate(({ bodyClass, vars }) => {
		document.body.classList.remove('theme--dark');
		if (bodyClass) {
			document.body.classList.add(bodyClass);
		}
		const targets = [document.body, document.documentElement];
		const app = document.getElementById('homecheck-app');
		if (app) {
			targets.push(app);
		}
		targets.forEach((el) => {
			Object.entries(vars).forEach(([key, value]) => {
				el.style.setProperty(key, value);
			});
		});
	}, { bodyClass: preset.bodyClass, vars: preset.vars });
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
	const results = await new AxeBuilder({ page })
		.include('#homecheck-app')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations, `${label}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test.describe('HomeCheck responsive + theme matrix', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	for (const viewport of VIEWPORTS) {
		for (const theme of THEME_PRESETS) {
			const caseName = `${viewport.name} × ${theme.name}`;
			test(`layout: ${caseName}`, async ({ page }) => {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				await openHomeCheck(page);
				await applyThemePreset(page, theme);

				await assertNoHorizontalOverflow(page, caseName);
				await expect(page.locator('#hmk-grid .hmk-card__launch').first()).toBeVisible();

				const editBtn = page.locator('#hmk-edit-toggle');
				const box = await editBtn.boundingBox();
				expect(box).not.toBeNull();
				expect(box.height).toBeGreaterThanOrEqual(44);
				expect(box.width).toBeGreaterThanOrEqual(44);

				await editBtn.click();
				await expect(page.locator('#hmk-edit-banner')).toBeVisible();
				await assertNoHorizontalOverflow(page, `${caseName} edit`);
			});
		}
	}

	for (const { viewport, theme, mode } of AXE_MATRIX) {
		test(`axe WCAG 2.1 AA: ${viewport.name} × ${theme.name} (${mode})`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openHomeCheck(page);
			await applyThemePreset(page, theme);
			if (mode === 'edit') {
				await page.locator('#hmk-edit-toggle').click();
				await expect(page.locator('#hmk-edit-banner')).toBeVisible();
			}
			await scanAxe(page, `${viewport.name}/${theme.name}/${mode}`);
		});
	}

	test('confirm dialog in dark theme on mobile passes axe', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openHomeCheck(page);
		await applyThemePreset(page, THEME_PRESETS[1]);
		await page.locator('#hmk-edit-toggle').click();
		await page.locator('#hmk-new-folder').click();
		await page.waitForResponse(
			(r) => r.url().includes('/api/layout') && r.request().method() === 'PUT',
			{ timeout: 20000 },
		);
		const folder = page.locator('#hmk-grid .hmk-card[data-type="folder"]').last();
		await folder.evaluate((el) => el.scrollIntoView({ block: 'center' }));
		await folder.locator('summary').evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await folder.getByRole('menuitem', { name: /Delete folder|Ordner löschen/i }).evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await scanAxe(page, 'confirm dark mobile');
		await assertNoHorizontalOverflow(page, 'confirm dialog');
	});
});
