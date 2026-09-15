/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Icon well visibility + WCAG non-text contrast (≥3:1).
 * Glyphs: CSS mask + --color-primary-element on --hmk-tint-info — never NC invert sentinels.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

let failed = 0;
function ok(cond, msg) {
	if (!cond) {
		console.error('FAIL:', msg);
		failed++;
	} else {
		console.log('OK:', msg);
	}
}

function parseHex(hex) {
	const h = hex.replace('#', '').trim();
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16),
	];
}

function mix(fg, bg, p) {
	return [
		Math.round(fg[0] * p + bg[0] * (1 - p)),
		Math.round(fg[1] * p + bg[1] * (1 - p)),
		Math.round(fg[2] * p + bg[2] * (1 - p)),
	];
}

function relLum(rgb) {
	const f = (c) => {
		c /= 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function contrast(a, b) {
	const L1 = relLum(a);
	const L2 = relLum(b);
	const hi = Math.max(L1, L2);
	const lo = Math.min(L1, L2);
	return (hi + 0.05) / (lo + 0.05);
}

ok(css.includes('.hmk-pane__icon-well'), 'icon well class');
ok(appJs.includes('hmk-pane__icon-well'), 'JS builds wells');
ok(appJs.includes('hmk-pane__menu-dots'), 'JS builds kebab three-dot glyph');
ok(appJs.includes('--hmk-icon-url'), 'JS sets CSS mask URL for theme-aware glyphs');
ok(appJs.includes('cssMaskUrl'), 'JS escapes icon URLs for CSS mask');
ok(/mask-image:\s*var\(--hmk-icon-url\)/.test(css), 'icons use CSS mask (theme-aware)');
ok(
	/\.hmk-pane__icon \{[\s\S]*?background-color:\s*var\(--color-primary-element\)/s.test(css),
	'icon ink is NC primary (tracks accent + theme)',
);
ok(
	/\.hmk-pane__icon-well \{[\s\S]*?background:\s*var\(--hmk-tint-info/s.test(css),
	'well uses tint-info (design-system)',
);
ok(!/filter:\s*var\(--primary-invert-if-/.test(css), 'does not pipe NC invert sentinels into filter');
ok(
	!/\.hmk-pane__icon \{[^}]*filter:\s*brightness\(0\)\s*;/s.test(css),
	'does not force black brightness(0) silhouette (not theme-aware)',
);
ok(
	!/body\.theme--dark[\s\S]*?\.hmk-pane__icon[\s\S]*?invert\(1\)/.test(css),
	'does not rely on dark-body invert(1) for icon AA',
);
ok(css.includes('.hmk-pane__menu-dots'), 'edit kebab is a three-dot glyph not a filled disc');
ok(/border:\s*2px solid var\(--color-primary-element\)/.test(css), 'well bordered with primary');

const white = parseHex('#ffffff');
const darkBg = parseHex('#171717');
const pairs = [
	[parseHex('#00679e'), mix(parseHex('#00679e'), white, 0.16), 'primary on light tint-info'],
	[parseHex('#0082c9'), mix(parseHex('#0082c9'), white, 0.16), 'NC default primary on tint-info'],
	[parseHex('#7ac4ef'), mix(parseHex('#7ac4ef'), darkBg, 0.16), 'light primary on dark tint-info'],
	[parseHex('#ffffff'), parseHex('#000000'), 'HC main-text on black'],
	[parseHex('#00679e'), white, 'primary border vs white pane'],
];
for (const [fg, bg, label] of pairs) {
	const ratio = contrast(fg, bg);
	ok(ratio >= 3, `WCAG UI contrast ≥3:1 for ${label} (${ratio.toFixed(2)})`);
}

process.exit(failed ? 1 : 0);
