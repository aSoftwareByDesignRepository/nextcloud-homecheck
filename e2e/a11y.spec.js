// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { login, openHomeCheck, folderCount, folderAt, openFolderCard } = require('./helpers');

async function scan(page, label) {
	const results = await new AxeBuilder({ page })
		.include('#homecheck-app')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations, `${label} a11y violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test.describe('HomeCheck accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('view mode passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		await scan(page, 'view mode');
	});

	test('edit mode passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await scan(page, 'edit mode');
	});

	test('folder dialog passes axe WCAG 2.1 AA', async ({ page }) => {
		await openHomeCheck(page);
		await page.locator('#hmk-edit-toggle').click();
		const count = await folderCount(page);
		if (count > 0) {
			await openFolderCard(folderAt(page, 0));
		} else {
			const before = await folderCount(page);
			await page.locator('#hmk-new-folder').click();
			await expect(page.locator('#hmk-status')).toContainText(/Saved|Gespeichert/i, { timeout: 15000 });
			await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 1);
			await openFolderCard(folderAt(page, before));
		}
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		await scan(page, 'folder dialog');
	});

	test('keyboard: skip link and edit toggle', async ({ page }) => {
		await openHomeCheck(page);
		const skip = page.locator('.hmk-skip');
		await skip.focus();
		await expect(skip).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('#hmk-main')).toBeFocused();
		await page.locator('#hmk-edit-toggle').focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#homecheck-app')).toHaveClass(/is-editing/);
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
	});

	/**
	 * Regression: body:has Check-canvas washout made NC #header (transparent +
	 * white ink) unreadable. Canvas must stay on content; body keeps theming.
	 */
	test('host NC header stays readable over themed body (not Check canvas)', async ({ page }) => {
		await openHomeCheck(page);
		const metrics = await page.evaluate(() => {
			function parseRgb(s) {
				const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
				if (!m) {
					return null;
				}
				const a = m[4] === undefined ? 1 : Number(m[4]);
				if (a < 0.2) {
					return null;
				}
				return [Number(m[1]), Number(m[2]), Number(m[3])];
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
			const body = document.body;
			const header = document.getElementById('header');
			const content = document.querySelector('#content.app-homecheck, #app-content.hmk-app');
			const inkEl = document.querySelector(
				'#header .app-menu__current-app, #header .app-menu__waffle, #header .header-appname, #header button.button-vue',
			);
			if (!body || !header || !content || !inkEl) {
				return { ok: false, reason: 'missing nodes' };
			}
			const bodyBg = parseRgb(getComputedStyle(body).backgroundColor);
			const contentBg = parseRgb(getComputedStyle(content).backgroundColor);
			const ink = parseRgb(getComputedStyle(inkEl).color);
			const hr = header.getBoundingClientRect();
			const topEl = document.elementFromPoint(hr.left + hr.width / 2, hr.top + Math.max(8, hr.height / 2));
			const checkLight = [245, 247, 251];
			return {
				ok: true,
				bodyBg,
				contentBg,
				ink,
				bodyImage: getComputedStyle(body).backgroundImage,
				contentImage: getComputedStyle(content).backgroundImage,
				bodyVsCheck: bodyBg ? Math.hypot(bodyBg[0] - checkLight[0], bodyBg[1] - checkLight[1], bodyBg[2] - checkLight[2]) : null,
				inkOnBody: bodyBg && ink ? contrast(ink, bodyBg) : null,
				headerHit: !!(topEl && header.contains(topEl)),
				headerVisible: getComputedStyle(header).visibility === 'visible'
					&& getComputedStyle(header).display !== 'none'
					&& Number(getComputedStyle(header).opacity) > 0.9,
			};
		});
		expect(metrics.ok, metrics.reason || 'metrics').toBe(true);
		expect(metrics.headerVisible).toBe(true);
		expect(metrics.headerHit).toBe(true);
		/* Body must not be the flat Check light canvas (#f5f7fb) */
		expect(metrics.bodyVsCheck).toBeGreaterThan(20);
		/* Content keeps flat canvas (no wallpaper stage) */
		expect(metrics.contentImage).toBe('none');
		expect(metrics.contentBg).not.toBeNull();
		/* Header ink vs themed body: WCAG AA for UI text (≥4.5:1); allow ≥3 if large chrome */
		expect(metrics.inkOnBody).toBeGreaterThanOrEqual(3);
	});
});
