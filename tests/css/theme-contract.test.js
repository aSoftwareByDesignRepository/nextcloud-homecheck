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

/** Feature rules must not use raw #hex outside var(..., fallback) */
const hexOutsideVar = css.replace(/var\([^)]+\)/g, '').match(/#[0-9a-fA-F]{3,8}\b/g);
ok(!hexOutsideVar || hexOutsideVar.length === 0, 'no raw hex in feature CSS');

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
ok(css.includes('hmk-shell--wide'), 'wide shell modifier present');
ok(css.includes('color-background-hover'), 'native NC hover on tiles');
ok(css.includes('hmk-toolbar'), 'compact NC toolbar');
ok(css.includes('is-drop-target'), 'drop target visual feedback');
ok(css.includes('is-dragging'), 'dragging visual feedback');
ok(css.includes('touch-action: none'), 'edit cards allow pointer capture DnD');
ok(css.includes('justify-content: start'), 'dense grid packs start');
ok(css.includes('minmax(5.5rem, 6.25rem)'), 'dense fixed-ish tile tracks');
ok(!css.match(/\.hmk-grid\s*\{[^}]*\b1fr\b/s), 'grid does not 1fr-stretch tiles');
ok(css.includes('max-width: 7rem'), 'card max-width caps empty space');
ok(css.includes('--primary-invert-if-dark'), 'app icons use NC primary invert');
ok(css.includes('--hmk-icon-well'), 'icon well token defined');
ok(css.includes('--hmk-icon-inner'), 'icon glyph size token defined');
ok(css.includes('background: var(--color-primary-element)'), 'icon well uses primary fill');

const deskletCss = fs.readFileSync(path.join(root, 'css/desklet-nextcloud.css'), 'utf8');
ok(deskletCss.includes('/homecheck/'), 'desklet CSS scoped to homecheck');
ok(deskletCss.includes('min-height: 44px'), 'desklet 44px touch');
ok(fs.existsSync(path.join(root, 'img/app-dashboard.svg')), 'app-dashboard.svg present');

const mainTpl = fs.readFileSync(path.join(root, 'templates/main.php'), 'utf8');
const adminTpl = fs.readFileSync(path.join(root, 'templates/admin.php'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
ok(mainTpl.includes('button-vue primary'), 'main uses NC primary button');
ok(mainTpl.includes('button-vue secondary'), 'main uses NC secondary button');
ok(mainTpl.includes('class="notecard"'), 'CTA uses NC notecard');
ok(adminTpl.includes('button-vue hmk-btn'), 'admin buttons use button-vue');
ok(appJs.includes("'button-vue hmk-card__launch'"), 'dynamic card launch uses button-vue');
ok(appJs.includes("'button-vue hmk-picker-list__item'"), 'folder picker uses button-vue');
ok(!css.match(/\.hmk-app\s*\{[^}]*max-width:\s*72rem/s), 'no 72rem cap on page root');

const shellInit = fs.readFileSync(path.join(root, 'js/shell-init.js'), 'utf8');
ok(shellInit.includes('app-homecheck'), 'shell init supports NC34 content root');
ok(mainTpl.includes('hmk-shell hmk-shell--wide'), 'main template uses wide shell');
ok(mainTpl.includes('hmk-toolbar'), 'main template uses compact toolbar');
ok(mainTpl.includes('hmk-edit-hint'), 'main template has edit hint');
ok(appJs.includes('editHint'), 'app.js toggles edit hint');

const appPhp = fs.readFileSync(path.join(root, 'lib/AppInfo/Application.php'), 'utf8');
ok(appPhp.includes('registerDashboardWidget(LauncherWidget::class)'), 'dashboard desklet registered');

process.exit(failed ? 1 : 0);
