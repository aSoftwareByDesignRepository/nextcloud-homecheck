// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck } = require('./helpers');

test.describe('HomeCheck first view — instant clarity', () => {
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
		/* Lives after panes in the scrollable app root — not a pinned viewport bar */
		const inShell = await page.locator('#app-content-wrapper.hmk-shell .hmk-credit, .hmk-shell .hmk-credit').count();
		expect(inShell).toBeGreaterThan(0);
		const color = await credit.evaluate((el) => getComputedStyle(el).color);
		expect(color).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('vendor credit stays reachable after many panes', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 700 });
		/* Force tall content so the credit sits below the fold */
		await page.evaluate(() => {
			const panels = document.getElementById('hmk-panels');
			if (!panels) {
				return;
			}
			const spacer = document.createElement('div');
			spacer.id = 'hmk-e2e-tall-spacer';
			spacer.setAttribute('aria-hidden', 'true');
			spacer.style.cssText = 'width:100%;height:2200px;flex:0 0 auto;pointer-events:none;';
			panels.appendChild(spacer);
		});
		const credit = page.locator('.hmk-credit__link');
		await credit.scrollIntoViewIfNeeded();
		await expect(credit).toBeVisible();
		const layout = await page.evaluate(() => {
			const app = document.getElementById('homecheck-app');
			const shell = document.getElementById('app-content-wrapper');
			const footer = document.querySelector('.hmk-credit');
			const link = document.querySelector('.hmk-credit__link');
			if (!app || !shell || !footer || !link) {
				return null;
			}
			const last = shell.lastElementChild;
			const rect = link.getBoundingClientRect();
			return {
				scrollable: app.scrollHeight > app.clientHeight + 40,
				creditIsLast: last === footer || !!last?.contains(footer),
				linkInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 2,
			};
		});
		expect(layout).not.toBeNull();
		expect(layout.scrollable).toBe(true);
		expect(layout.creditIsLast).toBe(true);
		expect(layout.linkInViewport).toBe(true);
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

	test('Edit primary button uses themed primary fill (not UA gray)', async ({ page }) => {
		const metrics = await page.evaluate(() => {
			const edit = document.querySelector('#hmk-edit-toggle');
			const root = document.documentElement;
			if (!edit) {
				return null;
			}
			const bg = getComputedStyle(edit).backgroundColor;
			const color = getComputedStyle(edit).color;
			const primary = getComputedStyle(root).getPropertyValue('--color-primary-element').trim();
			return { bg, color, primary, className: edit.className };
		});
		expect(metrics).not.toBeNull();
		expect(metrics.className).toContain('primary');
		expect(metrics.bg).not.toBe('rgba(0, 0, 0, 0)');
		expect(metrics.bg).not.toBe('rgb(239, 239, 239)');
		/* color-mix may serialize as rgb() or color(srgb …) depending on engine */
		expect(metrics.bg).toMatch(/^(rgb\(|color\()/);
		expect(metrics.primary.length).toBeGreaterThan(0);
	});

	test('pane icon wells use light primary surface with black glyphs', async ({ page }) => {
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
			if (!well || !img) {
				return null;
			}
			const wellStyle = getComputedStyle(well);
			const imgStyle = getComputedStyle(img);
			const html = getComputedStyle(document.documentElement);
			const light = html.getPropertyValue('--color-primary-element-light').trim();
			const primary = html.getPropertyValue('--color-primary-element').trim();
			const wellRgb = parseRgb(wellStyle.backgroundColor);
			const borderRgb = parseRgb(wellStyle.borderTopColor);
			return {
				wellBg: wellStyle.backgroundColor,
				border: wellStyle.borderTopColor,
				filter: imgStyle.filter,
				opacity: imgStyle.opacity,
				visibility: imgStyle.visibility,
				naturalW: img.naturalWidth,
				light,
				primary,
				blackOnWell: wellRgb ? contrast([0, 0, 0], wellRgb) : 0,
				borderVsWell: wellRgb && borderRgb ? contrast(borderRgb, wellRgb) : 0,
				wellW: well.getBoundingClientRect().width,
				usesInvertSentinel: /var\(--primary-invert/.test(imgStyle.filter),
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.naturalW).toBeGreaterThan(0);
		expect(metrics.visibility).toBe('visible');
		expect(metrics.opacity).not.toBe('0');
		expect(metrics.filter).toMatch(/brightness/i);
		expect(metrics.filter).not.toMatch(/invert/i);
		expect(metrics.usesInvertSentinel).toBe(false);
		expect(metrics.blackOnWell).toBeGreaterThanOrEqual(3);
		expect(metrics.wellW).toBeGreaterThanOrEqual(34);
		/* Well should not be the solid dark primary (that was the muddy/orange path) */
		const hex = metrics.primary.replace('#', '');
		if (hex.length >= 6) {
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			expect(metrics.wellBg).not.toBe(`rgb(${r}, ${g}, ${b})`);
		}
	});

	test('icon filter never depends on NC invert sentinel values', async ({ page }) => {
		await page.evaluate(() => {
			document.documentElement.style.setProperty('--primary-invert-if-bright', 'no');
			document.documentElement.style.setProperty('--primary-invert-if-dark', 'no');
		});
		const metrics = await page.evaluate(() => {
			const img = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon');
			return {
				filter: getComputedStyle(img).filter,
				opacity: getComputedStyle(img).opacity,
				naturalW: img.naturalWidth,
			};
		});
		expect(metrics.filter).toMatch(/brightness/i);
		expect(metrics.opacity).not.toBe('0');
		expect(metrics.naturalW).toBeGreaterThan(0);
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
