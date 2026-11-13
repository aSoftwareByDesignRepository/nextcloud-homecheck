// @ts-check
/**
 * ATLAS web craft capture — transfer settings surfaces. Writes PNGs to
 * .cursor/atlas-farm-v3/artifacts/homecheck/craft/web/.
 * Flow: /settings/transfer load → uniform file error → real
 * export→preview→report dialog → apply → progress dialog → after-apply.
 *
 * Recaptured for the margin:auto verify-close (native_dialog_margin_reset_
 * uncentered): NC core's 'html,body,…,dialog,…{margin:0}' reset collapses
 * the UA top-layer centering — ≥481px dialogs must be centered on both axes
 * over the dimmed backdrop (never flush viewport top-left); the ≤480px
 * media query keeps the full-bleed margin:0 sheet. Geometry is asserted via
 * getBoundingClientRect (painted), never computed-style alone.
 *
 * Also proves the dead_platform_toast_api fix end-to-end: a failed preview
 * paints a visible .hmk-toast--error (app-owned channel) — OC.Notification
 * is gone from NC≥31 bundles.
 *
 * Fixture: a throwaway system-admin user (replace preview is sysadmin-only
 * and HomeCheck's door-admin == NC sysadmin), provisioned via occ and
 * deleted in afterAll — never a shared mutable uid.
 */
const { test, expect } = require('@playwright/test')
const { execFileSync, execSync } = require('child_process')
const { randomBytes } = require('crypto')
const fs = require('fs')
const path = require('path')

const BASE = (process.env.HOMECHECK_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const NC_ROOT = path.resolve(__dirname, '../../..')
const APP = '/index.php/apps/homecheck'
const PASS = 'atlas-e2e-passphrase-2026'
const OUT = path.resolve(__dirname, '../../../../.cursor/atlas-farm-v3/artifacts/homecheck/craft/web')
fs.mkdirSync(OUT, { recursive: true })

function occ(args, env) {
	const envArgs = Object.entries(env || {}).flatMap(([k, v]) => ['-e', `${k}=${v}`])
	return execFileSync(
		'docker', ['compose', 'exec', '-T', ...envArgs, '-u', 'www-data', 'nextcloud', 'php', 'occ', ...args],
		{ stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, cwd: NC_ROOT },
	).toString().trim()
}

function queryDb(q) {
	const b64 = Buffer.from(q, 'utf8').toString('base64')
	return execSync(
		`docker compose exec -T mariadb bash -lc 'echo ${b64} | base64 -d | mariadb -u root -p"$MYSQL_ROOT_PASSWORD" nextcloud -N'`,
		{ stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, cwd: NC_ROOT },
	).toString().trim()
}

function provisionFixture() {
	const uid = 'hmkxfer' + randomBytes(5).toString('hex')
	const password = 'HmkXfer-' + randomBytes(8).toString('hex')
	// Sibling lanes hammer POST /login from this host — the per-IP bruteforce
	// throttle escalates past the spec's waits (NC sees the docker bridge IP,
	// not loopback). We hold the instance lock for this run; resetting the
	// attempt table for our own source IPs is scoped and reversible.
	occ(['security:bruteforce:reset', '172.18.0.1'])
	try { occ(['security:bruteforce:reset', '127.0.0.1']) } catch { /* loopback unused on this stack */ }
	occ(['user:add', '--password-from-env', uid], { OC_PASS: password })
	// HomeCheck door-admin == NC sysadmin (TransferHooks::requireTransferAdmin).
	occ(['group:adduser', 'admin', uid])
	// Pin the fixture language: without it the user inherits whatever
	// default_language a sibling lane last mutated on the shared instance —
	// specs asserting rendered copy then flake under arbitrary locales.
	occ(['user:setting', uid, 'core', 'lang', 'en'])
	return { uid, password }
}

function deprovisionFixture(uid) {
	try { occ(['user:delete', uid]) } catch { /* already gone */ }
}

async function shot(page, name) {
	await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
}

/** Session login for the provisioned fixture uid (helpers.login only knows
 * the env credential). Done API-side: the shared instance's browser login
 * POST self-aborts (net::ERR_ABORTED, no response) under farm load while
 * the APIRequestContext flow is stable. GET /login mints requesttoken +
 * guest session cookie in the context jar; the form POST returns 303 and
 * upgrades the same jar — the page's next goto lands authenticated. */
async function loginFixture(page, uid, password) {
	const req = page.context().request
	for (let attempt = 0; attempt < 3; attempt++) {
		const get = await req.get(`${BASE}/login`)
		const html = await get.text()
		const m = html.match(/data-requesttoken="([^"]+)"/)
		const token = m ? decodeURIComponent(m[1]) : null
		if (!token) throw new Error('login GET /login: no data-requesttoken in page')
		// Origin is REQUIRED: tryLogin() rejects header-less POSTs as
		// LOGIN_MSG_INVALID_ORIGIN (the /login?direct=1 failure redirect).
		// redirect_url is REQUIRED: without it NC lands on the app-password
		// grant flow, which never opens a web session.
		const resp = await req.post(`${BASE}/login`, {
			form: { user: uid, password, requesttoken: token, redirect_url: '/index.php/apps/homecheck/' },
			headers: { 'Origin': BASE },
			maxRedirects: 0,
		})
		if (resp.status() !== 303) {
			if (attempt === 2) throw new Error(`login for ${uid}: POST /login -> ${resp.status()}`)
			continue
		}
		// Verify the web session actually took: an authed GET /login 303s to
		// the app, an anonymous one renders the form again.
		const check = await req.get(`${BASE}/login`, { maxRedirects: 0 })
		if (check.status() === 303) return
		if (attempt === 2) {
			throw new Error(`login for ${uid}: session not authenticated (GET /login -> ${check.status()})`)
		}
	}
}

/** Authenticated request through the page's own cookie jar + the session
 * CSRF token the app middleware demands on non-GET. */
async function authedPost(page, url, data) {
	const token = await page.evaluate(() => (window.OC && OC.requestToken) || '')
	return page.context().request.post(url, {
		data,
		headers: { requesttoken: token, 'OCS-APIRequest': 'true' },
	})
}
async function authedGet(page, url) {
	return page.context().request.get(url, { headers: { 'OCS-APIRequest': 'true' } })
}

/** native_dialog_margin_reset_uncentered: NC core's html,body,…,dialog
 * reset zeroes the UA 'margin:auto' that centers a top-layer <dialog> —
 * a pack dialog without a margin re-declaration anchors to the viewport
 * top-left. mode 'centered' proves the margin:auto restored both-axis
 * centering over the dimmed backdrop; mode 'fullbleed' proves the ≤480px
 * media query margin:0 sheet still wins at narrow widths. Painted
 * geometry only (getBoundingClientRect). */
async function assertDialogTopLayerGeometry(dialog, mode, where) {
	const m = await dialog.evaluate((d) => {
		const r = d.getBoundingClientRect()
		return { l: r.left, t: r.top, w: r.width, h: r.height, vpW: window.innerWidth, vpH: window.innerHeight }
	})
	if (mode === 'centered') {
		const expL = Math.max(0, (m.vpW - m.w) / 2)
		const expT = Math.max(0, (m.vpH - m.h) / 2)
		expect(Math.abs(m.l - expL),
			`${where}: dialog left ${Math.round(m.l)} ≠ centered ${Math.round(expL)} — margin:auto did not survive the NC reset`)
			.toBeLessThanOrEqual(2)
		expect(Math.abs(m.t - expT),
			`${where}: dialog top ${Math.round(m.t)} ≠ centered ${Math.round(expT)}`)
			.toBeLessThanOrEqual(2)
		expect(m.l, `${where}: flush-left top-left anchor regression`).toBeGreaterThan(1)
	} else {
		expect(Math.abs(m.l), `${where}: ≤480 full-bleed sheet must pin to the left edge`).toBeLessThanOrEqual(1)
		expect(m.w, `${where}: ≤480 full-bleed sheet must span viewport width`).toBeGreaterThanOrEqual(m.vpW - 1)
		expect(m.t, `${where}: ≤480 full-bleed sheet must pin to the top edge`).toBeLessThanOrEqual(1)
	}
}

test.describe('craft transfer', () => {
	let fixture
	test.beforeAll(() => {
		fixture = provisionFixture()
	})
	test.afterAll(() => {
		deprovisionFixture(fixture?.uid)
	})

	test('admin transfer surface + report/progress dialogs 1280', async ({ page }) => {
		test.setTimeout(240_000)

		await page.setViewportSize({ width: 1280, height: 800 })
		await loginFixture(page, fixture.uid, fixture.password)
		await page.goto(`${BASE}${APP}/settings/transfer`, { waitUntil: 'domcontentloaded' })
		await expect(page.locator('#hmk-transfer-export-card')).toBeVisible({ timeout: 20_000 })

		const exp = await authedPost(page, `${BASE}${APP}/api/admin/transfer/export`, { passphrase: PASS })
		expect(exp.status()).toBe(200)
		const bytes = await exp.body()
		expect(bytes.length).toBeGreaterThan(200)

		await page.waitForTimeout(600)
		await shot(page, 'hmk-admin-transfer-light-1280')

		// uniform file error — wrong passphrase on a real container.
		// dead_platform_toast_api: the failure must reach a VISIBLE app-owned
		// toast, not only the visually-hidden live region.
		await page.locator('#hmk-transfer-file').setInputFiles({
			name: 't.nctransfer', mimeType: 'application/json', buffer: bytes,
		})
		await page.locator('#hmk-transfer-import-passphrase').fill('wrong-passphrase-000')
		await expect(page.locator('.hmk-toast--error').first()).toBeVisible({ timeout: 30_000 })
		await expect(page.locator('#hmk-transfer-result-live')).not.toBeEmpty()
		await shot(page, 'hmk-admin-transfer-fileerror-light-1280')

		// correct passphrase → preview → report dialog
		await page.locator('#hmk-transfer-import-passphrase').fill(PASS)
		const report = page.locator('#hmk-transfer-report')
		await expect(report).toBeVisible({ timeout: 30_000 })
		await expect(page.locator('#hmk-transfer-report-verdict')).toContainText(/\d/)
		// positional t() interpolation: localized values, never raw tokens
		const fileLine = await page.locator('#hmk-transfer-report-file').textContent()
		expect(fileLine || '').not.toMatch(/\{\d+\}|%\d+\$s|%d(?!\w)/)
		await assertDialogTopLayerGeometry(report, 'centered', 'report 1280')
		await shot(page, 'hmk-admin-transfer-report-dialog-light-1280')

		// apply → progress dialog stays open while the job waits queued
		await page.locator('#hmk-transfer-confirm').click()
		const progress = page.locator('#hmk-transfer-progress')
		await expect(progress).toBeVisible({ timeout: 10_000 })
		await expect(page.locator('#hmk-transfer-progress-text')).not.toBeEmpty()
		await assertDialogTopLayerGeometry(progress, 'centered', 'progress 1280')
		await shot(page, 'hmk-admin-transfer-progress-light-1280')

		// app-namespaced class id — other apps' TransferApplyJob rows never match
		const jobId = queryDb("SELECT id FROM oc_jobs WHERE class LIKE '%HomeCheck%TransferApplyJob%' ORDER BY id DESC LIMIT 1")
		expect(jobId).toMatch(/^\d+$/)
		const priorReceiptId = ((((await (await authedGet(page, `${BASE}${APP}/api/admin/transfer/status`)).json()).data || {}).lastReceipt) || {}).id || ''
		occ(['background-job:execute', jobId])

		let receipt = {}
		for (let i = 0; i < 60; i++) {
			const s = await authedGet(page, `${BASE}${APP}/api/admin/transfer/status`)
			receipt = (((await s.json()).data || {}).lastReceipt) || {}
			if (receipt.id && receipt.id !== priorReceiptId
				&& (receipt.result === 'applied' || receipt.result === 'failed')) break
			await new Promise((r) => setTimeout(r, 1_000))
		}
		expect(receipt.result).toBe('applied')

		// page reloads after apply; the server-rendered receipt line localizes
		// the mode — never the raw stored value.
		await page.waitForLoadState('domcontentloaded')
		await expect(page.locator('#hmk-transfer-last')).toBeVisible({ timeout: 20_000 })
		const lastLine = await page.locator('#hmk-transfer-last').textContent()
		expect(lastLine || '').not.toMatch(/\breplace\b/)
		await page.waitForTimeout(600)
		await shot(page, 'hmk-admin-transfer-after-apply-light-1280')
	})

	test('admin transfer surface 375/320 full-bleed sheet + narrow controls', async ({ page }) => {
		test.setTimeout(180_000)

		await page.setViewportSize({ width: 375, height: 812 })
		await loginFixture(page, fixture.uid, fixture.password)
		await page.goto(`${BASE}${APP}/settings/transfer`, { waitUntil: 'domcontentloaded' })
		await expect(page.locator('#hmk-transfer-export-card')).toBeVisible({ timeout: 20_000 })
		await page.waitForTimeout(600)
		await shot(page, 'hmk-admin-transfer-light-375')

		// File-input specificity (pack sync): NC core pins input[type=file]
		// to width:auto and the intrinsic ~320px min-size overflows narrow
		// sheets — the pack rule must land the declared 100% column width.
		const fileGeo = await page.locator('#hmk-transfer-file').evaluate((el) => {
			const r = el.getBoundingClientRect()
			const row = el.closest('.hmk-form-row') || el.parentElement
			const rr = row.getBoundingClientRect()
			return { w: r.width, rowW: rr.width, docScrollW: document.documentElement.scrollWidth, vpW: window.innerWidth }
		})
		expect(fileGeo.w, `file input ${Math.round(fileGeo.w)}px not pinned to form-row width ${Math.round(fileGeo.rowW)}px — width:auto pin leaked`)
			.toBeGreaterThanOrEqual(fileGeo.rowW - 1)
		expect(fileGeo.docScrollW - fileGeo.vpW,
			`page horizontal overflow at 375 (scrollW ${fileGeo.docScrollW} > vpW ${fileGeo.vpW})`)
			.toBeLessThanOrEqual(1)

		// real preview at 375 → report dialog must be a full-bleed sheet
		const exp = await authedPost(page, `${BASE}${APP}/api/admin/transfer/export`, { passphrase: PASS })
		expect(exp.status()).toBe(200)
		const bytes = await exp.body()
		await page.locator('#hmk-transfer-file').setInputFiles({
			name: 't.nctransfer', mimeType: 'application/json', buffer: bytes,
		})
		await page.locator('#hmk-transfer-import-passphrase').fill(PASS)
		const report = page.locator('#hmk-transfer-report')
		await expect(report).toBeVisible({ timeout: 30_000 })
		await assertDialogTopLayerGeometry(report, 'fullbleed', 'report 375')
		await shot(page, 'hmk-admin-transfer-report-dialog-light-375')
		await page.locator('#hmk-transfer-cancel').click()

		// 320px: mode radio labels and the file input must not clip mid-word
		await page.setViewportSize({ width: 320, height: 700 })
		await page.waitForTimeout(400)
		for (const sel of [
			'#hmk-transfer-import-form input[name="mode"][value="merge"]',
			'#hmk-transfer-import-form input[name="mode"][value="replace"]',
			'#hmk-transfer-file',
		]) {
			const clip = await page.locator(sel).evaluate((el) => {
				const host = el.closest('label') || el
				return { scrollW: host.scrollWidth, clientW: host.clientWidth }
			})
			expect(clip.scrollW - clip.clientW,
				`${sel}: ${clip.scrollW - clip.clientW}px clipped mid-word at 320px`)
				.toBeLessThanOrEqual(1)
		}
		await shot(page, 'hmk-admin-transfer-light-320')

		// dead_platform_toast_api at narrow width: a failed preview must paint
		// a visible .hmk-toast--error (not only the hidden live region).
		await page.setViewportSize({ width: 375, height: 812 })
		const exp2 = await authedPost(page, `${BASE}${APP}/api/admin/transfer/export`, { passphrase: PASS })
		const bytes2 = await exp2.body()
		await page.locator('#hmk-transfer-file').setInputFiles({
			name: 't.nctransfer', mimeType: 'application/json', buffer: bytes2,
		})
		await page.locator('#hmk-transfer-import-passphrase').fill('wrong-passphrase-000')
		await expect(page.locator('.hmk-toast--error').first()).toBeVisible({ timeout: 30_000 })
		await expect(page.locator('#hmk-transfer-result-live')).not.toBeEmpty()
		await shot(page, 'hmk-admin-transfer-fileerror-light-375')
	})
})
