// @ts-check
/**
 * ATLAS ds_chrome live contrast probe (homecheck) — ported from
 * einkaufcheck/projectcheck atlas-contrast-probe.mjs (3.5.15 lane duty).
 *
 * Logs in as the dedicated fixture users (hmk_ds_probe / hmk_ds_admin),
 * walks representative surfaces — launcher index, admin settings section,
 * dashboard desklet — and measures the COMPUTED WCAG 2.1 contrast of
 * semantic chrome: primary/danger CTAs, control borders, pane/menu
 * boundaries, status + error wells, aria-invalid painted borders and
 * field-error ink — across default / dark / light-highcontrast /
 * dark-highcontrast user themes (server-pinned via the OCS theming API,
 * body[data-theme-*] marker asserted after a real navigation — never
 * client-emulated).
 *
 *   text ink   >= 4.5:1  (WCAG 1.4.3 AA)
 *   borders    >= 3.0:1  (WCAG 1.4.11 non-text contrast)
 *
 * Usage (from the app dir):
 *   DS_PROBE_PASS=<secret> node e2e/helpers/atlas-contrast-probe.mjs [--out <path.json>]
 *
 * Env: DS_PROBE_PASS (defaults to the farm fixture secret), NC_BASE_URL or
 * HOMECHECK_BASE_URL override the canonical origin — one consistent origin
 * only (chromium_formaction_redirect class).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))

const BASE = (process.env.NC_BASE_URL || process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const PASS = process.env.DS_PROBE_PASS || 'DsProbe!hmk2026'
const USERS = {
	probe: 'hmk_ds_probe',
	admin: 'hmk_ds_admin',
}
const THEMES = ['default', 'dark', 'light-highcontrast', 'dark-highcontrast']

// ── WCAG contrast helpers (injected into the page for computed colors) ──
const EVAL_FN = String.raw`
function hexToRgb(c) {
  c = c.trim()
  if (c.startsWith('color(')) {
    const m = c.match(/[\d.]+/g)
    if (m && m.length >= 3) {
      const s = m.map(parseFloat)
      const scale = s.every((v) => v <= 1) ? 255 : 1
      return [s[0] * scale, s[1] * scale, s[2] * scale]
    }
    return null
  }
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g)
    if (m && m.length >= 3) return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2])]
    return null
  }
  if (c.startsWith('#')) {
    let h = c.slice(1)
    if (h.length === 3) h = h.split('').map(x => x + x).join('')
    if (h.length === 4) h = h.split('').map(x => x + x).join('')
    if (h.length === 6 || h.length === 8) {
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
    }
  }
  return null
}
function lum(rgb) {
  const f = v => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}
function effBgFrom(n) {
  while (n && n !== document.documentElement) {
    const bg = getComputedStyle(n).backgroundColor
    const m = bg && bg.match(/[\d.]+/g)
    if (m && m.length >= 4 && parseFloat(m[3]) > 0) return bg
    if (m && m.length === 3 && !bg.includes('transparent')) return bg
    n = n.parentElement
  }
  return getComputedStyle(document.body).backgroundColor
}
function effBg(el) {
  return effBgFrom(el)
}
function effBgParent(el) {
  return effBgFrom(el && el.parentElement)
}
function alphaOf(c) {
  const m = c && c.match(/[\d.]+/g)
  if (m && m.length >= 4) return parseFloat(m[3])
  if (c && c.startsWith('color(')) {
    const parts = c.match(/[\d.]+/g)
    if (parts && parts.length >= 4) return parseFloat(parts[3])
  }
  return 1
}
function blend(fgRgb, bgRgb, a) {
  return [
    a * fgRgb[0] + (1 - a) * bgRgb[0],
    a * fgRgb[1] + (1 - a) * bgRgb[1],
    a * fgRgb[2] + (1 - a) * bgRgb[2],
  ]
}
function ratio(fg, bg) {
  const a = hexToRgb(fg), b = hexToRgb(bg)
  if (!a || !b) return null
  const l1 = lum(a), l2 = lum(b)
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
function borderRatio(border, bg) {
  const f = hexToRgb(border), b = hexToRgb(bg)
  if (!f || !b) return null
  const alpha = alphaOf(border)
  const eff = alpha >= 1 ? f : blend(f, b, alpha)
  const l1 = lum(eff), l2 = lum(b)
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
window.__hmkProbe = { effBg, effBgParent, ratio, alphaOf, borderRatio }
`

/** Programmatic login — NC canonicalizes to localhost; stay on BASE origin. */
async function login(page, user) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
		const html = await page.content()
		if (/maintenance mode|update is in progress|needs to be updated/i.test(html)) {
			throw new Error('Nextcloud is in maintenance/upgrade mode')
		}
		if (!page.url().includes('/login')) {
			return
		}
		const userInput = page.locator('input[name="user"], #user')
		const pass = page.locator('input[name="password"], #password')
		await userInput.first().waitFor({ state: 'visible', timeout: 30_000 })
		await userInput.first().fill(user, { force: true })
		await pass.first().fill(PASS, { force: true })
		await page.evaluate(() => {
			const btn = document.querySelector('[data-login-form-submit], button[type="submit"], input[type="submit"], button.login-button')
			if (btn) /** @type {HTMLElement} */ (btn).click()
		})
		await page.waitForTimeout(1500)
		// Confirm a real session by visiting the app surface on THIS origin —
		// unauthenticated app pages redirect back to /login.
		await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
		if (!page.url().includes('/login')) {
			return
		}
	}
	throw new Error(`login_failed for ${user} — check DS_PROBE_PASS`)
}

/** Server-pinned OCS theme switch (learned: client flips fake HC readings). */
async function setUserTheme(page, themeId) {
	const failures = await page.evaluate(async ({ target, all }) => {
		const token = (window.OC && window.OC.requestToken)
			|| document.querySelector('head[data-requesttoken]')?.getAttribute('data-requesttoken') || ''
		const headers = { requesttoken: token, 'OCS-APIRequest': 'true', Accept: 'application/json' }
		const problems = []
		for (const id of all.filter((t) => t !== target)) {
			const res = await fetch(`/ocs/v2.php/apps/theming/api/v1/theme/${id}`, { method: 'DELETE', credentials: 'same-origin', headers })
			if (!res.ok && res.status !== 400) problems.push(`disable ${id}: HTTP ${res.status}`)
		}
		const res = await fetch(`/ocs/v2.php/apps/theming/api/v1/theme/${target}/enable`, { method: 'PUT', credentials: 'same-origin', headers })
		if (!res.ok && res.status !== 400) problems.push(`enable ${target}: HTTP ${res.status}`)
		return problems
	}, { target: themeId, all: THEMES })
	if (failures.length) throw new Error(`theme ${themeId}: ${failures.join(';')}`)
}

async function themeMarkerOk(page, themeId) {
	return page.evaluate((t) => {
		const attr = t === 'default' ? 'data-theme-default' : `data-theme-${t}`
		const dataThemes = document.body.getAttribute('data-themes') || ''
		return document.body.hasAttribute(attr) || dataThemes.split(/\s+/).includes(t)
			|| (t === 'default' && /default|light/.test(dataThemes))
	}, themeId)
}

/** Ensure ≥2 folder panes exist — the folder picker only renders when the
 *  user must choose between folders (0 → auto-create; 1 → adds directly). */
async function ensureFolder(page) {
	const count = await page.locator('#hmk-panels .hmk-pane[data-type="folder"]').count()
	if (count >= 2) return
	await page.evaluate(async () => {
		const token = window.OC?.requestToken || ''
		const raw = JSON.parse(document.getElementById('hmk-initial-state')?.textContent || '{}')
		/* Keep the live layout untouched — apps inside folder children must
		   not also appear top-level (validator: duplicate_entry 400). Only
		   prepend the folders needed to reach two. */
		const items = (raw.layout?.items || []).slice()
		const existing = items.filter((it) => it.type === 'folder')
		for (let i = existing.length; i < 2; i++) {
			items.unshift({ type: 'folder', id: `fld_dsprobe${i + 1}`, name: `DS Probe ${i + 1}`, children: [] })
		}
		const layout = {
			version: 1,
			revision: raw.layout?.revision ?? 0,
			hidden: raw.layout?.hidden || [],
			hiddenFolders: raw.layout?.hiddenFolders || [],
			items,
		}
		const url = window.OC?.generateUrl ? window.OC.generateUrl('/apps/homecheck/api/layout') : '/index.php/apps/homecheck/api/layout'
		const put = (l) => fetch(url, {
			method: 'PUT', credentials: 'same-origin',
			headers: { requesttoken: token, 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ requesttoken: token, layout: l }),
		}).then((r) => r.json().then((d) => ({ s: r.status, d })))
		let out = await put(layout)
		if (out.d?.ok === false && out.s === 409 && out.d?.data?.layout) {
			out = await put(Object.assign({}, layout, { revision: out.d.data.layout.revision }))
		}
		if (!out.d?.ok) console.warn('ensureFolder PUT failed:', JSON.stringify(out.d).slice(0, 200))
	})
	await page.reload({ waitUntil: 'domcontentloaded' })
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20_000 })
}

/** Elements to measure per page (probe role). Anchor = fabricated-capture guard. */
const PROBES = [
	{
		page: '/index.php/apps/homecheck/',
		anchor: '#hmk-main',
		label: 'index',
		setup: ensureFolder,
		rows: [
			{ sel: '#hmk-edit-toggle, #hmk-new-folder, #hmk-hidden-apps, #hmk-home-toggle, .hmk-chrome__btn', kind: 'chrome-btn', what: 'both' },
			{ sel: '.hmk-pane', kind: 'pane-border', what: 'outerborder' },
			{ sel: '.hmk-pane__launch, .hmk-pane__row-launch', kind: 'pane-launch-ink', what: 'text' },
			{ sel: '.hmk-pane__title-text, .hmk-pane__title', kind: 'pane-title-ink', what: 'text' },
			{ sel: '#hmk-cta.notecard', kind: 'cta-card-boundary', what: 'outerborder', optional: true },
			{ sel: '.hmk-pane__badge', kind: 'badge-ink', what: 'text', optional: true },
			{ sel: '.hmk-pane__icon-well', kind: 'icon-well-border', what: 'border' },
			{ sel: '.hmk-pane__icon:not(.hmk-pane__icon--fallback)', kind: 'icon-glyph-fill', what: 'iconfill', optional: true },
			{ sel: '.hmk-pane__empty', kind: 'empty-ink', what: 'text', optional: true },
			{ sel: '.hmk-edit-hint', kind: 'hint-ink', what: 'text', optional: true },
			{ sel: '.hmk-greeting', kind: 'greeting-ink', what: 'text' },
			{ sel: '.hmk-credit__link', kind: 'credit-link-ink', what: 'text' },
			{ sel: '#hmk-cta-yes', kind: 'cta-primary', what: 'both', optional: true },
			{ sel: '#hmk-cta-no', kind: 'cta-secondary', what: 'both', optional: true },
		],
		// Edit-mode chrome (pane ⋮ menus + toolbar buttons only render while
		// editing) — measured after toggling #hmk-edit-toggle on, then off.
		editRows: [
			{ sel: '.hmk-pane__menu summary', kind: 'menu-summary-border', what: 'both' },
			{ sel: '#hmk-new-folder, #hmk-hidden-apps', kind: 'edit-btn', what: 'both', optional: true },
			{ sel: '.hmk-menu button, .hmk-menu .button-vue', kind: 'menu-item', what: 'text', optional: true },
			{ sel: '.hmk-menu', kind: 'menu-boundary', what: 'outerborder', optional: true },
		],
	},
	{
		page: '/index.php/apps/dashboard/',
		anchor: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"])',
		label: 'desklet',
		rows: [
			{ sel: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"]) a.item-list__entry', kind: 'desklet-entry-ink', what: 'text', optional: true },
			{ sel: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"]) a.item-list__entry h3', kind: 'desklet-entry-title', what: 'text', optional: true },
			{ sel: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"]) .item__details .message', kind: 'desklet-entry-sub', what: 'text', optional: true },
			{ sel: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"]) a.more', kind: 'desklet-cta', what: 'both', optional: true },
			{ sel: '#app-dashboard .panel:has(.panel--header img[src*="/homecheck/"]) .empty-content', kind: 'desklet-empty-ink', what: 'text', optional: true },
		],
	},
	{
		page: '/index.php/settings/admin/additional',
		anchor: '#hmk-admin',
		label: 'admin',
		user: 'admin',
		rows: [
			{ sel: '#hmk-admin-json, .hmk-admin .hmk-textarea, .hmk-admin .hmk-input', kind: 'control-border', what: 'border' },
			{ sel: '#hmk-admin-save', kind: 'primary-cta', what: 'both' },
			{ sel: '#hmk-admin-clear', kind: 'ghost-cta', what: 'both' },
			{ sel: '.hmk-admin .hmk-label', kind: 'label-ink', what: 'text' },
			{ sel: '#hmk-admin-hint, .hmk-admin .hmk-muted', kind: 'muted-ink', what: 'text' },
		],
	},
]

async function settle(page) {
	await page.waitForLoadState('domcontentloaded').catch(() => {})
	try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* long-polls */ }
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

async function measure(page, probes) {
	const results = []
	for (const p of probes) {
		const resp = await page.goto(`${BASE}${p.page}`, { waitUntil: 'domcontentloaded' })
		if (!resp || resp.status() >= 400) {
			results.push({ page: p.label, error: `http ${resp ? resp.status() : 'nav-fail'}`, rows: [] })
			continue
		}
		// Surface anchor assert BEFORE any measurement (fabricated-capture guard).
		try {
			await page.waitForSelector(p.anchor, { timeout: 30_000 })
		} catch {
			results.push({ page: p.label, error: `anchor ${p.anchor} missing — not the app surface`, rows: [] })
			continue
		}
		if (p.setup) await p.setup(page).catch(() => {})
		await settle(page)
		const pageRes = { page: p.label, rows: [] }
		const measureRow = async (row) => {
			const found = await page.evaluate(
				async ({ sel, what, borderSide }) => {
					const els = Array.from(document.querySelectorAll(sel)).filter(
						(n) => n.offsetParent !== null,
					)
					const out = []
					for (const el of els.slice(0, 6)) {
						const cs = getComputedStyle(el)
						const bg = window.__hmkProbe.effBg(el)
						const border = borderSide ? cs[borderSide] : cs.borderColor
						const bWidth = borderSide ? cs.borderInlineStartWidth : cs.borderWidth
						const item = {
							tag: el.tagName.toLowerCase(),
							cls: (el.getAttribute('class') || '').slice(0, 80),
							fg: cs.color,
							bg,
							borderColor: border,
							borderWidth: bWidth,
							selfBg: cs.backgroundColor,
						}
						if (what === 'iconfill') {
							// Masked glyph: the painted fill is background-color; the
							// background it sits on is the icon well tint.
							item.fillRatio = window.__hmkProbe.ratio(cs.backgroundColor, window.__hmkProbe.effBgParent(el))
						} else if (what === 'outerborder') {
							/* Card/container boundaries are identified against
							   the SURROUNDING surface (canvas/card), not the
							   card's own fill — WCAG 1.4.11 adjacent colors. */
							item.borderRatio = parseFloat(bWidth) > 0
								? window.__hmkProbe.borderRatio(border, window.__hmkProbe.effBgParent(el))
								: null
							item.outerBg = window.__hmkProbe.effBgParent(el)
						} else {
							if (what !== 'border') {
								item.textRatio = window.__hmkProbe.ratio(cs.color, bg)
							}
							if (what !== 'text' && parseFloat(bWidth) > 0) {
								if (border !== cs.backgroundColor) {
									item.borderRatio = window.__hmkProbe.borderRatio(border, bg)
									item.borderAlpha = window.__hmkProbe.alphaOf(border)
								} else {
									item.fillRatio = window.__hmkProbe.ratio(cs.backgroundColor, window.__hmkProbe.effBgParent(el))
								}
							}
						}
						out.push(item)
					}
					return out
				},
				{ sel: row.sel, what: row.what, borderSide: row.borderSide || null },
			)
			pageRes.rows.push({ kind: row.kind, selector: row.sel, what: row.what, found: found.length, optional: !!row.optional, samples: found })
		}
		for (const row of p.rows || []) {
			await measureRow(row)
		}
		// Edit-mode rows: toggle edit on, open the first pane menu so
		// .hmk-menu renders, measure, then restore view mode.
		if (p.editRows && p.editRows.length) {
			const edit = page.locator('#hmk-edit-toggle')
			if (await edit.count()) {
				if ((await edit.getAttribute('aria-pressed')) !== 'true') await edit.click()
				await page.waitForTimeout(300)
				await page.locator('#hmk-panels .hmk-pane details.hmk-pane__menu summary').first()
					.evaluate((el) => /** @type {HTMLElement} */ (el).click()).catch(() => {})
				await page.waitForTimeout(200)
				for (const row of p.editRows) {
					await measureRow(row)
				}
				await page.keyboard.press('Escape').catch(() => {})
				await edit.click()
				await page.waitForTimeout(200)
			}
		}
		results.push(pageRes)
	}
	return results
}

/**
 * Folder-open + prompt + confirm dialogs: measure control/button boundaries,
 * the danger confirm, and the aria-invalid painted border + error ink
 * (learned class: aria-invalid without painted border). Runs on the probe
 * user's index surface; dialogs mount inside #homecheck-app.
 */
async function measureDialogs(page) {
	const out = {}
	await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20_000 })
	await ensureFolder(page)
	await settle(page)
	const i18n = async (k) => page.evaluate((key) => {
		const node = document.getElementById('hmk-i18n')
		const dict = node && node.textContent ? JSON.parse(node.textContent) : {}
		return dict[key] || ''
	}, k)

	// Enter edit mode so the pane ⋮ menus render.
	const edit = page.locator('#hmk-edit-toggle')
	if ((await edit.getAttribute('aria-pressed')) !== 'true') await edit.click()
	await page.waitForTimeout(300)

	const menuItem = async (pane, label) => {
		await pane.locator('details.hmk-pane__menu summary').first().evaluate((el) => /** @type {HTMLElement} */ (el).click())
		const item = pane.getByRole('menuitem', { name: label, exact: true }).first()
		await item.waitFor({ state: 'visible', timeout: 5000 })
		return item
	}

	const measureIn = (sel, innerSel) => page.evaluate(({ sel, innerSel }) => {
		const dlg = [...document.querySelectorAll(sel)].find((d) => d.open || d.offsetParent !== null)
		if (!dlg) return { error: 'dialog not open: ' + sel }
		const els = [...dlg.querySelectorAll(innerSel)].filter((n) => n.offsetParent !== null)
		return {
			dialogBorder: (() => {
				const cs = getComputedStyle(dlg)
				return { borderColor: cs.borderColor, borderWidth: cs.borderWidth, ratio: window.__hmkProbe.borderRatio(cs.borderColor, window.__hmkProbe.effBg(dlg)) }
			})(),
			samples: els.slice(0, 8).map((el) => {
				const cs = getComputedStyle(el)
				const bg = window.__hmkProbe.effBg(el)
				const bordered = parseFloat(cs.borderWidth) > 0
				const borderDiffers = bordered && cs.borderColor !== cs.backgroundColor
				return {
					tag: el.tagName.toLowerCase(),
					cls: (el.getAttribute('class') || '').slice(0, 60),
					fg: cs.color,
					borderColor: cs.borderColor,
					borderWidth: cs.borderWidth,
					bg,
					textRatio: window.__hmkProbe.ratio(cs.color, bg),
					borderRatio: borderDiffers ? window.__hmkProbe.borderRatio(cs.borderColor, bg) : null,
					fillRatio: bordered && !borderDiffers ? window.__hmkProbe.ratio(cs.backgroundColor, window.__hmkProbe.effBgParent(el)) : null,
				}
			}),
		}
	}, { sel, innerSel })

	// 1) prompt-dialog: rename folder → measure input border, then invalid
	//    submit → aria-invalid must carry a painted danger border + error ink.
	{
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const item = await menuItem(folder, await i18n('rename'))
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		await page.locator('#hmk-prompt-dialog').waitFor({ state: 'visible', timeout: 8000 })
		await settle(page)
		out.promptDialog = await measureIn('#hmk-prompt-dialog', 'button, input')
		// Invalid submit (empty name) → aria-invalid path.
		await page.locator('#hmk-prompt-input').fill('')
		await page.locator('#hmk-prompt-ok').click()
		await page.waitForTimeout(400)
		out.invalidState = await page.evaluate(() => {
			const input = document.getElementById('hmk-prompt-input')
			if (!input) return { error: 'prompt input detached' }
			const cs = getComputedStyle(input)
			const bg = window.__hmkProbe.effBg(input)
			const res = {
				ariaInvalid: input.getAttribute('aria-invalid'),
				ariaDescribedby: input.getAttribute('aria-describedby'),
				border: {
					borderColor: cs.borderColor,
					borderWidth: cs.borderWidth,
					borderRatio: window.__hmkProbe.borderRatio(cs.borderColor, bg),
				},
				boxShadow: cs.boxShadow,
			}
			const err = document.querySelector('#hmk-prompt-error:not(:empty)')
			if (err) {
				const ecs = getComputedStyle(err)
				res.errorText = {
					text: (err.textContent || '').slice(0, 120),
					color: ecs.color,
					bg: window.__hmkProbe.effBg(err),
					textRatio: window.__hmkProbe.ratio(ecs.color, window.__hmkProbe.effBg(err)),
				}
			}
			res.errorShown = !!err
			return res
		})
		await page.keyboard.press('Escape').catch(() => {})
	}

	// 2) confirm-dialog: delete folder → danger CTA measured (cancel only).
	{
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const item = await menuItem(folder, await i18n('deleteFolder'))
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		await page.locator('#hmk-confirm-dialog').waitFor({ state: 'visible', timeout: 8000 })
		await settle(page)
		out.confirmDialog = await measureIn('#hmk-confirm-dialog', 'button')
		out.dangerCta = await page.evaluate(() => {
			const el = document.getElementById('hmk-confirm-ok')
			if (!el) return { error: 'no danger cta' }
			const cs = getComputedStyle(el)
			return {
				fg: cs.color,
				selfBg: cs.backgroundColor,
				borderColor: cs.borderColor,
				textRatio: window.__hmkProbe.ratio(cs.color, cs.backgroundColor),
			}
		})
		await page.locator('#hmk-confirm-cancel').click().catch(() => {})
		await page.keyboard.press('Escape').catch(() => {})
	}

	// 3) folder-picker — interactive picker rows are controls; their 2px
	//    boundary must clear 3:1 vs the dialog surface.
	{
		const app = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()
		const item = await menuItem(app, await i18n('addToFolder'))
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		await page.locator('#hmk-folder-picker').waitFor({ state: 'visible', timeout: 8000 })
		await settle(page)
		out.pickerDialog = await page.evaluate(() => {
			const dlg = document.getElementById('hmk-folder-picker')
			const items = [...(dlg?.querySelectorAll('.hmk-picker-list__item') || [])]
				.filter((n) => n.offsetParent !== null).slice(0, 6)
			return items.map((el) => {
				const cs = getComputedStyle(el)
				const bg = window.__hmkProbe.effBg(el)
				return {
					cls: (el.getAttribute('class') || '').slice(0, 60),
					fg: cs.color,
					borderColor: cs.borderColor,
					borderWidth: cs.borderWidth,
					bg,
					textRatio: window.__hmkProbe.ratio(cs.color, bg),
					borderRatio: window.__hmkProbe.borderRatio(cs.borderColor, bg),
				}
			})
		})
		await page.locator('#hmk-folder-picker-cancel').click().catch(() => {})
		await page.keyboard.press('Escape').catch(() => {})
	}
	return out
}

/** Admin error well: real invalid-JSON save renders #hmk-admin-error. */
async function measureAdminErrorWell(page) {
	await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' })
	await page.waitForSelector('#hmk-admin', { timeout: 30_000 })
	await settle(page)
	await page.locator('#hmk-admin-json').fill('{ "version": 1, broken')
	await page.locator('#hmk-admin-save').click()
	await page.waitForTimeout(700)
	return page.evaluate(() => {
		const err = document.getElementById('hmk-admin-error')
		const ta = document.getElementById('hmk-admin-json')
		if (!err) return { error: 'no #hmk-admin-error' }
		const ecs = getComputedStyle(err)
		const out = {
			text: (err.textContent || '').trim().slice(0, 120),
			empty: !(err.textContent || '').trim(),
			color: ecs.color,
			bg: ecs.backgroundColor,
			borderColor: ecs.borderColor,
			borderWidth: ecs.borderWidth,
			textRatio: window.__hmkProbe.ratio(ecs.color, window.__hmkProbe.effBg(err)),
			borderRatio: parseFloat(ecs.borderWidth) > 0 ? window.__hmkProbe.borderRatio(ecs.borderColor, window.__hmkProbe.effBg(err)) : null,
		}
		if (ta) {
			const tcs = getComputedStyle(ta)
			out.invalidTextarea = {
				ariaInvalid: ta.getAttribute('aria-invalid'),
				borderColor: tcs.borderColor,
				borderRatio: window.__hmkProbe.borderRatio(tcs.borderColor, window.__hmkProbe.effBg(ta)),
			}
		}
		return out
	})
}

/**
 * Semantic accent surfaces not always reachable from fixture state: inject
 * representative nodes into the live document and measure the COMPUTED token
 * resolution (stylesheet truth) — status wells, badge, empty state.
 * Cascade-shadowing-of-danger-wells guard: .hmk-status.is-error must keep
 * its danger paint (ekc class — a later equal-specificity rule must not
 * shadow the well back to neutral).
 */
async function measureAccentSurfaces(page) {
	// app.css is only loaded on HomeCheck surfaces — measuring token
	// resolution on any other page (dashboard/settings) yields raw UA
	// styles and bogus findings. Always measure on the app index.
	await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
	await page.locator('#hmk-main').first().waitFor({ state: 'visible', timeout: 20_000 })
	await settle(page)
	return page.evaluate(() => {
		const host = document.getElementById('homecheck-app') || document.getElementById('app-content') || document.body
		const out = []
		const mk = (cls, tag = 'p', parent = host) => {
			const el = document.createElement(tag)
			el.className = cls
			el.textContent = 'probe'
			parent.appendChild(el)
			return el
		}
		for (const cls of ['hmk-status is-error', 'hmk-status is-success', 'hmk-status']) {
			const el = mk(cls)
			const cs = getComputedStyle(el)
			const bg = window.__hmkProbe.effBg(el)
			out.push({
				kind: `status:${cls}`,
				selfBg: cs.backgroundColor,
				bg,
				fg: cs.color,
				borderColor: cs.borderColor,
				borderWidth: cs.borderWidth,
				textRatio: window.__hmkProbe.ratio(cs.color, bg),
				borderRatio: parseFloat(cs.borderWidth) > 0 ? window.__hmkProbe.borderRatio(cs.borderColor, bg) : null,
			})
			el.remove()
		}
		// .hmk-error ink is measured on its REAL surfaces — the prompt-dialog
		// error leg + the admin error well — not injected on the bare canvas
		// (no real .hmk-error ever renders directly on the wallpaper).
		for (const cls of ['hmk-pane__badge', 'hmk-empty']) {
			const el = mk(cls, cls === 'hmk-pane__badge' ? 'span' : 'p')
			const cs = getComputedStyle(el)
			const bg = window.__hmkProbe.effBg(el)
			out.push({
				kind: `ink:${cls}`,
				fg: cs.color,
				selfBg: cs.backgroundColor,
				bg,
				textRatio: window.__hmkProbe.ratio(cs.color, bg),
			})
			el.remove()
		}
		// Danger button fill+ink pair (theme-flipping mix class:
		// color-mix→primary-element-text resolves near-black in dark themes —
		// on a lightened danger fill that is only AA if the pair is measured).
		const btn = mk('button-vue hmk-btn--danger', 'button')
		const bcs = getComputedStyle(btn)
		out.push({
			kind: 'danger-button',
			fg: bcs.color,
			selfBg: bcs.backgroundColor,
			borderColor: bcs.borderColor,
			borderWidth: bcs.borderWidth,
			textRatio: window.__hmkProbe.ratio(bcs.color, bcs.backgroundColor),
		})
		btn.remove()
		// Secondary/ghost pair under each theme.
		const ghost = mk('button-vue secondary', 'button')
		const gcs = getComputedStyle(ghost)
		out.push({
			kind: 'ghost-button',
			fg: gcs.color,
			selfBg: gcs.backgroundColor,
			borderColor: gcs.borderColor,
			borderWidth: gcs.borderWidth,
			textRatio: window.__hmkProbe.ratio(gcs.color, gcs.backgroundColor),
		})
		ghost.remove()
		return out
	})
}

async function runForUser(browser, role) {
	const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } })
	const page = await context.newPage()
	await login(page, USERS[role])
	await context.addInitScript(EVAL_FN)
	await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
	await page.evaluate(new Function(EVAL_FN))
	return { context, page }
}

async function main() {
	const browser = await chromium.launch({ headless: true })
	const report = {
		app: 'homecheck', probe: 'live-computed-contrast', base: BASE,
		users: USERS,
		generated_at: new Date().toISOString(),
		note: 'hmk_ds_probe (index+desklet) / hmk_ds_admin (admin section) fixtures; OCS-persisted themes; canonical localhost origin',
		themes: {},
	}

	try {
		const { context, page } = await runForUser(browser, 'probe')
		// Ensure the desklet is on the probe user's dashboard (v3 layout API —
		// v1 was removed in NC 35 and 404s silently).
		await page.goto(`${BASE}/index.php/apps/dashboard/`, { waitUntil: 'domcontentloaded' })
		const layoutRes = await page.evaluate(async () => {
			const token = window.OC?.requestToken || document.querySelector('head[data-requesttoken]')?.getAttribute('data-requesttoken') || ''
			const headers = { requesttoken: token, 'OCS-APIRequest': 'true', 'Content-Type': 'application/json', Accept: 'application/json' }
			const res = await fetch('/ocs/v2.php/apps/dashboard/api/v3/layout', {
				method: 'POST', credentials: 'same-origin', headers,
				body: JSON.stringify({ layout: ['homecheck-launcher', 'recommendations', 'calendar', 'user_status'] }),
			})
			return { status: res.status, body: (await res.text()).slice(0, 300) }
		})
		if (layoutRes.status !== 200) {
			report.deskletSeedWarning = `dashboard layout POST → ${layoutRes.status}: ${layoutRes.body}`
		}

		for (const theme of THEMES) {
			await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
			await setUserTheme(page, theme)
			// Marker assert AFTER a real navigation — OCS persistence is only
			// painted on the next render (never trust pre-nav body attrs).
			await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
			const markerOk = await themeMarkerOk(page, theme)
			const pages = PROBES.filter((p) => p.user !== 'admin')
			const themeRes = { themeMarker: markerOk, pages: await measure(page, pages) }
			if (theme === 'default' || theme === 'dark') {
				themeRes.dialogs = await measureDialogs(page)
			}
			themeRes.accents = await measureAccentSurfaces(page)
			report.themes[theme] = themeRes
		}
		// Restore fixture user to default for subsequent lanes.
		await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
		await setUserTheme(page, 'default')
		await context.close()
	} catch (e) {
		report.probeError = String(e)
	}

	// Admin leg — settings page + real error well, across all four themes.
	try {
		const { context, page } = await runForUser(browser, 'admin')
		for (const theme of THEMES) {
			await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' })
			await setUserTheme(page, theme)
			await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' })
			const markerOk = await themeMarkerOk(page, theme)
			const t = (report.themes[theme] = report.themes[theme] || {})
			t.adminThemeMarker = markerOk
			t.adminPages = await measure(page, PROBES.filter((p) => p.user === 'admin'))
			if (theme === 'default' || theme === 'dark') {
				t.adminErrorWell = await measureAdminErrorWell(page)
			}
		}
		await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' })
		await setUserTheme(page, 'default')
		await context.close()
	} catch (e) {
		report.adminError = String(e)
	}

	await browser.close()

	const TEXT_MIN = 4.5
	const BORDER_MIN = 3.0
	const findings = []
	const judgeRows = (theme, pr) => {
		for (const row of pr.rows || []) {
			if (row.found === 0 && !row.optional) {
				findings.push({ theme, page: pr.page, kind: 'probe-selector-empty', detail: row.selector })
				continue
			}
			for (const s of row.samples || []) {
				if (s.textRatio !== undefined && s.textRatio !== null && s.textRatio < TEXT_MIN) {
					findings.push({ theme, page: pr.page, kind: row.kind, cls: s.cls, ratio: s.textRatio, min: TEXT_MIN })
				}
				if (s.borderRatio !== undefined && s.borderRatio !== null && s.borderRatio < BORDER_MIN) {
					findings.push({ theme, page: pr.page, kind: row.kind + '-border', cls: s.cls, ratio: s.borderRatio, min: BORDER_MIN })
				}
				if (s.fillRatio !== undefined && s.fillRatio !== null && s.fillRatio < BORDER_MIN) {
					findings.push({ theme, page: pr.page, kind: row.kind + '-fill-boundary', cls: s.cls, ratio: s.fillRatio, min: BORDER_MIN })
				}
			}
		}
	}
	for (const [theme, t] of Object.entries(report.themes)) {
		if (t.themeMarker === false) findings.push({ theme, kind: 'theme-marker-missing' })
		if (t.adminThemeMarker === false) findings.push({ theme, kind: 'admin-theme-marker-missing' })
		for (const pr of t.pages || []) {
			if (pr.error) { findings.push({ theme, page: pr.page, kind: 'page-error', detail: pr.error }); continue }
			judgeRows(theme, pr)
		}
		for (const pr of t.adminPages || []) {
			if (pr.error) { findings.push({ theme, page: pr.page, kind: 'page-error', detail: pr.error }); continue }
			judgeRows(theme, pr)
		}
		for (const s of t.accents || []) {
			if (s.textRatio !== null && s.textRatio !== undefined && s.textRatio < TEXT_MIN) {
				findings.push({ theme, page: 'accents', kind: s.kind + '-ink', ratio: s.textRatio, min: TEXT_MIN })
			}
			if (s.borderRatio !== null && s.borderRatio !== undefined && s.borderRatio < BORDER_MIN) {
				findings.push({ theme, page: 'accents', kind: s.kind + '-border', ratio: s.borderRatio, min: BORDER_MIN })
			}
		}
		const d = t.dialogs
		if (d) {
			for (const s of d.pickerDialog || []) {
				if (s.textRatio !== null && s.textRatio < TEXT_MIN) {
					findings.push({ theme, page: 'dialog:picker', kind: 'picker-row-ink', cls: s.cls, ratio: s.textRatio, min: TEXT_MIN })
				}
				if (s.borderRatio !== null && s.borderRatio !== undefined && s.borderRatio < BORDER_MIN) {
					findings.push({ theme, page: 'dialog:picker', kind: 'picker-row-border', cls: s.cls, ratio: s.borderRatio, min: BORDER_MIN })
				}
			}
			for (const [name, dlg] of Object.entries({ prompt: d.promptDialog, confirm: d.confirmDialog })) {
				if (!dlg || dlg.error) continue
				for (const s of dlg.samples || []) {
					if (s.textRatio !== null && s.textRatio < TEXT_MIN) {
						findings.push({ theme, page: `dialog:${name}`, kind: 'dialog-ink', cls: s.cls, ratio: s.textRatio, min: TEXT_MIN })
					}
					if (s.borderRatio !== null && s.borderRatio !== undefined && s.borderRatio < BORDER_MIN) {
						findings.push({ theme, page: `dialog:${name}`, kind: 'dialog-border', cls: s.cls, ratio: s.borderRatio, min: BORDER_MIN })
					}
				}
			}
			const inv = d.invalidState
			if (inv && !inv.error) {
				if (inv.ariaInvalid !== 'true') {
					findings.push({ theme, page: 'prompt-dialog', kind: 'aria-invalid-missing', detail: `aria-invalid=${inv.ariaInvalid}` })
				} else if (inv.border && inv.border.borderRatio !== null && inv.border.borderRatio < BORDER_MIN) {
					findings.push({ theme, page: 'prompt-dialog', kind: 'invalid-border', ratio: inv.border.borderRatio, min: BORDER_MIN })
				}
				// aria-invalid unpainted (learned class): the invalid control
				// must carry a DIFFERENT border than its valid state — a neutral
				// --hmk-border-strong edge alone signals nothing.
				const validInput = (d.promptDialog?.samples || []).find((s) => s.tag === 'input')
				if (validInput && inv.border && inv.border.borderColor === validInput.borderColor) {
					findings.push({
						theme, page: 'prompt-dialog', kind: 'aria-invalid-unpainted',
						detail: `invalid border equals valid border (${inv.border.borderColor}) — no visual differentiation`,
					})
				}
				if (inv.errorText && inv.errorText.textRatio !== null && inv.errorText.textRatio < TEXT_MIN) {
					findings.push({ theme, page: 'prompt-dialog', kind: 'field-error-text', ratio: inv.errorText.textRatio, min: TEXT_MIN })
				}
			}
			if (d.dangerCta && !d.dangerCta.error && d.dangerCta.textRatio !== null && d.dangerCta.textRatio < TEXT_MIN) {
				findings.push({ theme, page: 'dialog:confirm', kind: 'danger-cta-ink', ratio: d.dangerCta.textRatio, min: TEXT_MIN })
			}
		}
		const well = t.adminErrorWell
		if (well && !well.error) {
			if (well.empty) findings.push({ theme, page: 'admin', kind: 'error-well-empty-after-invalid-save' })
			if (well.textRatio !== null && well.textRatio !== undefined && well.textRatio < TEXT_MIN) {
				findings.push({ theme, page: 'admin', kind: 'error-well-ink', ratio: well.textRatio, min: TEXT_MIN })
			}
			if (well.borderRatio !== null && well.borderRatio !== undefined && well.borderRatio < BORDER_MIN) {
				findings.push({ theme, page: 'admin', kind: 'error-well-border', ratio: well.borderRatio, min: BORDER_MIN })
			}
		}
	}
	report.findings = findings
	report.verdict = findings.length === 0 ? 'PASS' : 'FAIL'

	const outIdx = process.argv.indexOf('--out')
	const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null
	if (outPath) {
		mkdirSync(dirname(outPath), { recursive: true })
		writeFileSync(outPath, JSON.stringify(report, null, 2))
		console.log(`wrote ${outPath}`)
	} else {
		console.log(JSON.stringify(report, null, 2).slice(0, 4000))
	}
	console.log(`contrast probe: ${report.verdict} (${findings.length} findings)`)
	process.exit(findings.length > 0 ? 1 : 0)
}

main().catch((e) => {
	console.error(e)
	process.exit(2)
})
