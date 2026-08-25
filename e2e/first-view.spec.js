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

	test('pane icons use primary fill and theme invert filter', async ({ page }) => {
		const metrics = await page.evaluate(() => {
			const img = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon');
			if (!img) {
				return null;
			}
			const style = getComputedStyle(img);
			const box = img.getBoundingClientRect();
			return {
				w: box.width,
				h: box.height,
				filter: style.filter,
				bg: style.backgroundColor,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.w).toBeGreaterThanOrEqual(28);
		expect(metrics.h).toBeGreaterThanOrEqual(28);
		expect(metrics.filter === 'none' || metrics.filter === '').toBe(false);
		expect(metrics.bg).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('pane icons stay inverted under dark theme', async ({ page }) => {
		await page.evaluate(() => {
			document.body.classList.add('theme--dark');
			document.documentElement.style.setProperty('--color-main-background', '#181818');
			document.documentElement.style.setProperty('--color-main-text', '#ededed');
			document.documentElement.style.setProperty('--color-primary-element', '#0082c9');
			document.documentElement.style.setProperty('--color-primary-element-text', '#ffffff');
			document.documentElement.style.setProperty('--primary-invert-if-dark', 'invert(100%)');
		});
		const metrics = await page.evaluate(() => {
			const img = document.querySelector('#hmk-panels .hmk-pane[data-type="app"] .hmk-pane__launch .hmk-pane__icon');
			if (!img) {
				return null;
			}
			return {
				filter: getComputedStyle(img).filter,
				bg: getComputedStyle(img).backgroundColor,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.filter).toMatch(/invert/i);
		expect(metrics.bg).not.toBe('rgba(0, 0, 0, 0)');
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
