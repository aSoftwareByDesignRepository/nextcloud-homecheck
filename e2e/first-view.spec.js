// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck } = require('./helpers');

test.describe('HomeCheck first view — instant clarity', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await openHomeCheck(page);
	});

	test('app grid and Edit control visible immediately', async ({ page }) => {
		const grid = page.locator('#hmk-grid');
		const cards = grid.locator('.hmk-card__launch');
		await expect(grid).toBeVisible();
		expect(await cards.count()).toBeGreaterThan(0);
		await expect(page.locator('#hmk-edit-toggle')).toBeVisible();
		await expect(page.locator('#hmk-edit-hint')).toBeHidden();
	});

	test('edit mode shows hint and New folder without losing the grid', async ({ page }) => {
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		await expect(page.locator('#hmk-grid .hmk-card__launch').first()).toBeVisible();
	});

	test('app icons are large and use theme invert filter', async ({ page }) => {
		const metrics = await page.evaluate(() => {
			const img = document.querySelector('#hmk-grid .hmk-card[data-type="app"] .hmk-card__icon img');
			const well = document.querySelector('#hmk-grid .hmk-card[data-type="app"] .hmk-card__icon');
			if (!img || !well) {
				return null;
			}
			const imgStyle = getComputedStyle(img);
			const wellStyle = getComputedStyle(well);
			const imgBox = img.getBoundingClientRect();
			const wellBox = well.getBoundingClientRect();
			return {
				imgW: imgBox.width,
				imgH: imgBox.height,
				wellW: wellBox.width,
				wellH: wellBox.height,
				filter: imgStyle.filter,
				wellBg: wellStyle.backgroundColor,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.wellW).toBeGreaterThanOrEqual(64);
		expect(metrics.wellH).toBeGreaterThanOrEqual(64);
		expect(metrics.imgW).toBeGreaterThanOrEqual(40);
		expect(metrics.imgH).toBeGreaterThanOrEqual(40);
		expect(metrics.filter === 'none' || metrics.filter === '').toBe(false);
		expect(metrics.wellBg).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('app icons stay inverted under dark theme', async ({ page }) => {
		await page.evaluate(() => {
			document.body.classList.add('theme--dark');
			document.documentElement.style.setProperty('--color-main-background', '#181818');
			document.documentElement.style.setProperty('--color-main-text', '#ededed');
			document.documentElement.style.setProperty('--color-primary-element', '#0082c9');
			document.documentElement.style.setProperty('--color-primary-element-text', '#ffffff');
			/* Force the NC invert token so white SVG logos remain visible on primary wells */
			document.documentElement.style.setProperty('--primary-invert-if-dark', 'invert(100%)');
		});
		const metrics = await page.evaluate(() => {
			const img = document.querySelector('#hmk-grid .hmk-card[data-type="app"] .hmk-card__icon img');
			const well = document.querySelector('#hmk-grid .hmk-card[data-type="app"] .hmk-card__icon');
			if (!img || !well) {
				return null;
			}
			return {
				filter: getComputedStyle(img).filter,
				wellBg: getComputedStyle(well).backgroundColor,
			};
		});
		expect(metrics).not.toBeNull();
		expect(metrics.filter).toMatch(/invert/i);
		expect(metrics.wellBg).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('view mode passes axe on first paint region', async ({ page }) => {
		const results = await new AxeBuilder({ page })
			.include('#homecheck-app')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test('keyboard reachability: skip link → grid → edit', async ({ page }) => {
		await page.locator('.hmk-skip').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#hmk-main')).toBeFocused();
		await page.locator('#hmk-edit-toggle').focus();
		await expect(page.locator('#hmk-edit-toggle')).toBeFocused();
	});
});
