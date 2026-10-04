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

	for (let attempt = 0; attempt < 5; attempt++) {
		await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
		/* NC 34 login is a Vue app — wait for hydrated fields, not the shell HTML. */
		const userInput = page.locator('#user, input[name="user"]').first();
		try {
			await userInput.waitFor({ state: 'visible', timeout: 45000 });
		} catch (err) {
			if (attempt === 4) {
				throw err;
			}
			continue;
		}
		/*
		 * Under Atlas multi-app Playwright load, Vue login can thrash (visible but not
		 * "stable") so Playwright actionability waits blow the 90s test timeout.
		 * Prefer force fill + native DOM click; fall back to force locator click.
		 */
		await userInput.fill(user, { force: true });
		await page.locator('#password, input[name="password"]').first().fill(pass, { force: true });
		const submitted = await page.evaluate(() => {
			const btn = document.querySelector('[data-login-form-submit], button[type="submit"], input[type="submit"], button.login-button');
			if (!btn) {
				return false;
			}
			/** @type {HTMLElement} */ (btn).click();
			return true;
		});
		if (!submitted) {
			await page.locator('button[type="submit"], input[type="submit"], button.login-button').first().click({ force: true });
		}
		try {
			await page.waitForURL(/apps\/|index\.php\/apps/, { timeout: 60000 });
			return;
		} catch (err) {
			if (attempt === 4) {
				throw err;
			}
		}
	}
}

/**
 * Resolve a HomeCheck UI string from the page's own injected dictionary so
 * selectors/assertions hold under ANY fixture locale (never EN|DE literals).
 * Main page dictionary: #hmk-i18n; admin settings dictionary: #hmk-admin-i18n.
 * @param {import('@playwright/test').Page} page
 * @param {string} key i18n dict key (e.g. 'openFolder', 'rename')
 */
async function hmkMsg(page, key) {
	const label = await page.evaluate((k) => {
		const node = document.getElementById('hmk-i18n');
		const dict = node && node.textContent ? JSON.parse(node.textContent) : {};
		return typeof dict[k] === 'string' ? dict[k] : '';
	}, key);
	if (!label) {
		throw new Error('hmk-i18n key missing on page: ' + key);
	}
	return label;
}

/**
 * Admin settings dictionary variant (#hmk-admin-i18n).
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function hmkAdminMsg(page, key) {
	const label = await page.evaluate((k) => {
		const node = document.getElementById('hmk-admin-i18n');
		const dict = node && node.textContent ? JSON.parse(node.textContent) : {};
		return typeof dict[k] === 'string' ? dict[k] : '';
	}, key);
	if (!label) {
		throw new Error('hmk-admin-i18n key missing on page: ' + key);
	}
	return label;
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openHomeCheck(page) {
	const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
	await page.goto(base + '/index.php/apps/homecheck/');
	await page.locator('#homecheck-app').waitFor({ state: 'visible', timeout: 20000 });
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function folderCount(page) {
	return page.locator('#hmk-panels .hmk-pane[data-type="folder"]').count();
}

/**
 * Folder pane created most recently (by index after count bump).
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
function folderAt(page, index) {
	return page.locator('#hmk-panels .hmk-pane[data-type="folder"]').nth(index);
}

/**
 * @param {import('@playwright/test').Locator} pane
 * @param {RegExp|string} name resolved label (use hmkMsg/hmkAdminMsg — never EN|DE literals)
 */
async function clickCardMenuItem(pane, name) {
	await pane.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
	/* Top-level panes: menu in header. Folder dialog rows: menu on the row. */
	await pane.locator('summary').first()
		.evaluate((el) => /** @type {HTMLElement} */ (el).click());
	const item = typeof name === 'string'
		? pane.getByRole('menuitem', { name: name, exact: true })
		: pane.getByRole('menuitem', { name: name });
	await item.waitFor({ state: 'visible', timeout: 5000 });
	await item.evaluate((el) => /** @type {HTMLElement} */ (el).click());
}

/**
 * Open folder dialog via edit menu (children also show inline in the pane).
 * @param {import('@playwright/test').Locator} folderPane
 */
async function openFolderCard(folderPane) {
	await clickCardMenuItem(folderPane, await hmkMsg(folderPane.page(), 'openFolder'));
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
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
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
		await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
		return;
	}
	if (!data.ok) {
		throw new Error('Layout save failed: ' + JSON.stringify(data));
	}
}

/**
 * Persisted Nextcloud theme ids offered by core theming (OCS theming API).
 * 'default' = light. NEVER fake themes via JS CSS-var painting — persist via
 * OCS, reload, then assert the rendered body[data-theme-*] attribute.
 */
const THEME_IDS = ['default', 'dark', 'light-highcontrast', 'dark-highcontrast'];

/**
 * Persist a user theme server-side via the theming OCS API
 * (PUT /ocs/v2.php/apps/theming/api/v1/theme/{id}/enable; DELETE others).
 * Caller MUST reload/navigate afterwards and assert assertRenderedTheme().
 * @param {import('@playwright/test').Page} page
 * @param {string} themeId one of THEME_IDS
 */
async function setUserThemeOcs(page, themeId) {
	const problems = await page.evaluate(async ({ target, all }) => {
		const token = (window.OC && window.OC.requestToken)
			|| (document.querySelector('head[data-requesttoken]') && document.querySelector('head[data-requesttoken]').getAttribute('data-requesttoken')) || '';
		const headers = { requesttoken: token, 'OCS-APIRequest': 'true', Accept: 'application/json' };
		const out = [];
		for (const id of all.filter((t) => t !== target)) {
			const res = await fetch('/ocs/v2.php/apps/theming/api/v1/theme/' + id, {
				method: 'DELETE', credentials: 'same-origin', headers: headers,
			});
			if (!res.ok && res.status !== 400) { out.push('disable ' + id + ': HTTP ' + res.status); }
		}
		const res = await fetch('/ocs/v2.php/apps/theming/api/v1/theme/' + target + '/enable', {
			method: 'PUT', credentials: 'same-origin', headers: headers,
		});
		if (!res.ok && res.status !== 400) { out.push('enable ' + target + ': HTTP ' + res.status); }
		return out;
	}, { target: themeId, all: THEME_IDS });
	if (problems.length) {
		throw new Error('OCS theme ' + themeId + ' failed: ' + problems.join('; '));
	}
}

/**
 * Assert the server-rendered theme attribute after navigation — proves the
 * theme is real (body[data-theme-<id>]), not painted.
 * @param {import('@playwright/test').Page} page
 * @param {string} themeId
 */
async function assertRenderedTheme(page, themeId) {
	const state = await page.evaluate((t) => {
		const attr = t === 'default' ? 'data-theme-default' : 'data-theme-' + t;
		const dataThemes = document.body.getAttribute('data-themes') || '';
		return {
			ok: document.body.hasAttribute(attr) || dataThemes.split(/\s+/).indexOf(t) !== -1,
			dataThemes: dataThemes || null,
			attr: attr,
			present: document.body.hasAttribute(attr),
		};
	}, themeId);
	if (!state.ok) {
		throw new Error('theme not rendered: expected body[' + state.attr + '], got data-themes="' + state.dataThemes + '"');
	}
	return state;
}

/**
 * Current global accent color as seen by this page, normalized to #hex so it
 * can be POSTed back to theming ajax (updateStylesheet requires #rgb/#rrggbb).
 * @param {import('@playwright/test').Page} page
 */
async function getAccentColor(page) {
	return page.evaluate(() => {
		const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-element').trim();
		if (/^#[0-9a-f]{3,8}$/i.test(raw)) { return raw; }
		const m = raw.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
		if (m) {
			return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
		}
		return raw;
	});
}

/**
 * Set the global admin accent color via the real theming ajax endpoint
 * (POST apps/theming/ajax/updateStylesheet, admin session required). This is
 * a SHARED-instance mutation — callers must restore the prior color in a
 * finally block.
 * @param {import('@playwright/test').Page} page
 * @param {string} hex
 */
async function setAdminAccentColor(page, hex) {
	const result = await page.evaluate(async (value) => {
		const token = (window.OC && window.OC.requestToken)
			|| (document.querySelector('head[data-requesttoken]') && document.querySelector('head[data-requesttoken]').getAttribute('data-requesttoken')) || '';
		const res = await fetch((window.OC && window.OC.generateUrl ? window.OC.generateUrl('/apps/theming/ajax/updateStylesheet') : '/index.php/apps/theming/ajax/updateStylesheet'), {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				requesttoken: token,
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				Accept: 'application/json',
			},
			body: 'setting=primary_color&value=' + encodeURIComponent(value),
		});
		return { status: res.status, body: await res.text().then((t) => t.slice(0, 300)) };
	}, hex);
	if (result.status !== 200) {
		throw new Error('theming ajax color failed: HTTP ' + result.status + ' ' + result.body);
	}
}

module.exports = { login, openHomeCheck, resetLayoutToFlatApps, folderCount, folderAt, clickCardMenuItem, openFolderCard, waitForLayoutSave, hmkMsg, hmkAdminMsg, THEME_IDS, setUserThemeOcs, assertRenderedTheme, getAccentColor, setAdminAccentColor };
