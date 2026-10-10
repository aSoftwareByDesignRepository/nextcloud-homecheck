// Re-probe hmk-vis-27: .app-navigation-toggle vs #hmk-admin h2 overlap.
// Same method as critic-admin-scroll-overlap-20261010.json.log.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = (process.env.NC_BASE_URL || 'http://localhost:8081').replace(/\/$/, '')
const PASS = process.env.DS_PROBE_PASS || 'DsProbe!hmk2026'
const OUT = process.env.PROBE_OUT || '/tmp/hmk-navtoggle-overlap.json'

const browser = await chromium.launch()
const login = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } })
const lp = await login.newPage()
await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await lp.locator('input[name="user"], #user').first().fill('hmk_ds_admin', { force: true })
await lp.locator('input[name="password"], #password').first().fill(PASS, { force: true })
await lp.evaluate(() => {
	const btn = document.querySelector('[data-login-form-submit],button[type="submit"],input[type="submit"],button.login-button')
	if (btn) btn.click()
})
await lp.waitForTimeout(2000)
await lp.goto(`${BASE}/index.php/apps/homecheck/`, { waitUntil: 'domcontentloaded' })
if (lp.url().includes('/login')) throw new Error('login_failed')
const state = await login.storageState()
await login.close()

const checks = {}
for (const vp of [{ w: 320, h: 640 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }]) {
	const ctx = await browser.newContext({ baseURL: BASE, storageState: state, viewport: { width: vp.w, height: vp.h } })
	const page = await ctx.newPage()
	await page.goto(`${BASE}/index.php/settings/admin/additional`, { waitUntil: 'domcontentloaded' })
	try { await page.waitForLoadState('networkidle', { timeout: 5000 }) } catch {}
	await page.waitForTimeout(800)
	const res = await page.evaluate(() => {
		const admin = document.getElementById('hmk-admin')
		const h2 = admin ? admin.querySelector('h2') : null
		const toggle = document.querySelector('.app-navigation-toggle')
		const scroller = document.getElementById('app-content-vue')
		// Land the section at scroller top exactly like an anchored jump.
		if (admin && admin.scrollIntoView) admin.scrollIntoView({ block: 'start' })
		const r2 = h2 ? h2.getBoundingClientRect() : null
		const rt = toggle ? toggle.getBoundingClientRect() : null
		const cs = toggle ? getComputedStyle(toggle) : null
		const overlap = r2 && rt && r2.left < rt.right && r2.right > rt.left && r2.top < rt.bottom && r2.bottom > rt.top
		return {
			scrollerId: scroller ? 'app-content-vue' : null,
			scrollRange: scroller ? scroller.scrollHeight - scroller.clientHeight : null,
			scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
			hmkAdminDocTop: admin ? Math.round(admin.getBoundingClientRect().top + (scroller ? scroller.scrollTop : 0)) : null,
			navToggle: rt ? { x: Math.round(rt.x), y: Math.round(rt.y), w: Math.round(rt.width), h: Math.round(rt.height), display: cs?.display } : null,
			h2: r2 ? { x: Math.round(r2.x), y: Math.round(r2.y), w: Math.round(r2.width), h: Math.round(r2.height) } : null,
			overlapX: r2 && rt ? (r2.left < rt.right && r2.right > rt.left) : null,
			overlapY: r2 && rt ? (r2.top < rt.bottom && r2.bottom > rt.top) : null,
			overlap,
			// Also probe worst case: park the h2 edge exactly at the toggle band.
		}
	})
	// Worst-case park: scroll so h2's top edge sits inside the toggle y-band.
	const worst = await page.evaluate(() => {
		const admin = document.getElementById('hmk-admin')
		const h2 = admin?.querySelector('h2')
		const toggle = document.querySelector('.app-navigation-toggle')
		const scroller = document.getElementById('app-content-vue')
		if (!admin || !h2 || !toggle || !scroller) return { skipped: true }
		const rt = toggle.getBoundingClientRect()
		// Park scrollTop so the h2 lands mid-band.
		const target = (h2.getBoundingClientRect().top + scroller.scrollTop) - (rt.top + 10)
		scroller.scrollTop = target
		const r2 = h2.getBoundingClientRect()
		const overlap = r2.left < rt.right && r2.right > rt.left && r2.top < rt.bottom && r2.bottom > rt.top
		return {
			parkedScrollTop: Math.round(scroller.scrollTop),
			h2: { x: Math.round(r2.x), y: Math.round(r2.y), w: Math.round(r2.width), h: Math.round(r2.height) },
			navToggle: { x: Math.round(rt.x), y: Math.round(rt.y), w: Math.round(rt.width), h: Math.round(rt.height) },
			overlapX: r2.left < rt.right && r2.right > rt.left,
			overlapY: r2.top < rt.bottom && r2.bottom > rt.top,
			overlap,
		}
	})
	checks[`${vp.w}x${vp.h}`] = { atSectionTop: res, parkedWorstCase: worst }
	await ctx.close()
}
await browser.close()
const out = { generated_at: new Date().toISOString(), fix: 'hmk-admin scroll-margin-top + h2 margin-inline-start:var(--default-clickable-area)', checks }
writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
