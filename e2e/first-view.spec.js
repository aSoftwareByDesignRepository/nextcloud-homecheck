// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck } = require('./helpers');

test.describe('AppHome first view — instant clarity', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await openHomeCheck(page);
	});

	test('vendor credit after panes links to Software by Design site', async ({ page }) => {
		const credit = page.locator('.hmk-credit__link');
		await expect(credit).toBeVisible();
		await expect(credit).toHaveAttribute('href', 'https://nextcloud.software-by-design.de/');
		await expect(credit).toHaveAttribute('target', '_blank');
		await expect(credit).toHaveAttribute('rel', /noopener/);
		/* Lives in the scrollable shell after panes — not a pinned viewport bar */
		const inShell = await page.locator('#app-content-wrapper.hmk-shell .hmk-credit, .hmk-shell .hmk-credit').count();
		expect(inShell).toBeGreaterThan(0);
		const color = await credit.evaluate((el) => getComputedStyle(el).color);
		expect(color).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('app panes and Edit control visible immediately', async ({ page }) => {
		const panels = page.locator('#hmk-panels');
		const panes = panels.locator('.hmk-pane');
		await expect(panels).toBeVisible();
		expect(await panes.count()).toBeGreaterThan(0);
		await expect(page.locator('#hmk-edit-toggle')).toBeVisible();
		await expect(page.locator('#hmk-edit-hint')).toBeHidden();
	});

	test('dashboard chrome: greeting + individual frosted panes', async ({ page }) => {
		const greeting = page.locator('#hmk-greeting');
		await expect(greeting).toBeVisible();
		const text = (await greeting.textContent() || '').trim();
		expect(text.length).toBeGreaterThan(2);
		await expect(page.locator('.hmk-pane').first()).toBeVisible();
		const chrome = await page.evaluate(() => {
			const root = document.querySelector('#content.app-homecheck, #app-content.hmk-app');
			const pane = document.querySelector('.hmk-pane');
			if (!root || !pane) {
				return null;
			}
			const rootStyle = getComputedStyle(root);
			const paneStyle = getComputedStyle(pane);
			return {
				rootBgImage: rootStyle.backgroundImage,
				paneBg: paneStyle.backgroundColor,
				paneRadius: paneStyle.borderRadius,
				paneW: pane.getBoundingClientRect().width,
			};
		});
		expect(chrome).not.toBeNull();
		expect(chrome.paneRadius).not.toBe('0px');
		expect(chrome.paneW).toBeGreaterThan(200);
		expect(chrome.paneW).toBeLessThanOrEqual(360);
	});

	test('edit mode shows hint and New folder without losing panes', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		await expect(page.locator('#hmk-panels .hmk-pane').first()).toBeVisible();
	});

	test('Edit primary button uses Nextcloud primary element color', async ({ page }) => {
		const metrics = await page.evaluate(() => {
			const edit = document.querySelector('#hmk-edit-toggle');
			const root = document.documentElement;
			if (!edit) {
				return null;
			}
			const bg = getComputedStyle(edit).backgroundColor;
			const primary = getComputedStyle(root).getPropertyValue('--color-primary-element').trim();
			return { bg, primary, className: edit.className };
		});
		expect(metrics).not.toBeNull();
		expect(metrics.className).toContain('primary');
		expect(metrics.bg).not.toBe('rgba(0, 0, 0, 0)');
		expect(metrics.bg).not.toBe('rgb(239, 239, 239)');
		/* Parse #rrggbb primary into rgb and require edit button matches */
		const hex = metrics.primary.replace('#', '');
		expect(hex.length).toBeGreaterThanOrEqual(6);
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		expect(metrics.bg).toBe(`rgb(${r}, ${g}, ${b})`);
	});

	test('pane icon wells keep primary fill with forced white glyphs', async ({ page }) => {
		const metrics = await page.evaluate(() => {
			function parseRgb(s) {
				const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
			}
			function relLum(rgb) {
				const f = (c) => {
					c /= 255;
					return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
				};
				return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
			}
			function contrast(a, b) {
				const L1 = relLum(a);
				const L2 = relLum(b);
				const hi = Math.max(L1, L2);
				const lo = Math.min(L1, L2);
				return (hi + 0.05) / (lo + 0.05);
			}
			const well = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon-well');
			const img = well && well.querySelector('.hmk-pane__icon');
			const pane = document.querySelector('#hmk-panels .hmk-pane[data-type="app"]');
			if (!well || !img || !pane) {
				return null;
			}
			const wellStyle = getComputedStyle(well);
			const imgStyle = getComputedStyle(img);
			const html = getComputedStyle(document.documentElement);
			const primary = html.getPropertyValue('--color-primary-element').trim();
			const hex = primary.replace('#', '');
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			const wellRgb = parseRgb(wellStyle.backgroundColor) || [r, g, b];
			const paneRgb = parseRgb(getComputedStyle(pane).backgroundColor)
				|| parseRgb(html.getPropertyValue('--color-main-background'))
				|| [255, 255, 255];
			const filter = imgStyle.filter || '';
			return {
				wellBg: wellStyle.backgroundColor,
				expected: `rgb(${r}, ${g}, ${b})`,
				wellFilter: wellStyle.filter,
				imgFilter: filter,
				imgOpacity: imgStyle.opacity,
				imgVisibility: imgStyle.visibility,
				naturalW: img.naturalWidth,
				wellVsPane: contrast(wellRgb, paneRgb),
				whiteOnPrimary: contrast([255, 255, 255], wellRgb),
				wellW: well.getBoundingClientRect().width,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.wellBg).toBe(metrics.expected);
		expect(metrics.wellFilter === 'none' || metrics.wellFilter === '').toBe(true);
		expect(metrics.imgFilter).toMatch(/brightness/i);
		expect(metrics.imgFilter).toMatch(/invert/i);
		expect(metrics.imgOpacity).toBe('1');
		expect(metrics.imgVisibility).toBe('visible');
		expect(metrics.naturalW).toBeGreaterThan(0);
		expect(metrics.wellVsPane).toBeGreaterThanOrEqual(3);
		expect(metrics.whiteOnPrimary).toBeGreaterThanOrEqual(3);
		expect(metrics.wellW).toBeGreaterThanOrEqual(34);
	});

	test('forced white glyph filter stays active for dark and bright primary wells', async ({ page }) => {
		await page.evaluate(() => {
			document.documentElement.style.setProperty('--color-primary-element', '#00679e');
			document.documentElement.style.setProperty('--primary-invert-if-bright', 'no');
			document.documentElement.style.setProperty('--primary-invert-if-dark', 'invert(100%)');
		});
		let metrics = await page.evaluate(() => {
			const well = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon-well');
			const img = well && well.querySelector('.hmk-pane__icon');
			return {
				wellBg: getComputedStyle(well).backgroundColor,
				filter: getComputedStyle(img).filter,
			};
		});
		expect(metrics.wellBg).toBe('rgb(0, 103, 158)');
		expect(metrics.filter).toMatch(/brightness/i);
		expect(metrics.filter).toMatch(/invert/i);

		await page.evaluate(() => {
			document.documentElement.style.setProperty('--color-primary-element', '#f4f4f4');
			document.documentElement.style.setProperty('--primary-invert-if-bright', 'invert(100%)');
			document.documentElement.style.setProperty('--primary-invert-if-dark', 'no');
		});
		metrics = await page.evaluate(() => {
			const well = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon-well');
			const img = well && well.querySelector('.hmk-pane__icon');
			return {
				wellBg: getComputedStyle(well).backgroundColor,
				filter: getComputedStyle(img).filter,
			};
		});
		expect(metrics.wellBg).toBe('rgb(244, 244, 244)');
		expect(metrics.filter).toMatch(/brightness/i);
		expect(metrics.filter).toMatch(/invert/i);
	});

	test('view mode passes axe on first paint region', async ({ page }) => {
		const results = await new AxeBuilder({ page })
			.include('#homecheck-app')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test('keyboard reachability: skip link → main → edit', async ({ page }) => {
		await page.locator('.hmk-skip').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#hmk-main')).toBeFocused();
		await page.locator('#hmk-edit-toggle').focus();
		await expect(page.locator('#hmk-edit-toggle')).toBeFocused();
	});
});
