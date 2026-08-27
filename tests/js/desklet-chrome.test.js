/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * HomeCheck desklet chrome contracts — CSS + load() registration.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let failed = 0;
function ok(cond, msg) {
	if (!cond) {
		console.error('FAIL:', msg);
		failed++;
	} else {
		console.log('OK:', msg);
	}
}

ok(fs.existsSync(path.join(root, 'css/desklet-nextcloud.css')), 'desklet CSS ships');
ok(fs.existsSync(path.join(root, 'img/app-dashboard.svg')), 'app-dashboard.svg ships');
ok(fs.existsSync(path.join(root, 'img/app-dark.svg')), 'app-dark.svg ships');

const css = read('css/desklet-nextcloud.css');
ok(css.includes('.panel--header img[src*="/homecheck/"]'), 'scoped to homecheck panel icon');
ok(css.includes('min-height: 44px'), '44px touch targets');
ok(css.includes(':focus-visible'), 'focus-visible rings');
ok(css.includes('app-dashboard.svg'), 'uses dark surface glyph');
ok(/filter:\s*brightness\(0\)\s*invert\(1\)/.test(css), 'theme invert for dark UI without NC sentinel');
ok(!/filter:\s*var\(--background-invert-if-dark\)/.test(css), 'desklet avoids NC invert sentinel');
ok(css.includes('prefers-reduced-motion'), 'reduced motion');
ok(css.includes('a.more'), 'primary more button chrome');
ok(css.includes('forced-colors: active'), 'forced-colors AA');

const trait = read('lib/Dashboard/RegistersDeskletStylesTrait.php');
ok(trait.includes("Util::addStyle(Application::APP_ID, 'desklet-nextcloud')"), 'trait registers desklet CSS');

const widget = read('lib/Dashboard/LauncherWidget.php');
ok(widget.includes('RegistersDeskletStylesTrait'), 'widget uses desklet trait');
ok(widget.includes('registerDeskletStylesForWidget()'), 'widget load registers styles');
ok(widget.includes('linkToRouteAbsolute'), 'absolute route URLs');
ok(widget.includes('summarizeForUser'), 'read-only summarize');
ok(widget.includes('getUID() !== $userId'), 'desklet binds session UID for items');
ok(!/\bgetForUser\s*\(/.test(widget), 'never persists via getForUser');
ok(widget.includes("APP_ID . '-launcher'") || widget.includes('homecheck-launcher'), 'stable widget id');

const app = read('lib/AppInfo/Application.php');
ok(app.includes('registerDashboardWidget(LauncherWidget::class)'), 'widget registered at boot');

const appCss = read('css/app.css');
ok(appCss.includes('flex-wrap: wrap'), 'panes wrap responsively');
ok(appCss.includes('--hmk-pane-width') || appCss.includes('width: var(--hmk-pane-width'), 'dashboard-sized pane width');
ok(!appCss.includes('.hmk-grid'), 'legacy dense grid removed');
ok(!appCss.includes('.hmk-card'), 'legacy card tiles removed');
ok(appCss.includes('hmk-pane'), 'individual frosted panes');

process.exit(failed ? 1 : 0);
