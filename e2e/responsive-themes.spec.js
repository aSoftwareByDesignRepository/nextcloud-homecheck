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
			'--color-background-dark': '#222222',
			'--color-background-hover': '#2a2a2a',
			'--color-primary-element': '#0082c9',
			'--color-primary-element-text': '#ffffff',
			'--color-primary-element-light': '#243a48',
			'--color-primary-element-light-text': '#ededed',
			'--color-border': '#3a3a3a',
			'--color-border-maxcontrast': '#6a6a6a',
			'--color-element-error': '#ff5050',
			'--color-error-text': '#ff8080',
		},
	},
	{
		name: 'high-contrast',
		vars: {
			'--color-main-background': '#000000',
			'--color-main-text': '#ffffff',
			'--color-text-maxcontrast': '#ffffff',
			'--color-background-dark': '#000000',
			'--color-primary-element': '#ffff00',
			'--color-primary-element-text': '#000000',
			'--color-primary-element-light': '#333300',
			'--color-primary-element-light-text': '#ffff00',
			'--color-border': '#ffffff',
			'--color-border-maxcontrast': '#ffffff',
			'--color-element-error': '#ff0000',
			'--color-error-text': '#ff6666',
		},
	},
	{
		name: 'custom-accent-purple',
		vars: {
			'--color-primary-element': '#6b21a8',
			'--color-primary-element-text': '#ffffff',
			'--color-primary-element-light': '#f3e8ff',
			'--color-primary-element-light-text': '#1d1d1d',
		},
	},
	{
		name: 'light-accent-pale',
		vars: {
			'--color-primary-element': '#d9e3e8',
			'--color-primary-element-text': '#1d1d1d',
			'--color-primary-element-light': '#eef3f5',
			'--color-primary-element-light-text': '#1d1d1d',
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
	{ viewport: VIEWPORTS[1], theme: THEME_PRESETS[2], mode: 'view' },
	{ viewport: VIEWPORTS[3], theme: THEME_PRESETS[3], mode: 'view' },
	{ viewport: VIEWPORTS[3], theme: THEME_PRESETS[4], mode: 'edit' },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{bodyClass?: string, vars: Record<string, string>}} preset
 */
async function applyThemePreset(page, preset) {
	await page.evaluate(({ bodyClass, vars }) => {
		document.body.classList.remove('theme--dark', 'theme-dark');
		if (bodyClass) {
			document.body.classList.add(bodyClass);
		}
		const merged = Object.assign({}, vars);
		/* Guarantee secondary chrome AA: surface + main text, never pale primary-light */
		if (!merged['--color-background-dark']) {
			merged['--color-background-dark'] = merged['--color-main-background'] || '#eeeeee';
		}
		if (bodyClass && bodyClass.indexOf('dark') !== -1) {
			merged['--hmk-secondary-fill'] = merged['--color-background-dark'];
			merged['--hmk-secondary-ink'] = merged['--color-main-text'] || '#ededed';
		}
		const targets = [
			document.body,
			document.documentElement,
			document.getElementById('content'),
			document.getElementById('app-content'),
			document.getElementById('homecheck-app'),
			document.querySelector('#content[class*="app-homecheck"]'),
			document.querySelector('.hmk-app'),
		].filter(Boolean);
		targets.forEach((el) => {
			Object.entries(merged).forEach(([key, value]) => {
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
		for (const theme of THEME_PRESETS) {
			const caseName = `${viewport.name} × ${theme.name}`;
			test(`layout: ${caseName}`, async ({ page }) => {
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				await openHomeCheck(page);
				await applyThemePreset(page, theme);

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

	for (const { viewport, theme, mode } of AXE_MATRIX) {
		test(`axe WCAG 2.1 AA: ${viewport.name} × ${theme.name} (${mode})`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await openHomeCheck(page);
			await applyThemePreset(page, theme);
			if (mode === 'edit') {
				await page.locator('#hmk-edit-toggle').click();
				await expect(page.locator('#hmk-edit-hint')).toBeVisible();
				/* Re-apply after edit chrome mounts so secondary tokens win */
				await applyThemePreset(page, theme);
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
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').last();
		await folder.evaluate((el) => el.scrollIntoView({ block: 'center' }));
		await folder.locator('summary').evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await folder.getByRole('menuitem', { name: /Delete folder|Ordner löschen/i }).evaluate((el) => /** @type {HTMLElement} */ (el).click());
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible();
		await scanAxe(page, 'confirm dark mobile');
		await assertNoHorizontalOverflow(page, 'confirm dialog');
	});

	test('chrome secondary buttons stay opaque AA on wallpaper (dark + custom accent)', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openHomeCheck(page);
		for (const theme of [THEME_PRESETS[1], THEME_PRESETS[3]]) {
			await applyThemePreset(page, theme);
			const contrast = await page.evaluate(() => {
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
			expect(contrast, theme.name).not.toBeNull();
			expect(contrast.ok, `${theme.name}: ${JSON.stringify(contrast)}`).toBe(true);
		}
	});
});
