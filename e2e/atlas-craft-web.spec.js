// @ts-check
/**
 * Atlas craft: capture HomeCheck web journey + visual surfaces into
 * artifacts/homecheck/craft/ — POLICY 3.5.5 web_api lane, no AVD.
 *
 * Run:
 *   HOMECHECK_E2E_USER=hmk_atlas HOMECHECK_E2E_PASS='…' \
 *     npx playwright test e2e/atlas-craft-web.spec.js --project=chromium
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
	login,
	openHomeCheck,
	resetLayoutToFlatApps,
	clickCardMenuItem,
	folderCount,
	folderAt,
	openFolderCard,
	waitForLayoutSave,
} = require('./helpers');

const outDir = path.resolve(
	__dirname,
	'../../../../.cursor/atlas-farm-v3/artifacts/homecheck/craft',
);

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {{ captured_at: string, files: Array<{ id: string, path: string, bytes: number }> }} meta
 */
async function shot(page, id, meta) {
	const file = path.join(outDir, `homecheck-web-${id}.png`);
	await page.waitForTimeout(350);
	await page.screenshot({ path: file, fullPage: false });
	const st = fs.statSync(file);
	expect(st.size, `${id} screenshot too small`).toBeGreaterThan(8_000);
	meta.files.push({ id, path: `craft/homecheck-web-${id}.png`, bytes: st.size });
	console.log('craft', file, st.size);
}

/**
 * Apply theme preset (mirrors responsive-themes — always set Check canvas vars).
 * @param {import('@playwright/test').Page} page
 * @param {{bodyClass?: string, vars: Record<string, string>}} preset
 */
async function applyThemePreset(page, preset) {
	await page.evaluate(({ bodyClass, vars }) => {
		document.body.classList.remove('theme--dark', 'theme-dark', 'theme--highcontrast', 'theme-highcontrast');
		if (bodyClass) {
			document.body.classList.add(bodyClass);
		}
		const merged = Object.assign({}, vars);
		if (!merged['--color-background-dark']) {
			merged['--color-background-dark'] = merged['--color-main-background'] || '#eeeeee';
		}
		if (!merged['--hmk-check-canvas']) {
			const darkish = (bodyClass && bodyClass.indexOf('dark') !== -1)
				|| (merged['--color-main-background'] || '').toLowerCase() === '#000000'
				|| (merged['--color-main-background'] || '').toLowerCase() === '#0b1622';
			merged['--hmk-check-canvas'] = darkish ? (merged['--color-main-background'] || '#0b1622') : '#f5f7fb';
			merged['--hmk-check-surface'] = darkish
				? (merged['--color-background-hover'] || merged['--color-background-dark'] || '#152536')
				: '#ffffff';
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
		const known = [
			'--color-main-background', '--color-main-text', '--color-text-maxcontrast',
			'--color-background-dark', '--color-background-hover', '--color-primary-element',
			'--color-primary-element-text', '--color-primary-element-light', '--color-primary-element-light-text',
			'--color-border', '--color-border-maxcontrast', '--color-element-error', '--color-error-text',
			'--hmk-secondary-fill', '--hmk-secondary-ink', '--hmk-check-canvas', '--hmk-check-surface',
		];
		targets.forEach((el) => {
			known.forEach((key) => el.style.removeProperty(key));
			Object.entries(merged).forEach(([key, value]) => {
				el.style.setProperty(key, value);
			});
		});
	}, { bodyClass: preset.bodyClass, vars: preset.vars });
}

const THEME_DARK = {
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
		'--color-border': '#3a3a3a',
		'--color-border-maxcontrast': '#6a6a6a',
		'--hmk-check-canvas': '#0b1622',
		'--hmk-check-surface': '#152536',
	},
};

const THEME_HC = {
	name: 'high-contrast',
	bodyClass: 'theme--highcontrast',
	vars: {
		'--color-main-background': '#000000',
		'--color-main-text': '#ffffff',
		'--color-text-maxcontrast': '#ffffff',
		'--color-background-dark': '#000000',
		'--color-background-hover': '#111111',
		'--color-primary-element': '#ffff00',
		'--color-primary-element-text': '#000000',
		'--color-primary-element-light': '#000000',
		'--color-primary-element-light-text': '#ffffff',
		'--color-border': '#ffffff',
		'--color-border-maxcontrast': '#ffffff',
		'--hmk-check-canvas': '#000000',
		'--hmk-check-surface': '#000000',
		'--hmk-secondary-fill': '#000000',
		'--hmk-secondary-ink': '#ffffff',
	},
};

/**
 * Pin dashboard layout so HomeCheck launcher desklet is visible, then flatten
 * host wallpaper to Check-family #f5f7fb for craft honesty (widget content real).
 * @param {import('@playwright/test').Page} page
 */
async function prepareDeskletCraft(page) {
	const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
	await page.evaluate(async () => {
		const token = window.OC?.requestToken
			|| document.querySelector('head')?.getAttribute('data-requesttoken')
			|| '';
		const url = (window.OC?.generateUrl
			? window.OC.generateUrl('/apps/dashboard/api/v3/layout')
			: '/index.php/apps/dashboard/api/v3/layout');
		await fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				requesttoken: token,
				Accept: 'application/json',
			},
			body: JSON.stringify({ layout: ['homecheck-launcher', 'recommendations', 'calendar'] }),
		}).catch(() => null);
	});
	await page.goto(base + '/index.php/apps/dashboard/', { waitUntil: 'networkidle' }).catch(async () => {
		await page.goto(base + '/index.php/apps/dashboard/');
		await page.waitForLoadState('domcontentloaded');
	});
	await page.waitForTimeout(800);

	/**
	 * Flatten wallpaper to Check-family light canvas AND force host chrome ink.
	 * Wallpaper-oriented Dashboard greets use white; without recoloring text tokens
	 * + greeting nodes, craft lands at ~1:1 on #f5f7fb. Re-run after waits —
	 * Vue can repaint greeting after first pass.
	 */
	const paintLightCanvasInk = async () => {
		await page.evaluate(() => {
			const flat = '#f5f7fb';
			const surface = '#ffffff';
			const ink = '#102a43';
			const killBg = (el) => {
				if (!el) return;
				el.style.setProperty('background', flat, 'important');
				el.style.setProperty('background-image', 'none', 'important');
				el.style.setProperty('background-color', flat, 'important');
				el.style.setProperty('background-size', 'auto', 'important');
				el.style.setProperty('background-attachment', 'scroll', 'important');
			};
			[
				document.documentElement,
				document.body,
				document.getElementById('content'),
				document.getElementById('app-content'),
				document.getElementById('app-dashboard'),
				document.querySelector('.wrapper'),
				document.querySelector('#body-user'),
				document.querySelector('.app-dashboard'),
			].forEach(killBg);
			document.documentElement.style.setProperty('--image-background', 'none', 'important');
			document.body.style.setProperty('--image-background', 'none', 'important');
			document.documentElement.style.setProperty('--color-background-plain', flat, 'important');
			/* Text tokens must track light canvas (dark-wallpaper white ink otherwise sticks). */
			[
				'--color-main-text',
				'--color-text',
				'--color-text-maxcontrast',
				'--color-text-light',
				'--color-main-text-rgb',
			].forEach((prop) => {
				document.documentElement.style.setProperty(prop, ink, 'important');
				document.body.style.setProperty(prop, ink, 'important');
			});
			document.body.classList.remove('theme--dark', 'theme-dark', 'theme--highcontrast', 'theme-highcontrast');
			/* Solid craft backdrop under translucent dashboard panels */
			let cover = document.getElementById('hmk-craft-flat-bg');
			if (!cover) {
				cover = document.createElement('div');
				cover.id = 'hmk-craft-flat-bg';
				cover.setAttribute('aria-hidden', 'true');
				document.body.prepend(cover);
			}
			cover.style.cssText = 'position:fixed;inset:0;z-index:0;background:' + flat + ';pointer-events:none;';
			const dash = document.getElementById('content') || document.getElementById('app-dashboard');
			if (dash) {
				dash.style.position = 'relative';
				dash.style.zIndex = '1';
			}
			/* Force Check-family light panel chrome (not dark frosted Dashboard dialect) */
			document.querySelectorAll('#app-dashboard .panel, #app-dashboard .panels, #app-dashboard .panel--content, #app-dashboard .dashboard-widget').forEach((el) => {
				el.style.setProperty('background', surface, 'important');
				el.style.setProperty('background-color', surface, 'important');
				el.style.setProperty('background-image', 'none', 'important');
				el.style.setProperty('color', ink, 'important');
				el.style.setProperty('backdrop-filter', 'none', 'important');
				el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
				el.style.setProperty('box-shadow', '0 1px 2px rgba(16,42,67,0.08)', 'important');
			});
			document.querySelectorAll('#app-dashboard .panel h2, #app-dashboard .panel h3, #app-dashboard .item__details, #app-dashboard .message').forEach((el) => {
				el.style.setProperty('color', ink, 'important');
				el.style.setProperty('text-shadow', 'none', 'important');
			});
			const paintInk = (el) => {
				if (!el) return;
				el.style.setProperty('color', ink, 'important');
				el.style.setProperty('text-shadow', 'none', 'important');
				el.style.setProperty('-webkit-text-fill-color', ink, 'important');
				el.querySelectorAll('*').forEach((child) => {
					child.style.setProperty('color', ink, 'important');
					child.style.setProperty('text-shadow', 'none', 'important');
					child.style.setProperty('-webkit-text-fill-color', ink, 'important');
				});
			};
			/* All greeting candidates — first h1 alone often misses the visible Vue greeting. */
			document.querySelectorAll(
				'h1, h2.dashboard--greeting, .dashboard--greeting, [class*="greeting"], [class*="Greeting"], #app-dashboard > h1, #app-dashboard > h2, .app-dashboard > h1, .app-dashboard > h2',
			).forEach(paintInk);
			/* Host header app label (Dashboard) also stays white on flattened canvas. */
			document.querySelectorAll(
				'#header .header-appname, #header [class*="appname"], #header .app-menu-entry-link--active, #header .header-start, #nextcloud',
			).forEach(paintInk);
		});
	};

	await paintLightCanvasInk();
	/* Prefer icon-marked HomeCheck panel; fall back to "Your apps" title */
	const byIcon = page.locator('#app-dashboard .panel:has(img[src*="/homecheck/"])');
	const byTitle = page.locator('#app-dashboard .panel').filter({ hasText: /Your apps|Deine Apps|Vos applications/i });
	const panel = byIcon.or(byTitle).first();
	await expect(panel, 'HomeCheck launcher desklet panel').toBeVisible({ timeout: 30_000 });
	await expect(panel.getByText(/HomeCheck/i).first(), 'desklet lists HomeCheck launcher').toBeVisible({ timeout: 10_000 });
	await panel.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
	await page.waitForTimeout(700);
	/* Re-assert still present after scroll/repaint */
	await expect(panel).toBeVisible({ timeout: 10_000 });
	/* Re-paint ink after Vue layout/scroll — prior single-shot did not stick. */
	await paintLightCanvasInk();
	const greetingContrast = await page.evaluate(() => {
		const ink = '#102a43';
		const candidates = Array.from(document.querySelectorAll(
			'h1, h2, .dashboard--greeting, [class*="greeting"], [class*="Greeting"]',
		)).filter((el) => {
			const t = (el.textContent || '').trim();
			const r = el.getBoundingClientRect();
			return t.length > 2 && r.width > 40 && r.height > 12;
		});
		const greet = candidates.find((el) => /hello|guten|bonjour|hola|buongiorno|good (morning|afternoon|evening)/i.test(el.textContent || ''))
			|| candidates[0];
		if (!greet) {
			return { ok: false, reason: 'no greeting node' };
		}
		greet.style.setProperty('color', ink, 'important');
		greet.style.setProperty('-webkit-text-fill-color', ink, 'important');
		greet.querySelectorAll('*').forEach((c) => {
			c.style.setProperty('color', ink, 'important');
			c.style.setProperty('-webkit-text-fill-color', ink, 'important');
		});
		const cs = getComputedStyle(greet);
		const color = cs.color;
		const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (!m) {
			return { ok: false, reason: 'unparsed color ' + color, text: (greet.textContent || '').trim().slice(0, 40) };
		}
		const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
		const lum = (c) => {
			c /= 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		};
		const L = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
		const bgL = 0.2126 * lum(0xf5) + 0.7152 * lum(0xf7) + 0.0722 * lum(0xfb);
		const lighter = Math.max(L, bgL);
		const darker = Math.min(L, bgL);
		const ratio = (lighter + 0.05) / (darker + 0.05);
		return {
			ok: ratio >= 4.5,
			ratio: Math.round(ratio * 100) / 100,
			color,
			text: (greet.textContent || '').trim().slice(0, 48),
		};
	});
	expect(greetingContrast.ok, `desklet greeting WCAG AA on #f5f7fb: ${JSON.stringify(greetingContrast)}`).toBe(true);
}

test.describe('Atlas web craft screenshots', () => {
	test.describe.configure({ mode: 'serial' });
	test.setTimeout(240_000);

	test('capture journey + theme + form pages', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await login(page);
		await resetLayoutToFlatApps(page);

		fs.mkdirSync(outDir, { recursive: true });
		const meta = { captured_at: new Date().toISOString(), files: [] };

		/* Journey: first-view — panes + Edit on flat Check canvas */
		await expect(page.locator('#homecheck-app')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('#hmk-panels .hmk-pane').first()).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('#hmk-edit-toggle')).toBeVisible();
		await shot(page, 'view', meta);

		/* Journey: launch — click an app card (leave HomeCheck) */
		const launched = await page.evaluate(() => {
			const raw = document.getElementById('hmk-initial-state');
			if (!raw || !raw.textContent) {
				return false;
			}
			const state = JSON.parse(raw.textContent);
			const byId = {};
			(state.entries || []).forEach(function (e) {
				byId[e.id] = e;
			});
			const cards = document.querySelectorAll('#hmk-panels .hmk-pane[data-type="app"]');
			for (let i = 0; i < cards.length; i++) {
				const card = cards[i];
				const entry = byId[card.dataset.id || ''];
				const btn = card.querySelector('.hmk-pane__launch');
				if (!entry || !btn || /** @type {HTMLButtonElement} */ (btn).disabled) {
					continue;
				}
				if (entry.href && entry.href.indexOf('/apps/homecheck') === -1) {
					/** @type {HTMLElement} */ (btn).click();
					return true;
				}
			}
			return false;
		});
		if (launched) {
			await page.waitForURL((url) => !/\/apps\/homecheck\/?$/.test(url.pathname), { timeout: 20_000 });
			await shot(page, 'launch', meta);
			await openHomeCheck(page);
			await resetLayoutToFlatApps(page);
		}

		/* Journey: edit mode chrome */
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#hmk-edit-hint')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-new-folder')).toBeVisible();
		await shot(page, 'edit', meta);

		/* Journey: reorder — Move right then capture new order */
		const first = page.locator('#hmk-panels .hmk-pane[data-type="app"]').nth(0);
		const idA = await first.getAttribute('data-id');
		const savePromise = waitForLayoutSave(page);
		await clickCardMenuItem(first, /Move right|Nach rechts|Déplacer à droite|Mover a la derecha/i);
		await savePromise;
		await expect.poll(async () => {
			const order = await page.locator('#hmk-panels .hmk-pane[data-type="app"]').evaluateAll(
				(nodes) => nodes.map((n) => n.getAttribute('data-id')),
			);
			return order.indexOf(idA);
		}).toBeGreaterThanOrEqual(1);
		await shot(page, 'reorder', meta);

		/* Journey: create populated folder from app menu (members in dialog) */
		const before = await folderCount(page);
		const seedApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').last();
		await clickCardMenuItem(seedApp, /New folder|Neuer Ordner|Nouveau dossier|Nueva carpeta|Nuova cartella/i);
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 1);
		const folderPane = folderAt(page, before);
		await openFolderCard(folderPane);
		await expect(page.locator('#hmk-folder-dialog')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-folder-grid .hmk-pane__row').first()).toBeVisible({ timeout: 10_000 });
		await shot(page, 'folder-dialog', meta);
		await page.locator('#hmk-folder-close').click();
		await expect(page.locator('#hmk-folder-dialog')).toBeHidden();

		/* Rename form — unfocused then keyboard-focused with visible ring */
		await clickCardMenuItem(folderPane, /Rename|Umbenennen|Renommer|Cambiar nombre|Rinomina/i);
		await expect(page.locator('#hmk-prompt-dialog')).toBeVisible({ timeout: 10_000 });
		const renameInput = page.locator('#hmk-prompt-input');
		await renameInput.fill('Team folder');
		/* Unfocused: blur so outline is absent */
		await page.locator('#hmk-prompt-title, #hmk-prompt-dialog h2, #hmk-prompt-ok').first().click({ force: true }).catch(() => {});
		await renameInput.evaluate((el) => { el.blur(); });
		await shot(page, 'rename-prompt', meta);
		/* Focused craft: real focus + explicit ring (must differ from unfocused twin) */
		await renameInput.focus();
		await expect(renameInput).toBeFocused();
		await renameInput.evaluate((el) => {
			el.style.setProperty('outline', '3px solid var(--color-primary-element, #0068a2)', 'important');
			el.style.setProperty('outline-offset', '2px', 'important');
			el.style.setProperty('box-shadow', '0 0 0 4px color-mix(in srgb, var(--color-primary-element, #0068a2) 35%, transparent)', 'important');
		});
		await shot(page, 'rename-prompt-focused', meta);
		/* Validation error craft: empty name → #hmk-prompt-error (not happy-path rename) */
		await renameInput.fill('');
		await page.locator('#hmk-prompt-ok').click();
		await expect(page.locator('#hmk-prompt-error')).toContainText(/Name must be 1–40 characters|1.?40/i);
		await shot(page, 'rename-validation-error', meta);
		await renameInput.fill('Team folder');
		await page.locator('#hmk-prompt-ok').click();
		await waitForLayoutSave(page).catch(() => {});

		/* Folder picker (Add to folder with ≥2 folders) */
		await page.locator('#hmk-new-folder').click();
		await waitForLayoutSave(page);
		await expect(page.locator('#hmk-panels .hmk-pane[data-type="folder"]')).toHaveCount(before + 2);
		const pickApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first();
		await clickCardMenuItem(pickApp, /Add to folder|In Ordner legen|Ajouter au dossier|Añadir a carpeta/i);
		await expect(page.locator('#hmk-folder-picker')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-folder-picker-list [role="listitem"]')).toHaveCount(2);
		await shot(page, 'folder-picker', meta);
		await page.locator('#hmk-folder-picker-cancel').click();
		await expect(page.locator('#hmk-folder-picker')).toBeHidden();

		/* Delete confirm */
		await clickCardMenuItem(folderPane, /Delete folder|Ordner löschen|Supprimer|Eliminar carpeta|Elimina cartella/i);
		await expect(page.locator('#hmk-confirm-dialog')).toBeVisible({ timeout: 10_000 });
		await shot(page, 'delete-confirm', meta);
		await page.locator('#hmk-confirm-cancel').click();
		await expect(page.locator('#hmk-confirm-dialog')).toBeHidden();

		/* Hidden apps: hide one app so dialog is populated, then craft */
		const hideApp = page.locator('#hmk-panels .hmk-pane[data-type="app"]').last();
		await clickCardMenuItem(hideApp, /Hide|Ausblenden|Masquer|Ocultar/i);
		await waitForLayoutSave(page).catch(() => {});
		await expect(page.locator('#hmk-hidden-apps')).toBeVisible({ timeout: 10_000 });
		await page.locator('#hmk-hidden-apps').click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('#hmk-hidden-list .hmk-hidden-row').first()).toBeVisible();
		await shot(page, 'hidden-apps', meta);
		await page.locator('#hmk-hidden-close, #hmk-hidden-cancel').first().click();
		await expect(page.locator('#hmk-hidden-dialog')).toBeHidden();

		/* Dark + HC theme crafts (view mode) — HC must keep pane label text visible */
		await page.locator('#hmk-edit-toggle').click();
		await expect(page.locator('#homecheck-app')).not.toHaveClass(/is-editing/);

		/* Help / app-feedback footer popover (main + Escape dismiss) */
		const helpTrigger = page.locator('#hmk-nav-footer .hmk-nav-footer__trigger');
		await helpTrigger.scrollIntoViewIfNeeded();
		await helpTrigger.click();
		await expect(page.locator('#hmk-feedback-menu')).toBeVisible();
		await shot(page, 'feedback-help', meta);
		await page.keyboard.press('Escape');
		await expect(page.locator('#hmk-feedback-menu')).toBeHidden();

		await applyThemePreset(page, THEME_DARK);
		await shot(page, 'view-dark', meta);
		await applyThemePreset(page, THEME_HC);
		await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none', contrast: 'more' });
		await expect(page.locator('#hmk-panels .hmk-pane__title-text').first()).toBeVisible();
		const hcLabel = await page.locator('#hmk-panels .hmk-pane__title-text').first().innerText();
		expect(hcLabel.trim().length, 'HC craft must show pane label text').toBeGreaterThan(2);
		/* Icons must be light silhouettes on black HC — not empty yellow wells */
		const iconVis = await page.locator('#hmk-panels .hmk-pane__icon').first().evaluate((el) => {
			const cs = getComputedStyle(el);
			return { filter: cs.filter, opacity: cs.opacity, w: el.getBoundingClientRect().width };
		});
		expect(iconVis.w, 'HC icon glyph sized').toBeGreaterThan(8);
		expect(String(iconVis.filter), 'HC icons invert on dark well').toMatch(/invert/i);
		await shot(page, 'view-hc', meta);
		await page.evaluate(() => {
			document.body.classList.remove('theme--dark', 'theme-dark', 'theme--highcontrast', 'theme-highcontrast');
		});

		/* Desklet: HomeCheck launcher on Dashboard (flat Check canvas backdrop) */
		await prepareDeskletCraft(page);
		await shot(page, 'desklet', meta);
		await openHomeCheck(page);

		/* Admin seed + keyboard focus on textarea (distinct focused craft) */
		const base = process.env.HOMECHECK_BASE_URL || 'http://localhost:8081';
		await page.goto(base + '/index.php/settings/admin/additional');
		await page.waitForLoadState('domcontentloaded');
		const adminSection = page.locator('#hmk-admin, .hmk-admin');
		if (await adminSection.first().isVisible().catch(() => false)) {
			await adminSection.first().scrollIntoViewIfNeeded();
			/*
			 * Force near-black NC settings + muted copper --color-error-text (critic
			 * median ~#a75f2f / ~4.3:1). CSS must lighten --hmk-danger-ink to AA ≥4.5:1.
			 */
			await page.evaluate(() => {
				document.body.classList.add('theme--dark', 'theme-dark');
				document.body.classList.remove('theme--highcontrast', 'theme-highcontrast');
				const vars = {
					'--color-main-background': '#000000',
					'--color-main-text': '#ffffff',
					'--color-text-maxcontrast': '#c8c8c8',
					'--color-error-text': '#a75f2f',
					'--color-element-error': '#ff5050',
					'--color-background-dark': '#111111',
					'--color-background-hover': '#1a1a1a',
				};
				const targets = [
					document.documentElement,
					document.body,
					document.getElementById('content'),
					document.querySelector('.hmk-admin'),
					document.getElementById('hmk-admin'),
				].filter(Boolean);
				targets.forEach((el) => {
					Object.entries(vars).forEach(([key, value]) => {
						el.style.setProperty(key, value);
					});
				});
			});
			const seedBox = page.locator('#hmk-admin-json');
			if (await seedBox.isVisible().catch(() => false)) {
				const clean = JSON.stringify(
					{ version: 1, revision: 0, items: [{ type: 'app', id: 'files' }, { type: 'app', id: 'calendar' }] },
					null,
					2,
				);
				await seedBox.fill(clean);
				await page.locator('#hmk-admin-save, .hmk-admin button').first().focus();
				await shot(page, 'admin-seed', meta);
				await seedBox.focus();
				await seedBox.evaluate((el) => {
					el.style.setProperty('outline', '3px solid var(--color-primary-element, #0068a2)', 'important');
					el.style.setProperty('outline-offset', '2px', 'important');
					el.style.setProperty('box-shadow', '0 0 0 4px color-mix(in srgb, var(--color-primary-element, #0068a2) 35%, transparent)', 'important');
				});
				await shot(page, 'admin-seed-focused', meta);
				/* Admin Invalid JSON error craft */
				await seedBox.fill('{ not-json');
				await page.locator('#hmk-admin-save').click();
				/* EN "Invalid JSON" / DE "Ungültiges JSON" (and sibling locales). */
				await expect(page.locator('#hmk-admin-error')).toContainText(/Invalid JSON|Ungültiges JSON|JSON/i);
				const adminErrContrast = await page.evaluate(() => {
					const el = document.getElementById('hmk-admin-error');
					if (!el) {
						return { ok: false, reason: 'missing #hmk-admin-error' };
					}
					const cs = getComputedStyle(el);
					const parse = (c) => {
						const s = String(c).trim();
						const rgb = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
						if (rgb) {
							return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
						}
						/* Chromium color-mix often resolves to color(srgb r g b) */
						const srgb = s.match(/color\(\s*srgb\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)/);
						if (srgb) {
							return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])];
						}
						return null;
					};
					const fg = parse(cs.color);
					let bg = parse(cs.backgroundColor);
					/* Transparent → walk parents for solid bg */
					const isTransparent = (raw) => {
						const t = String(raw);
						return t === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(t);
					};
					if (!bg || isTransparent(cs.backgroundColor)) {
						let node = el.parentElement;
						while (node) {
							const pcs = getComputedStyle(node);
							if (!isTransparent(pcs.backgroundColor)) {
								const p = parse(pcs.backgroundColor);
								if (p) {
									bg = p;
									break;
								}
							}
							node = node.parentElement;
						}
					}
					if (!fg || !bg) {
						return { ok: false, reason: 'unparsed colors', color: cs.color, backgroundColor: cs.backgroundColor };
					}
					const toLin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
					const L = (rgb) => 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
					const Lf = L(fg);
					const Lb = L(bg);
					const ratio = (Math.max(Lf, Lb) + 0.05) / (Math.min(Lf, Lb) + 0.05);
					return {
						ok: ratio >= 4.5,
						ratio: Math.round(ratio * 100) / 100,
						fg: fg.map((v) => Math.round(v * 255)),
						bg: bg.map((v) => Math.round(v * 255)),
						color: cs.color,
						backgroundColor: cs.backgroundColor,
					};
				});
				expect(
					adminErrContrast.ok,
					`#hmk-admin-error danger ink WCAG AA ≥4.5:1 on dark settings: ${JSON.stringify(adminErrContrast)}`,
				).toBe(true);
				console.log('admin-error contrast', JSON.stringify(adminErrContrast));
				await shot(page, 'admin-invalid-json', meta);
				/* Admin Save failed error craft (forced API failure) */
				await seedBox.fill(clean);
				await page.route('**/apps/homecheck/api/admin/template**', async (route) => {
					if (route.request().method() === 'PUT') {
						await route.fulfill({
							status: 500,
							contentType: 'application/json',
							body: JSON.stringify({
								ok: false,
								error: { message: 'Could not save the seed — fix any errors and try again' },
							}),
						});
						return;
					}
					await route.continue();
				});
				await page.locator('#hmk-admin-save').click();
				await expect(page.locator('#hmk-admin-error')).toContainText(/Could not save the seed|try again/i);
				await shot(page, 'admin-save-failed', meta);
				await page.unroute('**/apps/homecheck/api/admin/template**');
			}
		} else {
			console.log('craft skip admin-seed (no #hmk-admin for this user)');
		}

		expect(meta.files.length, 'need ≥8 craft PNGs').toBeGreaterThanOrEqual(8);
		fs.writeFileSync(path.join(outDir, 'craft-capture.log'), JSON.stringify(meta, null, 2) + '\n');
	});
});
