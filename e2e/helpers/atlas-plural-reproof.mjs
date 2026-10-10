// @ts-check
/**
 * Seed-defect re-proof (ds_chrome lane):
 *   hmk-vis-pluralization-folders + desklet-copy-folders-plural
 * Live-captures the dashboard desklet summary line under REAL server layout
 * state at folderCount=2 (plural) and folderCount=1 (singular), asserting
 * the l10n n() plural form actually rendered. Original layout is restored
 * after the singular capture.
 *
 * Usage: DS_PROBE_PASS=<secret> node e2e/helpers/atlas-plural-reproof.mjs [--out <craft-dir>]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.env.NC_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const PASS = process.env.DS_PROBE_PASS || 'DsProbe!hmk2026'
const USER = process.env.DS_PROBE_USER || 'hmk_ds_probe'
const OUT = process.argv.includes('--out')
	? process.argv[process.argv.indexOf('--out') + 1]
	: '/home/alex/Development/nextcloud-dev/.cursor/atlas-farm-v3/artifacts/homecheck/craft'
mkdirSync(OUT, { recursive: true })

const proof = { user: USER, base: BASE, startedAt: new Date().toISOString(), captures: [], findings: [] }

async function apiFetch(page, method, path, body) {
	return page.evaluate(async ({ method, path, body }) => {
		const token = (window.OC && window.OC.requestToken)
			|| document.querySelector('head[data-requesttoken]')?.getAttribute('data-requesttoken') || ''
		const res = await fetch(path, {
			method, credentials: 'same-origin',
			headers: { requesttoken: token, 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
		return { status: res.status, json: await res.json().catch(() => null) }
	}, { method, path, body })
}

async function deskletSubtitle(page) {
	await page.goto(`${BASE}/index.php/apps/dashboard/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
	await page.waitForSelector('#app-dashboard .panel', { timeout: 30000 })
	return page.evaluate(() => {
		const panel = [...document.querySelectorAll('#app-dashboard .panel')]
			.find((el) => el.querySelector('.panel--header img[src*="/homecheck/"]'))
		if (!panel) return null
		const entry = panel.querySelector('.item-list__entry')
		return {
			text: entry ? (entry.textContent || '').replace(/\s+/g, ' ').trim() : null,
			html: panel.querySelector('.panel--content')?.innerHTML?.slice(0, 2000) || '',
			panelFound: true,
		}
	})
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
try {
	// login (same settle-and-verify pattern as the ds audit)
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
	await page.locator('input[name="user"], #user').first().fill(USER, { force: true })
	await page.locator('input[name="password"], #password').first().fill(PASS, { force: true })
	await page.evaluate(() => {
		const btn = document.querySelector('[data-login-form-submit],button[type="submit"],input[type="submit"],button.login-button')
		if (btn) /** @type {HTMLElement} */ (btn).click()
	})
	await page.waitForTimeout(2000)
	await page.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
	if (page.url().includes('/login')) throw new Error('login_failed — bounced back to /login')

	// Ensure the desklet is on this user's dashboard layout.
	await apiFetch(page, 'POST', '/ocs/v2.php/apps/dashboard/api/v3/layout', {
		layout: ['homecheck-launcher', 'recommendations', 'calendar', 'user_status'],
	})

	const orig = await apiFetch(page, 'GET', '/index.php/apps/homecheck/api/layout')
	if (orig.status !== 200 || !orig.json?.data?.layout?.items) throw new Error(`layout GET failed: HTTP ${orig.status}`)
	const layout = orig.json.data.layout
	const entryIds = (orig.json.data.entries || []).map((e) => e.id).filter(Boolean)
	proof.originalFolderCount = layout.items.filter((it) => it.type === 'folder').length
	proof.origItems = layout.items
	if (entryIds.length < 2) throw new Error(`need ≥2 entries to seed folders, got ${entryIds.length}`)

	// Seed exactly two REAL folders (validator: fld_[A-Za-z0-9]{8,64}, children
	// = nav ids) so both plural forms render under server state. Children are
	// removed from top-level to avoid duplicate_entry rejects.
	const mkItems = (nFolders) => {
		const kids = entryIds.slice(0, nFolders)
		const items = []
		for (let i = 0; i < nFolders; i++) {
			items.push({ type: 'folder', id: `fld_proof${i}${'x'.repeat(9)}`, name: `DS Proof ${i + 1}`, children: [kids[i]] })
		}
		for (const it of layout.items) {
			if (it.type === 'folder') continue
			if (it.type === 'app' && kids.includes(it.id)) continue
			items.push(it)
		}
		return items
	}

	const put2 = await apiFetch(page, 'PUT', '/index.php/apps/homecheck/api/layout', {
		layout: { ...layout, items: mkItems(2) },
	})
	proof.seedPut = put2.status
	if (put2.status !== 200) throw new Error(`two-folder PUT failed: HTTP ${put2.status} ${JSON.stringify(put2.json)}`)
	const folderCount = 2

	async function snapDesklet(name) {
		const panel = page.locator('#app-dashboard .panel').filter({
			has: page.locator('.panel--header img[src*="/homecheck/"]'),
		}).first()
		const file = join(OUT, `${name}.png`)
		await panel.screenshot({ path: file })
		proof.captures.push(`${name}.png`)
	}

	// ── plural state (real current layout) ──
	const plural = await deskletSubtitle(page)
	if (!plural || !plural.text) throw new Error('homecheck desklet not rendered on dashboard')
	proof.plural = { folderCount, text: plural.text }
	const pluralRe = new RegExp(`${folderCount} folders\\b`)
	if (!pluralRe.test(plural.text)) proof.findings.push(`plural copy wrong: "${plural.text}" (want "${folderCount} folders")`)
	if (/\b1 folders\b/.test(plural.text)) proof.findings.push(`seeded defect present: "${plural.text}"`)
	await snapDesklet('homecheck-web-desklet-plural-folders')

	// ── singular state: pin layout to exactly one folder ──
	const cur = await apiFetch(page, 'GET', '/index.php/apps/homecheck/api/layout')
	const put = await apiFetch(page, 'PUT', '/index.php/apps/homecheck/api/layout', {
		layout: { ...cur.json.data.layout, items: mkItems(1) },
	})
	proof.singularPut = put.status
	if (put.status !== 200) throw new Error(`singular layout PUT failed: HTTP ${put.status} ${JSON.stringify(put.json)}`)

	const singular = await deskletSubtitle(page)
	if (!singular || !singular.text) throw new Error('desklet missing after singular PUT')
	proof.singular = { folderCount: 1, text: singular.text }
	if (!/\b1 folder\b/.test(singular.text)) proof.findings.push(`singular copy wrong: "${singular.text}" (want "1 folder")`)
	if (/\b1 folders\b/.test(singular.text)) proof.findings.push(`seeded defect present in singular: "${singular.text}"`)
	await snapDesklet('homecheck-web-desklet-singular-folder')
} finally {
	// restore original layout unconditionally
	try {
		const cur = await apiFetch(page, 'GET', '/index.php/apps/homecheck/api/layout')
		if (cur.status === 200 && cur.json?.data?.layout) {
			proof.restorePut = (await apiFetch(page, 'PUT', '/index.php/apps/homecheck/api/layout', {
				layout: { ...cur.json.data.layout, items: proof.origItems || cur.json.data.layout.items },
			})).status
		}
	} catch (e) { proof.restoreError = String(e) }
	writeFileSync(join(OUT, 'desklet-plural-proof.json'), JSON.stringify(proof, null, 2))
	console.log(`reproof findings=${proof.findings.length} captures=${proof.captures.length}`)
	for (const f of proof.findings) console.log('FAIL', f)
	await browser.close()
}
process.exit(proof.findings.length ? 1 : 0)
