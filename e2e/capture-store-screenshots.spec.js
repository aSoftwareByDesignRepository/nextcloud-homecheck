// @ts-check
/**
 * App Store screenshot capture for AppHome (homecheck).
 * Seeds a curated German demo layout, then shoots key surfaces at
 * DutyCheck/MaintenanceCheck size (1920×1040).
 *
 * Run:
 *   npx playwright test e2e/capture-store-screenshots.spec.js --project=chromium-store
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { login, openHomeCheck, clickCardMenuItem, waitForLayoutSave } = require('./helpers');

const outDir = path.resolve(__dirname, '../screenshots');

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function shot(page, name) {
	fs.mkdirSync(outDir, { recursive: true });
	await page.waitForTimeout(400);
	await page.screenshot({
		path: path.join(outDir, name),
		fullPage: false,
	});
}

/**
 * Build a store-friendly layout: named folders + curated top-level apps.
 * Everything else is hidden so the store shots never show internal tooling.
 * @param {import('@playwright/test').Page} page
 */
async function seedStoreLayout(page) {
	await page.evaluate(async () => {
		const raw = document.getElementById('hmk-initial-state');
		if (!raw || !raw.textContent) {
			throw new Error('missing initial state');
		}
		const state = JSON.parse(raw.textContent);
		const entries = Array.isArray(state.entries) ? state.entries : [];
		const byId = {};
		entries.forEach(function (e) {
			byId[e.id] = e;
		});

		const pick = function (candidates) {
			for (let i = 0; i < candidates.length; i++) {
				if (byId[candidates[i]]) {
					return candidates[i];
				}
			}
			return null;
		};

		const used = {};
		const take = function (candidates) {
			const id = pick(candidates);
			if (!id || used[id]) {
				return null;
			}
			used[id] = true;
			return id;
		};

		const officeKids = [
			take(['files']),
			take(['calendar']),
			take(['contacts']),
			take(['deck', 'tasks', 'notes']),
		].filter(Boolean);

		const workKids = [
			take(['projectcheck']),
			take(['dutycheck']),
			take(['arbeitszeitcheck']),
			take(['budgetcheck']),
		].filter(Boolean);

		const toolsKids = [
			take(['inventorycheck']),
			take(['maintenancecheck']),
			take(['ticketcheck']),
			take(['audiocheck']),
		].filter(Boolean);

		const folders = [];
		if (officeKids.length >= 2) {
			folders.push({ type: 'folder', id: 'fld_storeoff1', name: 'Büro', children: officeKids });
		}
		if (workKids.length >= 2) {
			folders.push({ type: 'folder', id: 'fld_storework', name: 'Arbeit', children: workKids });
		}
		if (toolsKids.length >= 2) {
			folders.push({ type: 'folder', id: 'fld_storetool', name: 'Werkzeuge', children: toolsKids });
		}

		const preferredTop = [
			'dashboard',
			'activity',
			'photos',
			'mail',
			'spreed',
			'mobilitycheck',
			'customercheck',
			'deskcheck',
			'invoicecheck',
		];
		const topApps = [];
		preferredTop.forEach(function (id) {
			if (byId[id] && !used[id] && topApps.length < 5) {
				used[id] = true;
				topApps.push({ type: 'app', id: id });
			}
		});

		/* Hide every remaining entry — keeps store shots free of internal apps */
		const hidden = [];
		entries.forEach(function (e) {
			if (!used[e.id]) {
				hidden.push(e.id);
			}
		});
		/* Prefer a friendly name in the hidden dialog when possible */
		const preferHidden = ['photos', 'activity', 'forms', 'notes', 'snackcheck'];
		preferHidden.forEach(function (id) {
			const idx = hidden.indexOf(id);
			if (idx > 0) {
				hidden.splice(idx, 1);
				hidden.unshift(id);
			}
		});

		const layout = {
			version: 1,
			revision: state.layout && typeof state.layout.revision === 'number' ? state.layout.revision : 0,
			items: folders.concat(topApps),
			hidden: hidden.slice(0, 40),
			hiddenFolders: [],
		};

		const token = window.OC && window.OC.requestToken ? window.OC.requestToken : '';
		const url = window.OC && window.OC.generateUrl
			? window.OC.generateUrl('/apps/homecheck/api/layout')
			: '/index.php/apps/homecheck/api/layout';

		const put = async function (body) {
			const res = await fetch(url, {
				method: 'PUT',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					requesttoken: token,
					Accept: 'application/json',
				},
				body: JSON.stringify({ requesttoken: token, layout: body }),
			});
			return { res: res, data: await res.json() };
		};

		let result = await put(layout);
		if (!result.data.ok && result.res.status === 409 && result.data.data && result.data.data.layout) {
			layout.revision = result.data.data.layout.revision;
			result = await put(layout);
		}
		if (!result.data.ok) {
			throw new Error('seed layout failed: ' + JSON.stringify(result.data));
		}
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * Dismiss start-page CTA if present so hero shots stay clean.
 * @param {import('@playwright/test').Page} page
 */
async function dismissCta(page) {
	const cta = page.locator('#hmk-cta');
	if (await cta.isVisible().catch(function () { return false; })) {
		const no = page.locator('#hmk-cta-no');
		if (await no.isVisible().catch(function () { return false; })) {
			await no.click();
			await page.waitForTimeout(300);
		}
	}
}

test.describe('App Store screenshots', () => {
	test.setTimeout(180_000);

	test('seed demo and capture store screenshots', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name !== 'chromium-store',
			'App-store screenshot capture is only for chromium-store (1920×1040)',
		);

		await login(page);
		await openHomeCheck(page);
		await seedStoreLayout(page);
		await dismissCta(page);

		/* 01 — Hero: curated home with folders + greeting */
		await expect(page.locator('#hmk-greeting')).toBeVisible();
		await expect(page.locator('#hmk-panels .hmk-pane').first()).toBeVisible();
		await shot(page, 'homecheck-screenshot-01.png');

		/* 02 — Edit mode (toolbar: New folder, Hidden apps, Done) */
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible();
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		await shot(page, 'homecheck-screenshot-02.png');

		/* 03 — App overflow menu open */
		const appPane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		await appPane.scrollIntoViewIfNeeded();
		await appPane.locator('summary').first().evaluate(function (el) {
			/** @type {HTMLElement} */ (el).click();
		});
		await expect(appPane.getByRole('menuitem').first()).toBeVisible({ timeout: 5000 });
		await shot(page, 'homecheck-screenshot-03.png');
		/* Close menu */
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		/* 04 — Folder pane with children (still in edit) */
		const folderPane = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first();
		await expect(folderPane).toBeVisible({ timeout: 10000 });
		await folderPane.scrollIntoViewIfNeeded();
		await shot(page, 'homecheck-screenshot-04.png');

		/* 05 — Folder dialog */
		await clickCardMenuItem(folderPane, /Open folder|Ordner öffnen/i);
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible();
		await page.waitForTimeout(400);
		await shot(page, 'homecheck-screenshot-05.png');
		await page.locator('#hmk-folder-close').click();
		await expect(page.locator('#hmk-folder-dialog')).toBeHidden();

		/* 06 — Hidden apps dialog (curate list for store beauty) */
		await page.locator('#hmk-hidden-apps').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeVisible();
		await page.evaluate(() => {
			const list = document.getElementById('hmk-hidden-list');
			if (!list) {
				return;
			}
			const keepNames = /^(DeskCheck|InvoiceCheck|Fotos|Photos|Activity|Aktivität|Forms|Notes|Notiz)/i;
			const rows = Array.from(list.querySelectorAll('.hmk-hidden-row'));
			let kept = 0;
			rows.forEach(function (row) {
				const name = (row.querySelector('.hmk-hidden-row__name')?.textContent || '').trim();
				if (keepNames.test(name) && kept < 3) {
					kept++;
					return;
				}
				row.remove();
			});
			/* If filter removed everything, keep first three rows */
			if (kept === 0) {
				Array.from(list.querySelectorAll('.hmk-hidden-row')).forEach(function (row, i) {
					if (i >= 3) {
						row.remove();
					}
				});
			}
		});
		await page.waitForTimeout(300);
		await shot(page, 'homecheck-screenshot-06.png');
		await page.locator('#hmk-hidden-close').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeHidden();

		/* 07 — Rename folder prompt */
		await clickCardMenuItem(folderPane, /Rename|Umbenennen/i);
		await expect(page.locator('#hmk-prompt-dialog')).toBeVisible();
		await page.locator('#hmk-prompt-input').fill('Büro & Kalender');
		await page.waitForTimeout(300);
		await shot(page, 'homecheck-screenshot-07.png');
		await page.locator('#hmk-prompt-cancel').click();
		await expect(page.locator('#hmk-prompt-dialog')).toBeHidden();

		/* Exit edit for credit + admin shots */
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeHidden();

		/* 08 — Vendor credit at end of page */
		await page.locator('.hmk-credit__link').scrollIntoViewIfNeeded();
		await expect(page.locator('.hmk-credit__link')).toBeVisible();
		await shot(page, 'homecheck-screenshot-08.png');

		/* 09 — Admin seed settings (isolate AppHome section) */
		const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
		await page.goto(base + '/index.php/settings/admin');
		await page.waitForLoadState('domcontentloaded');
		const adminSection = page.locator('#hmk-admin, .hmk-admin');
		if (!(await adminSection.isVisible().catch(function () { return false; }))) {
			await page.goto(base + '/index.php/settings/admin/additional');
			await page.waitForLoadState('domcontentloaded');
		}
		await adminSection.first().waitFor({ state: 'visible', timeout: 30000 });
		await page.evaluate(() => {
			const keep = document.getElementById('hmk-admin') || document.querySelector('.hmk-admin');
			if (!keep) {
				return;
			}
			const root = keep.closest('#app-content, #content, main, body') || document.body;
			Array.from(root.children).forEach(function (child) {
				if (child.contains(keep) || child === keep) {
					return;
				}
				if (child instanceof HTMLElement && child.id !== 'header') {
					child.style.setProperty('display', 'none', 'important');
				}
			});
			/* Hide sibling sections after AppHome inside the same settings column */
			let sib = keep.nextElementSibling;
			while (sib) {
				if (sib instanceof HTMLElement) {
					sib.style.setProperty('display', 'none', 'important');
				}
				sib = sib.nextElementSibling;
			}
			let prev = keep.previousElementSibling;
			while (prev) {
				if (prev instanceof HTMLElement && !prev.querySelector('#header')) {
					prev.style.setProperty('display', 'none', 'important');
				}
				prev = prev.previousElementSibling;
			}
		});
		await adminSection.first().scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		await shot(page, 'homecheck-screenshot-09.png');
	});
});
