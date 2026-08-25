/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Icon well visibility + WCAG non-text contrast (≥3:1).
 * Glyphs: brightness(0) on primary-element-light — never NC invert sentinels.
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
ok(/filter:\s*brightness\(0\)\s*;/.test(css), 'black glyph via brightness(0)');
ok(!/filter:\s*brightness\(0\)\s*invert\(1\)/.test(css), 'does not force white-on-primary');
ok(!/filter:\s*var\(--primary-invert-if-/.test(css), 'does not pipe NC invert sentinels into filter');
ok(/background:\s*var\(--color-primary-element-light/.test(css), 'well uses primary-element-light');
ok(/border:\s*2px solid var\(--color-primary-element\)/.test(css), 'well bordered with primary');

const pairs = [
	['#000000', '#e5eff5', 'black on default primary-light'],
	['#000000', '#ffffff', 'black on white'],
	['#000000', '#d9e3e8', 'black on soft primary-light'],
	['#00679e', '#ffffff', 'primary border vs white pane'],
];
for (const [fg, bg, label] of pairs) {
	const ratio = contrast(parseHex(fg), parseHex(bg));
	ok(ratio >= 3, `WCAG UI contrast ≥3:1 for ${label} (${ratio.toFixed(2)})`);
}

process.exit(failed ? 1 : 0);
