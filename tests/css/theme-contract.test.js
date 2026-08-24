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

ok(css.includes('#app-content .hmk-app'), 'tokens scoped under #app-content');
ok(css.includes('--color-primary-element'), 'maps to NC primary');
ok(css.includes('--color-main-background'), 'maps to NC background');
ok(css.includes('--color-element-error'), 'danger uses element-error fill');
ok(css.includes('--color-border'), 'uses NC border token');
ok(css.includes('dialog.hmk-dialog:not([open])'), 'dialog closed state override');
ok(css.includes('forced-colors: active'), 'forced-colors support');
ok(css.includes('prefers-contrast: more'), 'high contrast support');
ok(css.includes('env(safe-area-inset'), 'safe-area insets');
ok(css.includes('max-width: 768px'), 'tablet breakpoint');
ok(css.includes('--hmk-icon-well'), 'icon well token');
ok(css.includes('overflow-x: clip'), 'prevents horizontal page scroll');

const mainTpl = fs.readFileSync(path.join(root, 'templates/main.php'), 'utf8');
const adminTpl = fs.readFileSync(path.join(root, 'templates/admin.php'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
ok(mainTpl.includes('button-vue hmk-btn'), 'template buttons use button-vue');
ok(adminTpl.includes('button-vue hmk-btn'), 'admin buttons use button-vue');
ok(appJs.includes("'button-vue hmk-card__launch'"), 'dynamic card launch uses button-vue');
ok(appJs.includes("'button-vue hmk-picker-list__item'"), 'folder picker uses button-vue');

process.exit(failed ? 1 : 0);
