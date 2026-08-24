// @ts-check
/** Shared Playwright helpers for HomeCheck e2e journeys. */

/**
 * @param {import('@playwright/test').Page} page
 */
async function login(page) {
	const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
	const user = process.env.HOMECHECK_E2E_USER || 'admin';
	const pass = process.env.HOMECHECK_E2E_PASS || 'adminadmin';

	await page.goto(base + '/index.php/apps/homecheck/', { waitUntil: 'domcontentloaded' });
	if (await page.locator('#homecheck-app').isVisible().catch(function () { return false; })) {
		return;
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
		/* NC 34 login is a Vue app — wait for hydrated fields, not the shell HTML. */
		const userInput = page.locator('#user, input[name="user"]').first();
		try {
			await userInput.waitFor({ state: 'visible', timeout: 45000 });
		} catch (err) {
			if (attempt === 2) {
				throw err;
			}
			continue;
		}
		await userInput.fill(user);
		await page.locator('#password, input[name="password"]').first().fill(pass);
		await page.locator('button[type="submit"], input[type="submit"], button.login-button').first().click();
		try {
			await page.waitForURL(/apps\/|index\.php\/apps/, { timeout: 45000 });
			return;
		} catch (err) {
			if (attempt === 2) {
				throw err;
			}
		}
	}
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openHomeCheck(page) {
	const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
	await page.goto(base + '/index.php/apps/homecheck/');
	await page.locator('#homecheck-app').waitFor({ state: 'visible', timeout: 20000 });
	await page.locator('#hmk-grid .hmk-card__launch').first().waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function folderCount(page) {
	return page.locator('#hmk-grid .hmk-card[data-type="folder"]').count();
}

/**
 * Folder card created most recently (by index after count bump).
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
function folderAt(page, index) {
	return page.locator('#hmk-grid .hmk-card[data-type="folder"]').nth(index);
}

/**
 * @param {import('@playwright/test').Locator} card
 * @param {RegExp} name
 */
async function clickCardMenuItem(card, name) {
	await card.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
	await card.locator('summary').evaluate((el) => /** @type {HTMLElement} */ (el).click());
	const item = card.getByRole('menuitem', { name: name });
	await item.waitFor({ state: 'visible', timeout: 5000 });
	await item.evaluate((el) => /** @type {HTMLElement} */ (el).click());
}

/**
 * @param {import('@playwright/test').Locator} folderCard
 */
async function openFolderCard(folderCard) {
	await folderCard.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
	await folderCard.locator('.hmk-card__launch').evaluate((el) => /** @type {HTMLElement} */ (el).click());
}

/**
 * Reset layout to flat apps only (clears test folder buildup).
 * @param {import('@playwright/test').Page} page
 */
async function resetLayoutToFlatApps(page) {
	await openHomeCheck(page);
	await page.evaluate(async () => {
		const readState = function () {
			const raw = document.getElementById('hmk-initial-state');
			if (!raw || !raw.textContent) {
				throw new Error('missing initial state');
			}
			return JSON.parse(raw.textContent);
		};
		const buildLayout = function (state, revision) {
			return {
				version: 1,
				revision: revision,
				items: (state.entries || []).map(function (e) {
					return { type: 'app', id: e.id };
				}),
			};
		};
		const put = async function (layout) {
			const token = window.OC && window.OC.requestToken ? window.OC.requestToken : '';
			const url = window.OC && window.OC.generateUrl
				? window.OC.generateUrl('/apps/homecheck/api/layout')
				: '/index.php/apps/homecheck/api/layout';
			const res = await fetch(url, {
				method: 'PUT',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					requesttoken: token,
					Accept: 'application/json',
				},
				body: JSON.stringify({ requesttoken: token, layout: layout }),
			});
			return { res: res, data: await res.json() };
		};
		let state = readState();
		let layout = buildLayout(state, state.layout.revision);
		let result = await put(layout);
		if (!result.data.ok && result.res.status === 409 && result.data.data && result.data.data.layout) {
			layout = buildLayout(state, result.data.data.layout.revision);
			result = await put(layout);
		}
		if (!result.data.ok) {
			throw new Error('reset layout failed: ' + JSON.stringify(result.data));
		}
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('#hmk-grid .hmk-card__launch').first().waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * Wait for layout PUT to complete successfully.
 * @param {import('@playwright/test').Page} page
 */
async function waitForLayoutSave(page) {
	const res = await page.waitForResponse(
		(r) => r.url().includes('homecheck') && r.url().includes('/api/layout') && r.request().method() === 'PUT',
		{ timeout: 20000 },
	);
	const data = await res.json();
	if (!data.ok && res.status === 409) {
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.locator('#hmk-grid .hmk-card__launch').first().waitFor({ state: 'visible', timeout: 20000 });
		return;
	}
	if (!data.ok) {
		throw new Error('Layout save failed: ' + JSON.stringify(data));
	}
}

module.exports = { login, openHomeCheck, resetLayoutToFlatApps, folderCount, folderAt, clickCardMenuItem, openFolderCard, waitForLayoutSave };
