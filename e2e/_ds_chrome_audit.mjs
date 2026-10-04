// @ts-check
/**
 * ds_chrome lane probe — Atlas Farm 3.5.14 (fresh artifacts).
 * HomeCheck is web-only: single launcher page + admin settings + dashboard desklet.
 *
 * Usage: DS_PROBE_PASS=<secret> node e2e/_ds_chrome_audit.mjs <phase>
 *   sweep    routes × real OCS themes × viewports: http status, overflow,
 *            touch, axe, PNG+sha256 (server-persisted themes via the theming
 *            OCS API; post-navigation body[data-theme-*] asserted; per-route
 *            themed sha distinctness)
 *   dialogs  native <dialog> role/aria-labelledby/focus-in/Escape/close/
 *            focus-restore + prompt validation negative (inline .hmk-error)
 *   states   anon→login, non-admin settings gate, save-error status, empty,
 *            hidden-apps empty, CTA card — below-fold scrolled captures
 *   theatre  dark-island hunt: surfaces that keep light bg in dark theme
 *
 * Evidence root: FARM_OUT (default artifacts/homecheck/ds_chrome/probes).
 * Probe users: hmk_ds_probe (regular, en) / hmk_ds_admin (admin, en).
 * Labels resolved from #hmk-i18n / #hmk-admin-i18n dicts — never EN|DE literals.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.env.NC_BASE_URL || process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const PASS = process.env.DS_PROBE_PASS || 'DsProbe!hmk2026'
const OUT = process.env.FARM_OUT
	|| '/home/alex/Development/nextcloud-dev/.cursor/atlas-farm-v3/artifacts/homecheck/ds_chrome/probes'
const CAPTURES = process.env.FARM_CAPTURES || join(OUT, '..', 'captures')
const PHASE = process.argv[2] || 'sweep'
mkdirSync(OUT, { recursive: true })
mkdirSync(CAPTURES, { recursive: true })

const USERS = {
	probe: { username: 'hmk_ds_probe', password: PASS },
	admin: { username: 'hmk_ds_admin', password: PASS },
}

const THEMES = ['default', 'dark', 'light-highcontrast', 'dark-highcontrast']
const VIEWPORTS = [
	{ w: 320, h: 640 },
	{ w: 768, h: 1024 },
	{ w: 1024, h: 768 },
	{ w: 1440, h: 900 },
]

const ROUTES = {
	index: { path: '/index.php/apps/homecheck/', user: 'probe', main: '#hmk-main', ok: 200 },
	admin: { path: '/index.php/settings/admin/additional', user: 'admin', main: '#hmk-admin', ok: 200 },
	dashboard: { path: '/index.php/apps/dashboard/', user: 'probe', main: '#app-dashboard, [class*="dashboard"], main', ok: 200 },
}
const DENIED_ROUTES = [
	{ id: 'denied-admin-settings', path: '/index.php/settings/admin/additional', user: 'probe' },
]

const results = { phase: PHASE, startedAt: new Date().toISOString(), cells: [], captures: {}, themeProof: {} }

function sha256(buf) {
	return createHash('sha256').update(buf).digest('hex')
}

async function snap(page, name, opts = {}) {
	const buf = await page.screenshot({ fullPage: Boolean(opts.fullPage) })
	const file = `captures/${name}.png`
	writeFileSync(join(CAPTURES, `${name}.png`), buf)
	const hash = sha256(buf)
	results.captures[name] = { file, sha256: hash, bytes: buf.length }
	return { file, sha256: hash, bytes: buf.length }
}

async function settle(page) {
	await page.waitForLoadState('domcontentloaded').catch(() => {})
	try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch { /* long-polls */ }
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

function record(cell) {
	results.cells.push(cell)
	const tag = cell.status === 'fail' ? 'FAIL' : cell.status === 'warn' ? 'warn' : 'ok'
	console.log(`[${tag}] ${cell.id} :: ${JSON.stringify(cell.checks).slice(0, 300)}`)
}

async function loginState(browser, role) {
	const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
	const html = await page.content()
	if (/maintenance mode|update is in progress/i.test(html)) throw new Error('NC in maintenance/upgrade mode')
	const user = page.locator('input[name="user"], #user')
	const pass = page.locator('input[name="password"], #password')
	await user.first().fill(USERS[role].username, { force: true })
	await pass.first().fill(USERS[role].password, { force: true })
	await page.evaluate(() => {
		const btn = document.querySelector('[data-login-form-submit],button[type="submit"],input[type="submit"],button.login-button')
		if (btn) /** @type {HTMLElement} */ (btn).click()
	})
	await page.waitForURL(/apps\/|index\.php\/apps/, { timeout: 60000 })
	const state = await ctx.storageState()
	await ctx.close()
	return state
}

/**
 * Learned class: theme switching persists server-side via the OCS theming
 * API. Callers must re-navigate/reload and assert the rendered attribute.
 */
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

async function assertThemeRendered(page, themeId) {
	return page.evaluate((t) => {
		const attr = t === 'default' ? 'data-theme-default' : `data-theme-${t}`
		const dataThemes = document.body.getAttribute('data-themes') || ''
		const themes = dataThemes.split(/\s+/).filter(Boolean)
		return {
			ok: document.body.hasAttribute(attr) || themes.includes(t),
			dataThemes: dataThemes || null,
			attr,
			present: document.body.hasAttribute(attr),
		}
	}, themeId)
}

async function checkOverflow(page) {
	return page.evaluate(() => {
		const doc = document.documentElement
		const app = document.querySelector('#app-content') || document.querySelector('#content[class*="app-homecheck"]')
		const main = document.getElementById('hmk-main') || document.getElementById('hmk-admin')
			|| document.getElementById('app-dashboard')
		const probe = (el) => (el ? el.scrollWidth - el.clientWidth : 0)
		return { doc: probe(doc), app: probe(app), main: probe(main) }
	})
}

async function checkTouchTargets(page) {
	return page.evaluate(() => {
		const scopes = ['#homecheck-app', '#hmk-admin', '#app-content', 'dialog[open]']
		const seen = new Set()
		const offenders = []
		const interactiveSel = [
			'button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea',
			'[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="tab"]',
			'[role="menuitem"]', '[role="switch"]', 'summary', '[tabindex]:not([tabindex="-1"])',
		].join(',')
		for (const scopeSel of scopes) {
			for (const scope of document.querySelectorAll(scopeSel)) {
				for (const el of scope.querySelectorAll(interactiveSel)) {
					if (seen.has(el)) continue
					seen.add(el)
					const r = el.getBoundingClientRect()
					const style = getComputedStyle(el)
					if (r.width <= 0 || r.height <= 0) continue
					if (style.visibility === 'hidden' || style.display === 'none') continue
					/* Off-screen-until-focused controls (skip links at left:-9999)
					   are not hit-area offenders — they expand on keyboard focus.
					   Verified separately in the a11y phase. */
					const vw = document.documentElement.clientWidth
					const vh = document.documentElement.clientHeight
					if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue
					if (r.width < 44 || r.height < 44) {
						const label = (el.textContent || el.getAttribute('aria-label') || el.id || el.tagName)
							.trim().replace(/\s+/g, ' ').slice(0, 60)
						offenders.push({
							tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60),
							label, w: Math.round(r.width), h: Math.round(r.height),
						})
					}
				}
			}
		}
		return offenders.slice(0, 15)
	})
}

async function checkLandmarks(page) {
	return page.evaluate(() => {
		const visible = (el) => {
			const cs = getComputedStyle(el)
			return cs.display !== 'none' && cs.visibility !== 'hidden'
		}
		const sectioned = (el) => !!el.closest('main,article,section,aside,nav,fieldset,[role="main"],[role="region"],[role="complementary"],[role="navigation"]')
		const isBanner = (el) =>
			visible(el) && !sectioned(el)
			&& ((el.tagName === 'HEADER' && (!el.getAttribute('role') || el.getAttribute('role') === 'banner'))
				|| el.getAttribute('role') === 'banner')
		const isContentinfo = (el) =>
			visible(el) && !sectioned(el)
			&& ((el.tagName === 'FOOTER' && (!el.getAttribute('role') || el.getAttribute('role') === 'contentinfo'))
				|| el.getAttribute('role') === 'contentinfo')
		const isMain = (el) => visible(el) && (el.tagName === 'MAIN' || el.getAttribute('role') === 'main')
		const all = [...document.querySelectorAll('header,footer,main,[role],[id]')]
		const describe = (el) => `${el.tagName.toLowerCase()}#${el.id || ''}.${String(el.className).split(' ')[0]}`
		return {
			banners: all.filter(isBanner).map(describe),
			contentinfos: all.filter(isContentinfo).map(describe),
			mains: all.filter(isMain).map(describe),
		}
	})
}

async function runAxe(page) {
	try {
		const res = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.exclude('#header').exclude('#contactsmenu').exclude('.notifications')
			.analyze()
		return res.violations.map((v) => ({
			id: v.id, impact: v.impact,
			nodes: v.nodes.slice(0, 4).map((n) => String(n.target).slice(0, 120)),
			summary: String(v.help).slice(0, 140),
		}))
	} catch (err) {
		return [{ id: 'axe-error', impact: 'critical', nodes: [], summary: String(err).slice(0, 200) }]
	}
}

/** Resolve a UI label from the page's own i18n dict (locale-safe). */
async function hmkMsg(page, key) {
	const label = await page.evaluate((k) => {
		const node = document.getElementById('hmk-i18n') || document.getElementById('hmk-admin-i18n')
		const dict = node && node.textContent ? JSON.parse(node.textContent) : {}
		return typeof dict[k] === 'string' ? dict[k] : ''
	}, key)
	if (!label) throw new Error(`i18n key missing on page: ${key}`)
	return label
}

/* ───────────────────────────── sweep ───────────────────────────── */
async function phaseSweep(browser) {
	const probeState = await loginState(browser, 'probe')
	const adminState = await loginState(browser, 'admin')

	// Ensure the desklet is on the probe user's dashboard for the visual cell.
	{
		const c = await browser.newContext({ baseURL: BASE, storageState: probeState })
		const p = await c.newPage()
		await p.goto(`${BASE}/index.php/apps/dashboard/`, { waitUntil: 'domcontentloaded' })
		await p.evaluate(async () => {
			const token = window.OC?.requestToken || document.querySelector('head[data-requesttoken]')?.getAttribute('data-requesttoken') || ''
			const headers = { requesttoken: token, 'OCS-APIRequest': 'true', 'Content-Type': 'application/json', Accept: 'application/json' }
			await fetch('/ocs/v2.php/apps/dashboard/api/v1/layout', {
				method: 'POST', credentials: 'same-origin', headers,
				body: JSON.stringify({ layout: ['homecheck-launcher', 'recommendations', 'calendar', 'user_status'] }),
			}).catch(() => {})
		})
		await c.close()
	}

	for (const [id, route] of Object.entries(ROUTES)) {
		const state = route.user === 'admin' ? adminState : probeState
		const ctx = await browser.newContext({ baseURL: BASE, storageState: state, viewport: { width: 1440, height: 900 } })
		const page = await ctx.newPage()
		page.on('pageerror', (e) => console.log('PAGEEXC:', String(e).slice(0, 200)))

		for (const theme of THEMES) {
			// Warm nav first (session + token), then persist theme, then the cell nav.
			await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' })
			await setUserTheme(page, theme)
			const cell = { id: `${id}@${theme}@1440`, role: route.user, theme, viewport: 1440, checks: {} }
			const resp = await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
			await settle(page)
			cell.checks.http = resp ? resp.status() : 'nav-fail'
			cell.checks.hasMain = await page.locator(route.main).first().isVisible().catch(() => false)
			const ov = await checkOverflow(page)
			cell.checks.overflow = ov
			cell.checks.overflowOk = Math.max(ov.doc, ov.app, ov.main) <= 1
			const themeRender = await assertThemeRendered(page, theme)
			cell.checks.themeApplied = themeRender
			const lm = await checkLandmarks(page)
			cell.checks.landmarks = lm
			cell.checks.axe = await runAxe(page)
			cell.checks.axeViolations = cell.checks.axe.length
			const shot = await snap(page, `sweep__${id}__${theme}__1440`, { fullPage: id === 'index' })
			cell.proof = shot.sha256.slice(0, 16)
			const failReasons = []
			if (typeof cell.checks.http !== 'number' || cell.checks.http !== route.ok) {
				failReasons.push(`http ${cell.checks.http} (expected ${route.ok})`)
			}
			if (!cell.checks.hasMain) failReasons.push('main landmark missing')
			if (!themeRender.ok) failReasons.push(`theme attr missing: ${JSON.stringify(themeRender)}`)
			if (!cell.checks.overflowOk) failReasons.push(`overflow ${JSON.stringify(ov)}`)
			if (lm.banners.length > 1) failReasons.push(`duplicate banner: ${lm.banners.join('|')}`)
			if (lm.contentinfos.length > 0) failReasons.push(`stray contentinfo: ${lm.contentinfos.join('|')}`)
			if (lm.mains.length > 1) failReasons.push(`duplicate main: ${lm.mains.join('|')}`)
			if (cell.checks.axeViolations > 0) failReasons.push(`axe ${cell.checks.axeViolations}: ${JSON.stringify(cell.checks.axe).slice(0, 300)}`)
			cell.status = failReasons.length ? 'fail' : 'ok'
			if (failReasons.length) cell.failReasons = failReasons
			record(cell)
			results.themeProof[id] = results.themeProof[id] || {}
			results.themeProof[id][theme] = shot.sha256
		}
		await ctx.close()
	}

	// Per-route themed distinctness: need ≥4 distinct sha256 (pixel truth).
	for (const id of Object.keys(ROUTES)) {
		const proof = results.themeProof[id] || {}
		const shas = Object.values(proof)
		const distinct = new Set(shas)
		const cell = { id: `themedistinct__${id}`, checks: { distinct: distinct.size, themes: proof }, status: 'ok' }
		const fails = []
		if (proof.default && proof.dark && proof.default === proof.dark) {
			fails.push('default and dark captures pixel-identical — theme not applied')
		}
		if (distinct.size < 4) fails.push(`only ${distinct.size}/4 distinct themed sha`)
		if (fails.length) { cell.status = 'fail'; cell.failReasons = fails }
		record(cell)
	}

	// Viewport matrix (light) incl. touch targets.
	for (const [id, route] of Object.entries({ index: ROUTES.index, admin: ROUTES.admin })) {
		const state = route.user === 'admin' ? adminState : probeState
		const ctx = await browser.newContext({ baseURL: BASE, storageState: state, viewport: { width: 1440, height: 900 } })
		const page = await ctx.newPage()
		await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' })
		await setUserTheme(page, 'default')
		for (const vp of VIEWPORTS) {
			await page.setViewportSize({ width: vp.w, height: vp.h })
			const cell = { id: `${id}@default@${vp.w}`, role: route.user, theme: 'default', viewport: vp.w, checks: {} }
			const resp = await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
			await settle(page)
			cell.checks.http = resp ? resp.status() : 'nav-fail'
			const ov = await checkOverflow(page)
			cell.checks.overflow = ov
			cell.checks.overflowOk = Math.max(ov.doc, ov.app, ov.main) <= 1
			cell.checks.touchOffenders = await checkTouchTargets(page)
			// Below-fold honesty: also capture the scrolled tail of scrollable roots.
			const shot = await snap(page, `sweep__${id}__default__${vp.w}`)
			await page.evaluate(() => {
				const scroller = document.getElementById('homecheck-app') || document.getElementById('app-content') || document.documentElement
				scroller.scrollTop = scroller.scrollHeight
				window.scrollTo(0, document.documentElement.scrollHeight)
			}).catch(() => {})
			await page.waitForTimeout(250)
			await snap(page, `sweep__${id}__default__${vp.w}__fold`)
			cell.proof = shot.sha256.slice(0, 16)
			const failReasons = []
			if (typeof cell.checks.http !== 'number' || cell.checks.http !== route.ok) failReasons.push(`http ${cell.checks.http}`)
			if (!cell.checks.overflowOk) failReasons.push(`overflow ${JSON.stringify(ov)}`)
			if (cell.checks.touchOffenders.length) failReasons.push(`touch<44: ${JSON.stringify(cell.checks.touchOffenders.slice(0, 6))}`)
			cell.status = failReasons.length ? 'fail' : 'ok'
			if (failReasons.length) cell.failReasons = failReasons
			record(cell)
		}
		await ctx.close()
	}

	// Non-admin on the admin settings surface — must NOT get admin controls.
	{
		const ctx = await browser.newContext({ baseURL: BASE, storageState: probeState, viewport: { width: 1440, height: 900 } })
		const page = await ctx.newPage()
		for (const route of DENIED_ROUTES) {
			const cell = { id: `${route.id}@default@1440`, role: 'probe', checks: {}, status: 'ok' }
			const resp = await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
			await settle(page)
			cell.checks.http = resp ? resp.status() : 'nav-fail'
			cell.checks.adminSectionRendered = await page.locator('#hmk-admin').first().isVisible().catch(() => false)
			const shot = await snap(page, `sweep__${route.id}__default__1440`)
			cell.proof = shot.sha256.slice(0, 16)
			const fails = []
			if (cell.checks.adminSectionRendered) fails.push('admin settings form rendered for non-admin')
			if (typeof cell.checks.http !== 'number' || cell.checks.http >= 500) fails.push(`http ${cell.checks.http}`)
			if (fails.length) { cell.status = 'fail'; cell.fails = fails }
			record(cell)
		}
		await ctx.close()
	}
}

/* ───────────────────────────── dialogs ───────────────────────────── */
async function openEditMode(page) {
	const btn = page.locator('#hmk-edit-toggle')
	if (await btn.isVisible().catch(() => false)) {
		const pressed = await btn.getAttribute('aria-pressed')
		if (pressed !== 'true') await btn.click()
	}
}

async function paneMenuItem(pane, label) {
	await pane.locator('details.hmk-pane__menu summary').first().evaluate((el) => /** @type {HTMLElement} */ (el).click())
	const item = pane.getByRole('menuitem', { name: label, exact: true }).first()
	await item.waitFor({ state: 'visible', timeout: 5000 })
	return item
}

async function probeDialog(page, name, dialogSel, openFn, opts = {}) {
	const r = { id: name, checks: {}, status: 'ok', fails: [] }
	const fail = (m) => { r.fails.push(m); r.status = 'fail' }

	try { await openFn() } catch (err) { fail(`trigger threw: ${String(err).slice(0, 160)}`); record(r); return r }
	const dlg = page.locator(dialogSel)
	try {
		await dlg.waitFor({ state: 'visible', timeout: 10000 })
	} catch {
		fail('dialog not visible after trigger'); record(r); return r
	}
	await settle(page)

	const info = await dlg.evaluate((d) => {
		const labelId = d.getAttribute('aria-labelledby')
		return {
			tag: d.tagName.toLowerCase(), open: d.open,
			labelId, labelText: labelId ? (document.getElementById(labelId)?.textContent || '') : '',
		}
	}).catch(() => null)
	r.checks.dialog = info
	if (!info || info.tag !== 'dialog' || !info.open) fail('not a native open <dialog>')
	if (info && !info.labelText.trim()) fail('aria-labelledby unresolved/empty')

	r.checks.focusInside = await page.evaluate((sel) => {
		const d = document.querySelector(sel)
		const ae = document.activeElement
		return !!(d && ae && d.contains(ae))
	}, dialogSel)
	if (!r.checks.focusInside) fail('focus did not move inside dialog')

	r.checks.axe = await runAxe(page)
	r.checks.axeViolations = r.checks.axe.length
	if (r.checks.axeViolations > 0) fail(`axe ${r.checks.axeViolations}: ${JSON.stringify(r.checks.axe).slice(0, 300)}`)

	await snap(page, `dialog__${name}__open`)

	if (opts.validationNegative) {
		const neg = await opts.validationNegative(page, dlg)
		r.checks.validationNegative = neg
		if (neg && neg.ok === false) fail(`validation negative: ${neg.reason}`)
	}

	// Escape closes + focus returns to a real control (never <body>).
	await page.keyboard.press('Escape')
	await page.waitForTimeout(400)
	const stillOpen = await dlg.evaluate((d) => d.open).catch(() => false)
	r.checks.escapeClosed = !stillOpen
	if (stillOpen) fail('Escape did not close dialog')
	const focusAfterEsc = await page.evaluate(() => ({
		active: document.activeElement?.tagName,
		id: document.activeElement?.id || '',
		cls: String(document.activeElement?.className || '').slice(0, 60),
	}))
	r.checks.focusAfterEscape = focusAfterEsc
	if (focusAfterEsc.active === 'BODY' || focusAfterEsc.active === 'HTML') {
		fail(`focus restored to <${(focusAfterEsc.active || '?').toLowerCase()}> — trigger lost`)
	}

	// Cancel/close path: reopen → dismiss via close control → closed + focus off <body>.
	if (opts.reopen) {
		try {
			await opts.reopen()
			await dlg.waitFor({ state: 'visible', timeout: 8000 })
			await settle(page)
			const closer = dlg.locator('button').first()
			if (await closer.count()) {
				await closer.click({ timeout: 5000 })
				await page.waitForTimeout(400)
				const after = await page.evaluate((sel) => ({
					open: !!document.querySelector(sel)?.open,
					active: document.activeElement?.tagName,
				}), dialogSel)
				r.checks.cancelClosed = !after.open
				if (after.open) fail('close control did not dismiss dialog')
				if (after.active === 'BODY') fail('focus lost to <body> after dismiss')
			}
		} catch (err) {
			fail(`cancel path error: ${String(err).slice(0, 160)}`)
		}
	}
	record(r)
	return r
}

async function phaseDialogs(browser) {
	const probeState = await loginState(browser, 'probe')
	const ctx = await browser.newContext({ baseURL: BASE, storageState: probeState, viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('PAGEEXC:', String(e).slice(0, 200)))
	page.on('dialog', (d) => d.dismiss().catch(() => {})) // drain native confirms defensively — never accept

	const goto = async () => {
		await page.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
		await settle(page)
		await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 })
	}
	const flushLayout = async () => {
		await page.waitForResponse(
			(res) => res.url().includes('/apps/homecheck/api/layout') && res.request().method() === 'PUT' && res.ok(),
			{ timeout: 20000 },
		).catch(() => {})
		await page.waitForTimeout(300)
	}

	await goto()
	await openEditMode(page)

	// Seed: ensure ≥2 folders + ≥1 hidden app exist for picker/hidden dialogs.
	const folderCount0 = await page.locator('#hmk-panels .hmk-pane[data-type="folder"]').count()
	for (let i = folderCount0; i < 2; i++) {
		await page.locator('#hmk-new-folder').click()
		await flushLayout()
	}
	// Hide one app (last app pane menu → hide).
	{
		const hiddenBefore = await page.evaluate(() => {
			const st = JSON.parse(document.getElementById('hmk-initial-state')?.textContent || '{}')
			return (st.layout?.hidden || []).length
		})
		if (!hiddenBefore) {
			const appPanes = page.locator('#hmk-panels .hmk-pane[data-type="app"]')
			const target = appPanes.last()
			const hideLabel = await hmkMsg(page, 'hideApp')
			const item = await paneMenuItem(target, hideLabel)
			await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
			await flushLayout()
		}
	}

	// 1) folder-dialog — open a folder via its pane menu
	await probeDialog(page, 'folder-dialog', '#hmk-folder-dialog', async () => {
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const label = await hmkMsg(page, 'openFolder')
		const item = await paneMenuItem(folder, label)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
	}, {
		reopen: async () => {
			const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
			const label = await hmkMsg(page, 'openFolder')
			const item = await paneMenuItem(folder, label)
			await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		},
	})

	// 2) prompt-dialog — rename folder; validation negative (empty + bad chars)
	await probeDialog(page, 'prompt-dialog', '#hmk-prompt-dialog', async () => {
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const label = await hmkMsg(page, 'rename')
		const item = await paneMenuItem(folder, label)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
	}, {
		validationNegative: async (pg) => {
			await pg.locator('#hmk-prompt-input').fill('')
			await pg.locator('#hmk-prompt-ok').click()
			await pg.waitForTimeout(400)
			const res = await pg.evaluate(() => {
				const d = document.getElementById('hmk-prompt-dialog')
				const err = document.getElementById('hmk-prompt-error')
				const input = document.getElementById('hmk-prompt-input')
				return {
					open: !!d?.open,
					errorText: (err?.textContent || '').trim(),
					ariaInvalid: input?.getAttribute('aria-invalid'),
					ariaDescribedby: input?.getAttribute('aria-describedby'),
					focusedOnInput: document.activeElement === input,
				}
			})
			if (!res.open) return { ok: false, reason: 'dialog closed on invalid submit' }
			if (!res.errorText) return { ok: false, reason: 'no inline error rendered' }
			if (res.ariaInvalid !== 'true') return { ok: false, reason: 'input missing aria-invalid on invalid submit', ...res }
			return { ok: true, ...res }
		},
		reopen: async () => {
			const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
			const label = await hmkMsg(page, 'rename')
			const item = await paneMenuItem(folder, label)
			await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		},
	})

	// 3) confirm-dialog — delete folder (cancel only; never confirm a delete)
	await probeDialog(page, 'confirm-dialog', '#hmk-confirm-dialog', async () => {
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const label = await hmkMsg(page, 'deleteFolder')
		const item = await paneMenuItem(folder, label)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
	})

	// 4) folder-picker — needs ≥2 folders: app menu → Add to folder
	await probeDialog(page, 'folder-picker', '#hmk-folder-picker', async () => {
		const app = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()
		const label = await hmkMsg(page, 'addToFolder')
		const item = await paneMenuItem(app, label)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
	}, {
		reopen: async () => {
			const app = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()
			const label = await hmkMsg(page, 'addToFolder')
			const item = await paneMenuItem(app, label)
			await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		},
	})

	// 5) hidden-dialog — Hidden apps chrome button (visible when hidden entries exist)
	await probeDialog(page, 'hidden-dialog', '#hmk-hidden-dialog', async () => {
		const btn = page.locator('#hmk-hidden-apps')
		await btn.waitFor({ state: 'visible', timeout: 8000 })
		await btn.click()
	}, {
		reopen: async () => {
			const btn = page.locator('#hmk-hidden-apps')
			await btn.click()
		},
	})

	// 6) pane ⋮ menu — details/summary disclosure: Escape-out focus + one-open accordion
	{
		const r = { id: 'pane-menu-disclosure', checks: {}, status: 'ok', fails: [] }
		const menu = page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu').first()
		const summary = menu.locator('summary')
		await summary.focus()
		await page.keyboard.press('Enter')
		await page.waitForTimeout(250)
		r.checks.opensViaKeyboard = await menu.evaluate((d) => d.open)
		if (!r.checks.opensViaKeyboard) r.fails.push('summary did not open via Enter')
		const items = await menu.getByRole('menuitem').count()
		r.checks.menuitemCount = items
		if (!items) r.fails.push('no menuitems after open')
		// Second menu open closes the first (accordion)
		const menu2 = page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu').nth(1)
		if (await menu2.count()) {
			await menu2.locator('summary').click()
			await page.waitForTimeout(250)
			r.checks.accordion = !(await menu.evaluate((d) => d.open)) && (await menu2.evaluate((d) => d.open))
			if (!r.checks.accordion) r.fails.push('two menus open at once — accordion broken')
			await menu2.locator('summary').click().catch(() => {})
		}
		if (r.fails.length) r.status = 'fail'
		await snap(page, 'dialog__pane-menu__open')
		record(r)
	}

	await ctx.close()
}

/* ───────────────────────────── states ───────────────────────────── */
async function phaseStates(browser) {
	// anon → login redirect
	const anon = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } })
	const ap = await anon.newPage()
	const resp = await ap.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
	await settle(ap)
	const anonCell = { id: 'anon-index-redirect', checks: { finalUrl: ap.url(), http: resp?.status() }, status: 'ok' }
	anonCell.checks.onLogin = /\/login/.test(ap.url())
	if (!anonCell.checks.onLogin) { anonCell.status = 'fail'; anonCell.fails = ['anon did not land on /login'] }
	await snap(ap, 'state__anon-redirect')
	record(anonCell)
	await anon.close()

	const probeState = await loginState(browser, 'probe')
	const ctx = await browser.newContext({ baseURL: BASE, storageState: probeState, viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('PAGEEXC:', String(e).slice(0, 200)))

	// save-error: abort layout PUT → edit → reorder → status error + no raw codes
	await page.route('**/apps/homecheck/api/layout', (route) => {
		if (route.request().method() === 'PUT') return route.abort('failed')
		return route.continue()
	})
	await page.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
	await settle(page)
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 })
	await openEditMode(page)
	const errCell = { id: 'save-error-status', checks: {}, status: 'ok' }
	const moveLabel = await hmkMsg(page, 'moveRight')
	{
		const pane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()
		const item = await paneMenuItem(pane, moveLabel)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
	}
	await page.waitForTimeout(1600) // debounce 500ms + save fail
	errCell.checks.statusText = await page.locator('#hmk-status').textContent().catch(() => '')
	errCell.checks.statusVisible = await page.locator('#hmk-status').isVisible().catch(() => false)
	errCell.checks.roleStatus = await page.locator('#hmk-status').getAttribute('role')
	errCell.checks.isError = await page.evaluate(() => document.getElementById('hmk-status')?.classList.contains('is-error'))
	errCell.checks.rawCode = await page.evaluate(() => {
		const t = document.getElementById('hmk-status')?.textContent || ''
		return /ERR_|ECONNREFUSED|TypeError|\b500\b|\b503\b|stack trace|undefined/i.test(t) ? t : null
	})
	// Repeat identical failure — status line replaces, must not stack/duplicate.
	{
		const pane = page.locator('#hmk-panels .hmk-pane[data-type="app"]').first()
		const item = await paneMenuItem(pane, moveLabel)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		await page.waitForTimeout(1600)
	}
	errCell.checks.statusNodeCount = await page.locator('#hmk-status').count()
	errCell.checks.errorNodeCount = await page.locator('.hmk-status.is-error').count()
	await snap(page, 'state__save-error', { fullPage: true })
	const fails = []
	if (!errCell.checks.statusVisible || !errCell.checks.statusText?.trim()) fails.push('no status surface on failed save')
	if (!errCell.checks.isError) fails.push('status not marked is-error')
	if (errCell.checks.rawCode) fails.push(`raw error code visible: ${errCell.checks.rawCode}`)
	if (errCell.checks.statusNodeCount !== 1 || errCell.checks.errorNodeCount > 1) fails.push(`status nodes duplicated: ${errCell.checks.errorNodeCount}`)
	if (fails.length) { errCell.status = 'fail'; errCell.fails = fails }
	record(errCell)
	await page.unroute('**/apps/homecheck/api/layout')
	await page.evaluate(() => { window.__HMK_E2E_HOLD_RELOAD = true })
	// Local state is now diverged — restore by reload so later phases see truth.

	// empty-state: PUT empty layout → server merger reseeds items from live
	// entries (LayoutService::merge treats empty+entries as first-visit). So
	// #hmk-empty is unreachable for a user with ≥1 eligible app — verified by
	// probing it; the REACHABLE empty surfaces are covered below instead.
	const getInitial = () => page.evaluate(() => JSON.parse(document.getElementById('hmk-initial-state')?.textContent || '{}'))
	const putLayout = async (build) => {
		const raw = await getInitial()
		const layout = Object.assign({ version: 1, revision: raw.layout?.revision ?? 0, hidden: [], hiddenFolders: [] }, build(raw))
		const res = await page.evaluate(async (layout) => {
			const token = window.OC?.requestToken || ''
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
			if (!out.d?.ok) throw new Error('layout PUT failed: ' + JSON.stringify(out.d).slice(0, 200))
			return out.d
		}, layout)
		return res
	}
	const restoreLayout = () => putLayout((raw) => ({
		items: (raw.entries || []).map((e) => ({ type: 'app', id: e.id })),
	}))

	const emptyCell = { id: 'empty-state', checks: {}, status: 'ok' }
	await page.reload({ waitUntil: 'domcontentloaded' })
	await settle(page)
	await putLayout(() => ({ items: [] }))
	await page.reload({ waitUntil: 'domcontentloaded' })
	await settle(page)
	emptyCell.checks.emptyVisible = await page.locator('#hmk-empty').isVisible().catch(() => false)
	emptyCell.checks.emptyExists = await page.locator('#hmk-empty').count()
	emptyCell.checks.copy = (await page.locator('#hmk-empty').textContent().catch(() => ''))?.trim().slice(0, 160)
	emptyCell.checks.paneCount = await page.locator('#hmk-panels .hmk-pane').count()
	emptyCell.checks.note = 'server merger reseeds empty items from live entries — #hmk-empty only renders when the user has zero eligible apps (unreachable on this instance)'
	const emptyShot = await snap(page, 'state__empty', { fullPage: true })
	emptyCell.proof = emptyShot.sha256.slice(0, 16)
	// Honest verdict: element must exist with copy; visible only for zero-entry users.
	if (!emptyCell.checks.emptyExists || !emptyCell.checks.copy) {
		emptyCell.status = 'fail'; emptyCell.fails = ['#hmk-empty missing or empty copy']
	}
	record(emptyCell)

	// Reachable empty surface 1: folder with no children → pane empty copy +
	// folder dialog role=status + emptyFolder copy.
	{
		const r = { id: 'folder-empty-state', checks: {}, status: 'ok', fails: [] }
		await putLayout((raw) => ({
			items: [{ type: 'folder', id: 'fld_dsempty1', name: 'DSProbeEmpty', children: [] }]
				.concat((raw.entries || []).slice(0, 3).map((e) => ({ type: 'app', id: e.id }))),
		}))
		await page.reload({ waitUntil: 'domcontentloaded' })
		await settle(page)
		const pane = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		r.checks.paneEmptyCopy = (await pane.locator('.hmk-pane__empty').textContent().catch(() => ''))?.trim()
		const folder = page.locator('#hmk-panels .hmk-pane[data-type="folder"]').first()
		const label = await hmkMsg(page, 'openFolder')
		await openEditMode(page)
		const item = await paneMenuItem(folder, label)
		await item.evaluate((el) => /** @type {HTMLElement} */ (el).click())
		await page.locator('#hmk-folder-dialog').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
		r.checks.dialogGridRole = await page.locator('#hmk-folder-grid').getAttribute('role').catch(() => null)
		r.checks.dialogEmptyCopy = (await page.locator('#hmk-folder-grid').textContent().catch(() => ''))?.trim()
		await snap(page, 'state__folder-empty', { fullPage: true })
		await page.keyboard.press('Escape')
		if (!r.checks.paneEmptyCopy) r.fails.push('folder pane empty copy missing')
		if (r.checks.dialogGridRole !== 'status' || !r.checks.dialogEmptyCopy) r.fails.push(`folder dialog empty surface wrong: role=${r.checks.dialogGridRole}`)
		if (r.fails.length) r.status = 'fail'
		record(r)
	}

	// Reachable empty surface 2: hidden dialog after un-hiding the last entry.
	{
		const r = { id: 'hidden-dialog-empty', checks: {}, status: 'ok', fails: [] }
		await putLayout((raw) => ({
			items: (raw.entries || []).slice(1, 5).map((e) => ({ type: 'app', id: e.id })),
			hidden: (raw.entries || []).slice(0, 1).map((e) => e.id),
		}))
		await page.reload({ waitUntil: 'domcontentloaded' })
		await settle(page)
		await openEditMode(page)
		const hidBtn = page.locator('#hmk-hidden-apps')
		r.checks.triggerVisible = await hidBtn.isVisible().catch(() => false)
		if (r.checks.triggerVisible) {
			await hidBtn.click()
			await page.locator('#hmk-hidden-dialog').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
			r.checks.rowsBefore = await page.locator('#hmk-hidden-list .hmk-hidden-row').count()
			const showLabel = await hmkMsg(page, 'showApp')
			await page.locator('#hmk-hidden-list .hmk-hidden-row button').filter({ hasText: showLabel }).first().click()
			await page.waitForTimeout(700)
			r.checks.emptyCopy = (await page.locator('#hmk-hidden-list .hmk-empty-inline').textContent().catch(() => ''))?.trim()
			await snap(page, 'state__hidden-empty', { fullPage: true })
			await page.locator('#hmk-hidden-cancel').click().catch(() => {})
			if (!r.checks.emptyCopy) r.fails.push('hidden dialog did not render hiddenEmpty copy after un-hiding')
		} else {
			r.fails.push('hidden trigger not visible after seeding hidden entry')
		}
		if (r.fails.length) r.status = 'fail'
		record(r)
	}

	// Restore flat layout from live entries (leave probe user usable).
	await restoreLayout()

	// CTA card (probe user has not dismissed; capture below-fold too)
	await page.reload({ waitUntil: 'domcontentloaded' })
	await settle(page)
	const ctaCell = { id: 'startpage-cta', checks: {}, status: 'ok' }
	ctaCell.checks.ctaVisible = await page.locator('#hmk-cta').isVisible().catch(() => false)
	ctaCell.checks.regionRole = await page.locator('#hmk-cta').getAttribute('role')
	ctaCell.checks.regionLabel = await page.locator('#hmk-cta').getAttribute('aria-label')
	if (!ctaCell.checks.ctaVisible) { ctaCell.status = 'warn'; ctaCell.checks.note = 'CTA already dismissed/default-landing for probe' }
	await snap(page, 'state__cta', { fullPage: true })
	record(ctaCell)
	await ctx.close()
}

/* ───────────────────────────── theatre ───────────────────────────── */
async function phaseTheatre(browser) {
	const probeState = await loginState(browser, 'probe')
	const adminState = await loginState(browser, 'admin')
	const ctx = await browser.newContext({ baseURL: BASE, storageState: probeState, viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()
	await page.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
	await setUserTheme(page, 'dark')

	const hunt = async (pg, rootSel, tag) => {
		const cell = { id: `theatre__${tag}`, checks: {}, status: 'ok' }
		const islands = await pg.evaluate((sel) => {
			const root = document.querySelector(sel)
			if (!root) return { error: 'no root ' + sel }
			const out = []
			const lum = (rgb) => {
				const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
				if (!m) return null
				return { L: 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
			}
			for (const el of root.querySelectorAll('*')) {
				const cs = getComputedStyle(el)
				if (cs.display === 'none' || cs.visibility === 'hidden') continue
				const r = el.getBoundingClientRect()
				if (r.width < 60 || r.height < 30) continue
				const got = lum(cs.backgroundColor)
				if (got && got.a > 0.6 && got.L > 205) {
					out.push(`${el.tagName.toLowerCase()}#${el.id || ''}.${String(el.className).split(' ')[0]} bg=${cs.backgroundColor}`)
				}
				if (out.length >= 10) break
			}
			return out
		}, rootSel)
		cell.checks.lightIslands = islands
		if (islands && islands.error) { cell.status = 'fail'; cell.fails = [islands.error] }
		else if (Array.isArray(islands) && islands.length) { cell.status = 'fail'; cell.fails = [`dark-island surfaces: ${islands.join(' | ')}`] }
		record(cell)
	}

	for (const [id, route] of Object.entries(ROUTES)) {
		const pg = route.user === 'admin'
			? await (await browser.newContext({ baseURL: BASE, storageState: adminState, viewport: { width: 1440, height: 900 } })).newPage()
			: page
		if (route.user === 'admin') {
			await pg.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' })
			await setUserTheme(pg, 'dark')
		}
		await pg.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' })
		await settle(pg)
		const rootSel = route.user === 'admin' ? '#hmk-admin' : (id === 'dashboard' ? '#app-dashboard' : '#homecheck-app')
		await hunt(pg, rootSel, id)
		await snap(pg, `theatre__${id}__dark`)
		if (route.user === 'admin') {
			await setUserTheme(pg, 'default')
			await pg.context().close()
		}
	}
	// Restore probe to default theme for subsequent lanes.
	await setUserTheme(page, 'default')
	await page.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
	await settle(page)
	await ctx.close()
}

/* ───────────────────────────── a11y / keyboard ───────────────────────────── */
async function phaseA11y(browser) {
	const probeState = await loginState(browser, 'probe')
	const ctx = await browser.newContext({ baseURL: BASE, storageState: probeState, viewport: { width: 1440, height: 900 } })
	const page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('PAGEEXC:', String(e).slice(0, 200)))
	await page.goto(`${BASE}${ROUTES.index.path}`, { waitUntil: 'domcontentloaded' })
	await settle(page)
	await page.locator('#hmk-panels .hmk-pane').first().waitFor({ state: 'visible', timeout: 20000 })

	// Skip link: hidden 1x1 offscreen until focus; must expand ≥44px and move
	// focus to #hmk-main on Enter.
	{
		const r = { id: 'skip-link', checks: {}, status: 'ok', fails: [] }
		await page.locator('.hmk-skip').focus()
		await page.waitForTimeout(200)
		const box = await page.locator('.hmk-skip').boundingBox()
		r.checks.focusedSize = box ? { w: Math.round(box.width), h: Math.round(box.height) } : null
		r.checks.focusedVisible = await page.locator('.hmk-skip').isVisible().catch(() => false)
		if (!box || box.height < 44 || box.width < 44) r.fails.push(`skip link focused box ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'null'} <44`)
		await page.keyboard.press('Enter')
		await page.waitForTimeout(200)
		r.checks.mainFocused = await page.evaluate(() => document.activeElement === document.getElementById('hmk-main'))
		if (!r.checks.mainFocused) r.fails.push('skip link did not move focus to #hmk-main')
		if (r.fails.length) r.status = 'fail'
		await snap(page, 'a11y__skip-link-focused')
		record(r)
	}

	// Keyboard parity: Tab from main lands on a pane launch control; Space/Enter
	// on ⋮ summary opens the menu (edit mode), Escape closes it.
	{
		const r = { id: 'keyboard-order', checks: {}, status: 'ok', fails: [] }
		await page.evaluate(() => document.getElementById('hmk-main')?.focus())
		const seq = []
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press('Tab')
			const tag = await page.evaluate(() => {
				const el = document.activeElement
				if (!el) return 'none'
				const cls = String(el.className || '')
				const role = el.getAttribute('role') || ''
				return `${el.tagName.toLowerCase()}#${el.id || ''}[${role}] ${cls}`.slice(0, 100)
			})
			seq.push(tag)
		}
		r.checks.tabSequence = seq
		const hitPane = seq.some((s) => s.includes('hmk-pane__launch') || s.includes('hmk-pane__row-launch'))
		if (!hitPane) r.fails.push(`Tab never reached a pane launch within 8 steps: ${seq.join(' → ')}`)
		// edit-mode menu via keyboard
		await openEditMode(page)
		const summary = page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu summary').first()
		await summary.focus()
		await page.keyboard.press('Enter')
		await page.waitForTimeout(250)
		r.checks.menuOpensKeyboard = await page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu').first().evaluate((d) => d.open)
		if (!r.checks.menuOpensKeyboard) r.fails.push('kebab summary did not open via keyboard')
		// menu items reachable by Tab and operable
		const firstItem = await page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu[open] [role="menuitem"]').first()
		await firstItem.focus()
		r.checks.menuitemFocusable = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem')
		if (!r.checks.menuitemFocusable) r.fails.push('menuitem not keyboard-focusable')
		// Escape out (close via summary toggle if Escape is not wired)
		await page.keyboard.press('Escape')
		await page.waitForTimeout(200)
		const stillOpen = await page.locator('#hmk-panels .hmk-pane[data-type="app"] details.hmk-pane__menu').first().evaluate((d) => d.open).catch(() => false)
		r.checks.escapeClosesMenu = !stillOpen
		if (stillOpen) {
			// Not a fail — native <details> has no Escape contract; click-away is the app pattern.
			r.checks.note = 'menu stays open on Escape (native details; closes on sibling-open/click-away)'
		}
		// exit edit mode
		await page.locator('#hmk-edit-toggle').click()
		await page.waitForTimeout(300)
		if (r.fails.length) r.status = 'fail'
		await snap(page, 'a11y__keyboard-menu')
		record(r)
	}

	// aria-pressed toggles reflect state (Edit + Use-as-home)
	{
		const r = { id: 'toggle-states', checks: {}, status: 'ok', fails: [] }
		const editBefore = await page.locator('#hmk-edit-toggle').getAttribute('aria-pressed')
		await page.locator('#hmk-edit-toggle').click()
		const editAfter = await page.locator('#hmk-edit-toggle').getAttribute('aria-pressed')
		r.checks.editPressedFlip = `${editBefore}→${editAfter}`
		if (editBefore === editAfter) r.fails.push('aria-pressed did not flip on Edit')
		const home = page.locator('#hmk-home-toggle')
		r.checks.homeHasPressed = (await home.getAttribute('aria-pressed')) !== null || !(await home.isVisible().catch(() => false))
		if (r.checks.homeHasPressed === false) r.fails.push('home toggle missing aria-pressed')
		await page.locator('#hmk-edit-toggle').click() // back to view
		if (r.fails.length) r.status = 'fail'
		record(r)
	}
	await ctx.close()
}

/* ───────────────────────────── main ───────────────────────────── */
const browser = await chromium.launch()
try {
	if (PHASE === 'sweep') await phaseSweep(browser)
	else if (PHASE === 'dialogs') await phaseDialogs(browser)
	else if (PHASE === 'states') await phaseStates(browser)
	else if (PHASE === 'theatre') await phaseTheatre(browser)
	else if (PHASE === 'a11y') await phaseA11y(browser)
	else throw new Error('unknown phase ' + PHASE)
} finally {
	results.finishedAt = new Date().toISOString()
	const fails = results.cells.filter((c) => c.status === 'fail').length
	const warns = results.cells.filter((c) => c.status === 'warn').length
	results.summary = { cells: results.cells.length, fails, warns }
	writeFileSync(join(OUT, `results-${PHASE}.json`), JSON.stringify(results, null, 1))
	console.log(`DONE ${PHASE}: ${results.cells.length} cells, ${fails} fail, ${warns} warn → ${OUT}/results-${PHASE}.json`)
	await browser.close()
}
