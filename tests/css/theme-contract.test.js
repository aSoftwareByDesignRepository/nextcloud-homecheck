/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * CSS theme/responsive contract — no feature hex; NC variable mapping required.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');

let failed = 0;
function ok(cond, msg) {
	if (!cond) {
		console.error('FAIL:', msg);
		failed++;
	} else {
		console.log('OK:', msg);
	}
}

/** Feature rules: no raw #hex outside var(..., fallback) except Check family canvas */
const CHECK_CANVAS_HEX = new Set(['#f5f7fb', '#0b1622', '#152536', '#ffffff', '#000000', '#d9e2ec']);
const hexOutsideVar = css.replace(/var\([^)]+\)/g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || [];
const bannedHex = hexOutsideVar.filter((h) => !CHECK_CANVAS_HEX.has(h.toLowerCase()));
ok(bannedHex.length === 0, 'no raw hex in feature CSS except Check canvas tokens (' + bannedHex.join(',') + ')');
ok(css.includes('#f5f7fb'), 'Check light canvas #f5f7fb');
ok(css.includes('#0b1622'), 'Check dark canvas #0b1622');

ok(css.includes('#app-content .hmk-app'), 'legacy NC app-content tokens retained');
ok(css.includes('#content[class*="app-homecheck"].hmk-app'), 'NC34 content root scoped');
ok(css.includes('--color-primary-element'), 'maps to NC primary');
ok(css.includes('--color-main-background'), 'maps to NC background');
ok(css.includes('--color-element-error'), 'danger uses element-error fill');
ok(css.includes('--color-border'), 'uses NC border token');
ok(css.includes('dialog.hmk-dialog:not([open])'), 'dialog closed state override');
ok(css.includes('forced-colors: active'), 'forced-colors support');
ok(css.includes('prefers-contrast: more'), 'high contrast support');
ok(css.includes('env(safe-area-inset'), 'safe-area insets');
ok(css.includes('max-width: 768px'), 'tablet breakpoint');
ok(css.includes('overflow-x: clip'), 'prevents horizontal page scroll');
ok(/#homecheck-app\s*\{[^}]*overflow-y:\s*auto/s.test(css), 'app root is vertical scrollport');
ok(/\.hmk-credit\s*\{[^}]*margin-top:\s*auto/s.test(css), 'vendor credit pinned to page end via margin-top auto');
ok(/\.hmk-credit\s*\{[^}]*flex-shrink:\s*0/s.test(css), 'vendor credit never collapses');
ok(
	/button\.button-vue\.secondary\.hmk-chrome__btn[\s\S]*?background-color:\s*var\(--hmk-check-surface/.test(css),
	'chrome secondary uses opaque Check surface for canvas AA',
);
ok(
	/body\.theme--dark[\s\S]*?\.hmk-pane__icon[\s\S]*?invert\(1\)/.test(css),
	'dark theme icon glyphs invert for AA on dark wells',
);
ok(
	/body\.theme--highcontrast[\s\S]*?\.hmk-pane__icon[\s\S]*?invert\(1\)/.test(css),
	'high-contrast theme icon glyphs invert for AA on dark wells',
);
ok(css.includes('hmk-shell--wide'), 'wide shell modifier present');
ok(css.includes('color-background-hover'), 'native NC hover on tiles');
ok(css.includes('hmk-pane'), 'dashboard individual panes');
ok(css.includes('--hmk-overlay-height'), 'viewport height under header for scroll');
ok(css.includes('calc(100dvh - var(--header-height'), 'content height accounts for NC header');
ok(css.includes('hmk-panels'), 'pane host flex wrap');
ok(css.includes('hmk-greeting'), 'dashboard greeting');
ok(css.includes('--hmk-check-canvas'), 'Check flat canvas token');
ok(css.includes('background-image: none'), 'no wallpaper stage as chrome');
ok(!/background-image:\s*var\(--image-background\)/.test(css), 'bans --image-background as page chrome');
/* Host header AA: never steal body theming (transparent #header sits on body) */
ok(
	!/body:has\(#content\[class\*=["']app-homecheck/.test(css)
		&& !/body:has\(#app-content\.hmk-app\)[\s\S]{0,120}background-color:\s*var\(--hmk-check-canvas/.test(css)
		&& !/body:has\([\s\S]*?hmk-app[\s\S]*?background-image:\s*none\s*!important/.test(css),
	'does not force Check canvas / kill wallpaper on body (preserves NC header backdrop)',
);
ok(
	/#app-content\.hmk-app[\s\S]*?background-image:\s*none/.test(css)
		&& /#content\[class\*="app-homecheck"\]\.hmk-app[\s\S]*?background-color:\s*var\(--hmk-check-canvas/.test(css),
	'flat Check canvas scoped to content root only',
);
ok(css.includes('line-clamp: 2') || css.includes('-webkit-line-clamp: 2'), 'pane titles two-line clamp');
ok(css.includes('#hmk-cta:not([hidden])') || css.includes('hmk-cta:not([hidden])'), 'Bachus hides home when CTA teaches');
ok(css.includes('prefers-reduced-transparency'), 'reduced transparency fallback');
ok(css.includes('is-drop-target'), 'drop target visual feedback');
ok(css.includes('is-dragging'), 'dragging visual feedback');
ok(css.includes('touch-action: none'), 'edit panes allow pointer capture DnD');
ok(css.includes('flex-wrap: wrap'), 'panes wrap responsively');
ok(css.includes('--hmk-pane-width') || css.includes('width: var(--hmk-pane-width'), 'dashboard-sized pane track');
ok(!css.includes('.hmk-grid'), 'legacy dense grid removed');
ok(!css.includes('.hmk-card'), 'legacy card tiles removed');
ok(css.includes('--hmk-icon-well'), 'icon well token defined');
ok(css.includes('--hmk-icon-inner'), 'icon glyph size token defined');
ok(css.includes('.hmk-pane__icon-well'), 'icon well wrapper present');
ok(/filter:\s*brightness\(0\)\s*;/.test(css), 'black glyph on light well');
ok(/--color-primary-element-light/.test(css), 'icon well uses primary-element-light');
ok(/border:\s*2px\s+solid\s+var\(--color-primary-element\)/.test(css), 'icon well bordered with primary');
ok(!/filter:\s*var\(--primary-invert-if-/.test(css), 'no NC invert sentinel in icon filter');
ok(
	/\.hmk-pane__icon \{[^}]*filter:\s*brightness\(0\)\s*;/s.test(css),
	'default icon filter is black silhouette (not inverted)',
);
ok(
	/body\.theme--dark[\s\S]*?\.hmk-pane__icon[\s\S]*?invert\(1\)/.test(css),
	'dark theme scopes invert(1) for icon AA',
);
ok(css.includes('button.button-vue.primary'), 'vanilla primary buttons styled to NC primary');
ok(css.includes('background-color: var(--hmk-primary-fill'), 'primary button fill uses AA-safe hmk-primary-fill');
ok(
	/--hmk-primary-fill:\s*var\(--color-primary-element\)/.test(css),
	'primary fill tracks NC primary (no main-text darken that breaks pale accents)',
);
ok(css.includes('--hmk-secondary-fill'), 'secondary fill token defined');
ok(css.includes('button.button-vue.secondary'), 'vanilla secondary buttons styled');
ok(
	/button\.button-vue\.secondary[\s\S]*?background-color:\s*var\(--color-background-dark/.test(css),
	'secondary fill uses background-dark (not pale primary-light)',
);
ok(css.includes('--hmk-danger-fill-solid'), 'danger uses AA-safe solid fill token');
ok(
	/body\.theme--dark[\s\S]*?\.hmk-admin[\s\S]*?--hmk-danger-ink:\s*color-mix/.test(css),
	'dark admin danger-ink lightened (AA on near-black settings)',
);
ok(
	/#hmk-admin p#hmk-admin-error:not\(:empty\)[\s\S]*?background:\s*color-mix/.test(css),
	'admin error uses soft danger well only when not empty',
);
ok(
	/#hmk-admin p#hmk-admin-error:empty[\s\S]*?display:\s*none/.test(css),
	'empty admin error hides danger well chrome',
);
ok(css.includes('--hmk-pane-width'), 'pane width token defined');
ok(!css.includes('#homecheck-app .hmk-btn--danger {\n\t--color-primary-element:'), 'danger no longer remaps primary token');

const deskletCss = fs.readFileSync(path.join(root, 'css/desklet-nextcloud.css'), 'utf8');
ok(deskletCss.includes('/homecheck/'), 'desklet CSS scoped to homecheck');
ok(deskletCss.includes('min-height: 44px'), 'desklet 44px touch');
ok(fs.existsSync(path.join(root, 'img/app-dashboard.svg')), 'app-dashboard.svg present');

const mainTpl = fs.readFileSync(path.join(root, 'templates/main.php'), 'utf8');
const adminTpl = fs.readFileSync(path.join(root, 'templates/admin.php'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
ok(mainTpl.includes('button-vue primary'), 'main uses NC primary button');
ok(mainTpl.includes('button-vue secondary'), 'main uses NC secondary button');
ok(mainTpl.includes('class="notecard hmk-cta"') || mainTpl.includes('notecard hmk-cta'), 'CTA uses NC notecard');
ok(mainTpl.includes('hmk-greeting'), 'main has greeting');
ok(mainTpl.includes('hmk-panels'), 'main has panes host');
ok(mainTpl.includes('hmk-topbar'), 'main has sticky topbar');
ok(mainTpl.includes('hmk-home-toggle'), 'main has home toggle');
ok(appJs.includes('toggleDefaultLanding'), 'home toggle handler');
ok(mainTpl.includes('hmk-chrome'), 'main has edit chrome toolbar');
ok(css.includes('hmk-topbar'), 'sticky topbar chrome');
ok(css.includes('is-menu-open'), 'open menu raises pane stacking');
ok(css.includes('pointer-events: none'), 'dragging pane ignores hit-testing');
ok(!mainTpl.includes('Your apps'), 'mega-panel title removed');
ok(adminTpl.includes('button-vue hmk-btn'), 'admin buttons use button-vue');
ok(appJs.includes("'button-vue hmk-pane__launch'"), 'app pane launch uses button-vue');
ok(appJs.includes("'button-vue hmk-pane__row-launch'"), 'folder row launch uses button-vue');
ok(!appJs.includes('hmk-pane__row-message'), 'no redundant Open subtitle');
ok(!appJs.includes('openApp'), 'openApp i18n removed');
ok(appJs.includes("'button-vue hmk-picker-list__item'"), 'folder picker uses button-vue');
ok(appJs.includes('function makePane'), 'pane factory present');
ok(appJs.includes('function greetingPeriod'), 'greeting period helper');
ok(appJs.includes('function formatGreeting'), 'greeting formatter');
ok(appJs.includes('paintGreeting'), 'greeting paint on boot');
ok(!css.match(/\.hmk-app\s*\{[^}]*max-width:\s*72rem/s), 'no 72rem cap on page root');

const shellInit = fs.readFileSync(path.join(root, 'js/shell-init.js'), 'utf8');
ok(shellInit.includes('app-homecheck'), 'shell init supports NC34 content root');
ok(mainTpl.includes('hmk-shell hmk-shell--wide'), 'main template uses wide shell');
ok(mainTpl.includes('hmk-edit-hint'), 'main template has edit hint');
ok(appJs.includes('editHint'), 'app.js toggles edit hint');

const pagePhp = fs.readFileSync(path.join(root, 'lib/Controller/PageController.php'), 'utf8');
ok(pagePhp.includes('displayName'), 'PageController exposes displayName');

const appPhp = fs.readFileSync(path.join(root, 'lib/AppInfo/Application.php'), 'utf8');
ok(appPhp.includes('registerDashboardWidget(LauncherWidget::class)'), 'dashboard desklet registered');

process.exit(failed ? 1 : 0);
