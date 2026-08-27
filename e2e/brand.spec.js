// @ts-check
const { test, expect } = require('@playwright/test');
const { login, openHomeCheck } = require('./helpers');

/**
 * Brand freeze: user-facing product name is HomeCheck (never AppHome/AppCheck).
 * App id remains homecheck.
 */
test.describe('HomeCheck brand freeze', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('launcher chrome shows HomeCheck, never retired names', async ({ page }) => {
		await openHomeCheck(page);
		const title = page.locator('#hmk-page-title');
		await expect(title).toHaveText('HomeCheck');
		await expect(page.locator('header.hmk-chrome')).toHaveAttribute('aria-label', 'HomeCheck');

		const bodyText = await page.locator('#homecheck-app').innerText();
		expect(bodyText).not.toMatch(/AppHome|AppCheck/);

		/* Top-bar / app menu entry for this app */
		const nav = page.locator('#appmenu a[href*="apps/homecheck"], #header a[href*="apps/homecheck"], nav a[href*="apps/homecheck"]').first();
		if (await nav.count()) {
			const navText = (await nav.innerText()).trim();
			if (navText.length > 0) {
				expect(navText).toMatch(/HomeCheck/i);
				expect(navText).not.toMatch(/AppHome|AppCheck/);
			}
		}
	});

	test('admin settings section titled HomeCheck', async ({ page }) => {
		const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
		/* Seed UI lives under Additional settings (ISettings section = additional). */
		await page.goto(base + '/index.php/settings/admin/additional');
		await page.waitForLoadState('domcontentloaded');
		const admin = page.locator('#hmk-admin');
		await expect(admin).toBeVisible({ timeout: 20000 });
		await expect(admin.locator('h2')).toHaveText('HomeCheck');
		const sectionText = await admin.innerText();
		expect(sectionText).toMatch(/HomeCheck/);
		expect(sectionText).not.toMatch(/AppHome|AppCheck/);
	});
});
