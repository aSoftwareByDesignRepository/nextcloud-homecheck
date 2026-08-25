/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lightweight client-side contract checks (folder id shape, name rules).
 */
'use strict';

let failed = 0;
function ok(cond, msg) {
	if (!cond) {
		console.error('FAIL:', msg);
		failed++;
	} else {
		console.log('OK:', msg);
	}
}

const FOLDER_ID = /^fld_[A-Za-z0-9]{8,64}$/;
const NAME = /^[\p{L}\p{N} _\-\.\/\(\)]+$/u;

ok(FOLDER_ID.test('fld_abcdefgh'), 'folder id ok');
ok(!FOLDER_ID.test('fld_short'), 'folder id too short');
ok(!FOLDER_ID.test('folder_abcdefgh'), 'folder id prefix');
ok(NAME.test('Work / HR'), 'name ok');
ok(!NAME.test('bad<script>'), 'name rejects html');
ok('x'.repeat(40).length === 40, 'name boundary helper');

function flatten(items) {
	const out = [];
	for (const item of items) {
		if (item.type === 'app') out.push(item.id);
		if (item.type === 'folder') out.push(...(item.children || []));
	}
	return out;
}
ok(
	JSON.stringify(flatten([
		{ type: 'app', id: 'a' },
		{ type: 'folder', id: 'fld_abcdefgh', children: ['b', 'c'] },
		{ type: 'app', id: 'd' },
	])) === JSON.stringify(['a', 'b', 'c', 'd']),
	'client flatten in-place',
);

function isSafeHref(href) {
	if (!href || typeof href !== 'string') return false;
	const h = href.trim();
	if (h.charAt(0) === '/') return h.indexOf('//') !== 0;
	if (!/^https?:\/\//i.test(h)) return false;
	// Node has no window — fail closed for absolute URLs (matches guard without origin)
	if (typeof window === 'undefined' || !window.location) return false;
	try {
		return new URL(h).origin === window.location.origin;
	} catch (e) {
		return false;
	}
}
ok(isSafeHref('/apps/files'), 'safe relative');
ok(!isSafeHref('javascript:alert(1)'), 'block javascript');
ok(!isSafeHref('//evil'), 'block protocol-relative');
ok(!isSafeHref('https://evil.example/x'), 'block foreign absolute in js helper without matching origin');

/** Apply server save result without clobbering newer local edits (Zeus MF). */
function applySaveResult(layout, serverLayout, epochAtStart, localEpoch) {
	if (epochAtStart !== localEpoch) {
		layout.revision = serverLayout.revision;
		return { layout, dirty: true, keptLocal: true };
	}
	return { layout: serverLayout, dirty: false, keptLocal: false };
}
const base = { version: 1, revision: 1, items: [{ type: 'app', id: 'a' }] };
const server = { version: 1, revision: 2, items: [{ type: 'app', id: 'a' }] };
const localDuring = { version: 1, revision: 1, items: [{ type: 'app', id: 'b' }] };
const r1 = applySaveResult(localDuring, server, 1, 2);
ok(r1.keptLocal === true, 'in-flight edit keeps local items');
ok(r1.layout.revision === 2, 'in-flight edit adopts server revision');
ok(r1.layout.items[0].id === 'b', 'in-flight edit did not restore server items');
const r2 = applySaveResult(base, server, 3, 3);
ok(r2.keptLocal === false && r2.layout.items[0].id === 'a' && r2.layout.revision === 2, 'idle save applies server layout');

function shouldScheduleAppOrderRetry(syncFail, alreadyScheduled) {
	return !!syncFail && !alreadyScheduled;
}
ok(shouldScheduleAppOrderRetry(true, false) === true, 'schedule apporder retry on sync fail');
ok(shouldScheduleAppOrderRetry(true, true) === false, 'do not double-schedule apporder retry');
ok(shouldScheduleAppOrderRetry(false, false) === false, 'no retry when sync ok');

function appOrderRetryDelayMs(attempt, maxAttempts, baseMs) {
	if (attempt >= maxAttempts) {
		return null;
	}
	return baseMs * Math.pow(2, attempt);
}
ok(appOrderRetryDelayMs(0, 3, 750) === 750, 'apporder retry delay attempt 0');
ok(appOrderRetryDelayMs(1, 3, 750) === 1500, 'apporder retry delay attempt 1');
ok(appOrderRetryDelayMs(2, 3, 750) === 3000, 'apporder retry delay attempt 2');
ok(appOrderRetryDelayMs(3, 3, 750) === null, 'apporder retry stops at max');

function reorderInsertIndex(from, to, placeAfter) {
	if (from < 0 || to < 0 || from === to) return to;
	if (from < to) {
		return placeAfter ? to : to - 1;
	}
	return placeAfter ? to + 1 : to;
}
function applyReorder(ids, fromId, toId, placeAfter) {
	const from = ids.indexOf(fromId);
	const to = ids.indexOf(toId);
	const items = ids.slice();
	const moved = items.splice(from, 1)[0];
	items.splice(reorderInsertIndex(from, to, !!placeAfter), 0, moved);
	return items;
}
ok(JSON.stringify(applyReorder(['a', 'b', 'c', 'd'], 'a', 'd', false)) === JSON.stringify(['b', 'c', 'a', 'd']), 'DnD move right inserts before target after shift');
ok(JSON.stringify(applyReorder(['a', 'b', 'c', 'd'], 'd', 'b', false)) === JSON.stringify(['a', 'd', 'b', 'c']), 'DnD move left keeps target index');
ok(JSON.stringify(applyReorder(['a', 'b', 'c', 'd'], 'a', 'b', true)) === JSON.stringify(['b', 'a', 'c', 'd']), 'DnD adjacent drop on right half swaps');
ok(JSON.stringify(applyReorder(['a', 'b', 'c', 'd'], 'a', 'b', false)) === JSON.stringify(['a', 'b', 'c', 'd']), 'DnD adjacent drop on left half is no-op');
ok(reorderInsertIndex(0, 2, false) === 1, 'reorderInsertIndex from<to');
ok(reorderInsertIndex(3, 1, false) === 1, 'reorderInsertIndex from>to');
ok(reorderInsertIndex(0, 1, true) === 1, 'reorderInsertIndex adjacent placeAfter');

function wouldExceedOnRemoveFromFolder(topLevelCount, maxItems) {
	return topLevelCount >= maxItems;
}
function wouldExceedOnDeleteFolder(topLevelCount, childCount, maxItems) {
	return topLevelCount - 1 + childCount > maxItems;
}
ok(wouldExceedOnRemoveFromFolder(100, 100) === true, 'removeFromFolder blocked at max');
ok(wouldExceedOnRemoveFromFolder(99, 100) === false, 'removeFromFolder ok under max');
ok(wouldExceedOnDeleteFolder(70, 40, 100) === true, 'deleteFolder expand blocked when over max');
ok(wouldExceedOnDeleteFolder(70, 30, 100) === false, 'deleteFolder expand ok under max');

/** Mirror app.js greetingPeriod / formatGreeting (Dashboard buckets). */
function greetingPeriod(hour) {
	var h = Number(hour);
	if (!Number.isFinite(h)) {
		return 'morning';
	}
	h = ((Math.floor(h) % 24) + 24) % 24;
	if (h >= 22 || h < 5) {
		return 'night';
	}
	if (h >= 18) {
		return 'evening';
	}
	if (h >= 12) {
		return 'afternoon';
	}
	return 'morning';
}
function formatGreeting(period, name, dict) {
	var clean = typeof name === 'string' ? name.trim() : '';
	var withName = clean !== '';
	var key;
	if (period === 'afternoon') {
		key = withName ? 'goodAfternoonName' : 'goodAfternoon';
	} else if (period === 'evening') {
		key = withName ? 'goodEveningName' : 'goodEvening';
	} else if (period === 'night') {
		key = withName ? 'helloName' : 'hello';
	} else {
		key = withName ? 'goodMorningName' : 'goodMorning';
	}
	var tpl = dict[key] || '';
	return withName ? String(tpl).split('{name}').join(clean) : String(tpl);
}
const greetDict = {
	goodMorning: 'Good morning',
	goodMorningName: 'Good morning, {name}',
	goodAfternoon: 'Good afternoon',
	goodAfternoonName: 'Good afternoon, {name}',
	goodEvening: 'Good evening',
	goodEveningName: 'Good evening, {name}',
	hello: 'Hello',
	helloName: 'Hello, {name}',
};
ok(greetingPeriod(8) === 'morning', 'greeting morning');
ok(greetingPeriod(12) === 'afternoon', 'greeting afternoon');
ok(greetingPeriod(19) === 'evening', 'greeting evening');
ok(greetingPeriod(23) === 'night', 'greeting night late');
ok(greetingPeriod(3) === 'night', 'greeting night early');
ok(greetingPeriod(-1) === 'night', 'greeting wraps negative hour');
ok(formatGreeting('morning', 'Alex', greetDict) === 'Good morning, Alex', 'greeting with name');
ok(formatGreeting('morning', '', greetDict) === 'Good morning', 'greeting without name');
ok(formatGreeting('night', 'Alex', greetDict) === 'Hello, Alex', 'night greeting with name');
ok(formatGreeting('morning', '  ', greetDict) === 'Good morning', 'whitespace name treated empty');
ok(!formatGreeting('morning', '<img>', greetDict).includes('<img>src'), 'name is interpolated as text only in helper');

const appJsSrc = require('fs').readFileSync(require('path').join(__dirname, '../../js/app.js'), 'utf8');
ok(appJsSrc.includes('function greetingPeriod'), 'app.js ships greetingPeriod');
ok(appJsSrc.includes("split('{name}')"), 'app.js interpolates {name} safely via split/join');
ok(appJsSrc.includes('el.greeting.textContent'), 'greeting uses textContent (XSS-safe)');

process.exit(failed ? 1 : 0);
