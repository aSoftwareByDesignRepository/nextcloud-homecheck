<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mutation-style checks for critical HomeCheck pure logic.
 * Prefer this over infection/infection (Nextcloud bootstrap conflicts).
 */

$root = dirname(__DIR__, 2);
require_once $root . '/vendor/autoload.php';

use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\AppOrderFlattener;
use OCA\HomeCheck\Service\LayoutMerger;
use OCA\HomeCheck\Service\LayoutValidator;

$failures = 0;

function assertTrue(bool $cond, string $msg): void
{
	global $failures;
	if (!$cond) {
		fwrite(STDERR, "FAIL: $msg\n");
		$failures++;
	} else {
		fwrite(STDOUT, "OK: $msg\n");
	}
}

$v = new LayoutValidator();
$m = new LayoutMerger();
$f = new AppOrderFlattener();

// Mutant: allow nested folders
try {
	$v->validate([
		'version' => 1,
		'revision' => 0,
		'items' => [
			['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'A', 'children' => ['fld_12345678']],
		],
	]);
	assertTrue(false, 'nested folder must throw');
} catch (DomainException $e) {
	assertTrue($e->errorCode === 'folder_children' || $e->errorCode === 'layout_limit', 'nested folder rejected');
}

// Mutant: drop empty folders
$merged = $m->merge([
	'version' => 1,
	'revision' => 1,
	'items' => [
		['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Empty', 'children' => ['gone']],
	],
], [['id' => 'files', 'order' => 1]]);
assertTrue($merged['items'][0]['type'] === 'folder', 'empty folder kept');
assertTrue($merged['items'][0]['children'] === [], 'ghost child dropped');
assertTrue($merged['items'][1]['id'] === 'files', 'live app appended');

// Mutant: wrong flatten order (folder after instead of in-place)
$flat = $f->flatten([
	'items' => [
		['type' => 'app', 'id' => 'a'],
		['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'F', 'children' => ['b', 'c']],
		['type' => 'app', 'id' => 'd'],
	],
], [
	'a' => ['id' => 'a', 'app' => 'a'],
	'b' => ['id' => 'b', 'app' => 'b'],
	'c' => ['id' => 'c', 'app' => 'c'],
	'd' => ['id' => 'd', 'app' => 'd'],
]);
assertTrue($flat['a']['order'] === 1, 'flatten a=1');
assertTrue($flat['b']['order'] === 2, 'flatten b=2 in-place');
assertTrue($flat['c']['order'] === 3, 'flatten c=3');
assertTrue($flat['d']['order'] === 4, 'flatten d=4');
assertTrue(!isset($flat['fld_abcdefgh']), 'folder id never in apporder');

// Mutant: XSS-ish name accepted
try {
	$v->validateFolderName('ok<script>');
	assertTrue(false, 'html name must throw');
} catch (DomainException $e) {
	assertTrue($e->errorCode === 'folder_name', 'html name rejected');
}

// Mutant: duplicate across home+folder allowed
try {
	$v->validate([
		'version' => 1,
		'revision' => 0,
		'items' => [
			['type' => 'app', 'id' => 'files'],
			['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'X', 'children' => ['files']],
		],
	]);
	assertTrue(false, 'duplicate must throw');
} catch (DomainException $e) {
	assertTrue($e->errorCode === 'duplicate_entry', 'duplicate rejected');
}

// Mutant: off-by-one max name
assertTrue($v->validateFolderName(str_repeat('x', 40)) === str_repeat('x', 40), 'name len 40 ok');
try {
	$v->validateFolderName(str_repeat('x', 41));
	assertTrue(false, 'name 41 must throw');
} catch (DomainException $e) {
	assertTrue($e->errorCode === 'folder_name', 'name 41 rejected');
}

// Mutant: sort missing by name instead of order
$merged2 = $m->merge([
	'version' => 1,
	'revision' => 0,
	'items' => [['type' => 'app', 'id' => 'z']],
], [
	['id' => 'z', 'order' => 9],
	['id' => 'm', 'order' => 1],
	['id' => 'a', 'order' => 2],
]);
$ids = array_column($merged2['items'], 'id');
assertTrue($ids === ['z', 'm', 'a'], 'append order uses live order not alpha');

// Mutant: invalid folder id invents random id instead of dropping
$mergedBad = $m->merge([
	'version' => 1,
	'revision' => 1,
	'items' => [
		['type' => 'folder', 'id' => '', 'name' => 'X', 'children' => ['files']],
	],
], [['id' => 'files', 'order' => 1]]);
assertTrue($mergedBad['items'][0]['type'] === 'app', 'invalid folder id drops folder');
assertTrue($mergedBad['items'][0]['id'] === 'files', 'child requeued as app');

// Mutant: javascript href accepted
$guard = new \OCA\HomeCheck\Service\NavigationHrefGuard();
assertTrue($guard->isSafe('/apps/files') === true, 'relative href ok');
assertTrue($guard->isSafe('javascript:alert(1)') === false, 'javascript href blocked');
assertTrue($guard->isSafe('//evil') === false, 'protocol-relative blocked');
assertTrue($guard->isSafe('https://evil.example/x') === false, 'foreign absolute blocked without origin');

// Mutant: href guard must compare full origin (scheme+host+port), not host alone
$hrefSrc = file_get_contents($root . '/lib/Service/NavigationHrefGuard.php');
assertTrue(is_string($hrefSrc) && str_contains($hrefSrc, 'originFromParts'), 'NavigationHrefGuard uses originFromParts');
assertTrue(is_string($hrefSrc) && str_contains($hrefSrc, 'strcasecmp($hrefOrigin, $allowedOrigin)'), 'NavigationHrefGuard compares full origins');
$jsSrc2 = file_get_contents($root . '/js/app.js');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'reorderInsertIndex'), 'client DnD uses reorderInsertIndex');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'placeAfter'), 'DnD supports before/after drop half');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'reorderItemsById'), 'client DnD shared reorder helper');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'attachPointerDnD'), 'pointer DnD attached for touch/mouse');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, "setAttribute('aria-disabled', 'true')"), 'edit mode uses aria-disabled not disabled');
assertTrue(is_string($jsSrc2) && !preg_match('/launch\.disabled\s*=\s*true/', $jsSrc2), 'launch.disabled=true must not block drag');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'moveItem(item.id, -1)'), 'top-level move left menu');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'moveItem(item.id, 1)'), 'top-level move right menu');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'placeAfter ? to : to - 1'), 'DnD compensates splice index shift');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'nextLen > MAX_ITEMS'), 'deleteFolder checks expand against MAX_ITEMS');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'length >= MAX_ITEMS'), 'removeFromFolder checks MAX_ITEMS');
$mergerSrc = file_get_contents($root . '/lib/Service/LayoutMerger.php');
assertTrue(is_string($mergerSrc) && str_contains($mergerSrc, 'count($out) >= $maxItems'), 'LayoutMerger caps at maxItems');

// Mutant: defaultapp clobber
$parts = ['files', 'dashboard'];
$parts = array_values(array_filter($parts, static fn (string $p): bool => $p !== 'homecheck'));
array_unshift($parts, 'homecheck');
assertTrue(implode(',', $parts) === 'homecheck,files,dashboard', 'defaultapp merges CSV');
$parts = array_values(array_filter($parts, static fn (string $p): bool => $p !== 'homecheck'));
assertTrue(implode(',', $parts) === 'files,dashboard', 'defaultapp disable preserves others');

// Mutant: layout write without row lock (Zeus MF — CAS)
$guardSrc = file_get_contents($root . '/lib/Service/LayoutWriteGuard.php');
assertTrue(is_string($guardSrc) && str_contains($guardSrc, 'FOR UPDATE'), 'LayoutWriteGuard uses FOR UPDATE');
assertTrue(is_string($guardSrc) && str_contains($guardSrc, 'compareAndSwap'), 'LayoutWriteGuard exposes compareAndSwap');
$svcSrc = file_get_contents($root . '/lib/Service/LayoutService.php');
assertTrue(is_string($svcSrc) && str_contains($svcSrc, 'writeGuard->compareAndSwap'), 'LayoutService writes via CAS guard');
assertTrue(is_string($svcSrc) && str_contains($svcSrc, 'getForUserAfterLostRace') && str_contains($svcSrc, 'syncAppOrder($uid, $layout, $entries)'), 'lost CAS race resyncs apporder');
assertTrue(is_string($svcSrc) && str_contains($svcSrc, 'function summarizeForUser'), 'LayoutService exposes read-only summarizeForUser');
if (!preg_match('/public function summarizeForUser\(string \$uid\): array\s*\{(.*?)\n\tpublic function /s', $svcSrc, $sumBody)) {
	assertTrue(false, 'summarizeForUser body extractable');
} else {
	assertTrue(str_contains($sumBody[1], 'return ['), 'summarizeForUser has return payload');
	assertTrue(!str_contains($sumBody[1], 'compareAndSwap'), 'summarizeForUser must not CAS-write');
	assertTrue(!str_contains($sumBody[1], 'syncAppOrder'), 'summarizeForUser must not sync apporder');
}
$desklet = file_get_contents($root . '/lib/Dashboard/LauncherWidget.php');
assertTrue(is_string($desklet) && str_contains($desklet, 'summarizeForUser'), 'desklet uses summarizeForUser');
assertTrue(is_string($desklet) && !preg_match('/(?<![\w>:-])getForUser\s*\(/', $desklet), 'desklet never calls getForUser');
assertTrue(is_string($desklet) && str_contains($desklet, 'registerDeskletStylesForWidget'), 'desklet registers CSS');
$appInfo = file_get_contents($root . '/lib/AppInfo/Application.php');
assertTrue(is_string($appInfo) && str_contains($appInfo, 'registerDashboardWidget(LauncherWidget::class)'), 'desklet registered');
assertTrue(file_exists($root . '/css/desklet-nextcloud.css'), 'desklet CSS file exists');
assertTrue(file_exists($root . '/img/app-dashboard.svg'), 'dashboard icon exists');
$jsSrc = file_get_contents($root . '/js/app.js');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'localEpoch'), 'client tracks localEpoch against in-flight clobber');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'epochAtStart !== localEpoch'), 'client adopts revision when dirty during save');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'scheduleAppOrderRetry'), 'client retries apporder after 502');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'APPORDER_RETRY_MAX'), 'client caps apporder retry attempts');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'sync-apporder'), 'client knows sync-apporder URL');
$routes = file_get_contents($root . '/appinfo/routes.php');
assertTrue(is_string($routes) && str_contains($routes, 'api#syncAppOrder'), 'route registers syncAppOrder');
$css = file_get_contents($root . '/css/app.css');
assertTrue(is_string($css) && str_contains($css, 'justify-content: start'), 'dense grid packs start');
assertTrue(is_string($css) && str_contains($css, 'minmax(5.5rem, 6.25rem)'), 'dense grid fixed tracks');
assertTrue(is_string($css) && !preg_match('/\.hmk-grid\s*\{[^}]*\b1fr\b/s', $css), 'grid must not 1fr-stretch tiles');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'confirmAction'), 'delete uses accessible confirm dialog');
assertTrue(is_string($jsSrc2) && !str_contains($jsSrc2, 'window.confirm'), 'no native confirm dialogs');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'addAppToFolderFlow'), 'smart add-to-folder flow');
assertTrue(is_string($jsSrc2) && str_contains($jsSrc2, 'defaultFolderName'), 'instant folder default name');
assertTrue(is_string($css) && str_contains($css, 'hmk-edit-hint'), 'edit mode hint line');
assertTrue(is_string($css) && str_contains($css, 'hmk-status.is-success'), 'success status styling');
assertTrue(is_string($css) && str_contains($css, '--hmk-space-7'), 'spacing token space-7 defined');
assertTrue(is_string($css) && str_contains($css, '#app-content .hmk-app'), 'CSS scoped to app-content');
assertTrue(is_string($css) && str_contains($css, 'dialog.hmk-dialog:not([open])'), 'dialog display override');
assertTrue(is_string($css) && str_contains($css, 'forced-colors: active'), 'forced-colors rules');
assertTrue(is_string($css) && str_contains($css, '--color-element-error'), 'danger fill uses element-error');
$mainTpl = file_get_contents($root . '/templates/main.php');
assertTrue(is_string($css) && str_contains($css, 'hmk-shell--wide'), 'wide shell modifier');
assertTrue(is_string($css) && str_contains($css, 'hmk-toolbar'), 'compact NC toolbar');
assertTrue(is_string($css) && str_contains($css, 'color-background-hover'), 'native tile hover');
assertTrue(is_string($css) && str_contains($css, '--primary-invert-if-dark'), 'app icon invert for theme visibility');
assertTrue(is_string($css) && str_contains($css, '--hmk-icon-well'), 'icon well size token');
assertTrue(is_string($css) && str_contains($css, 'background: var(--color-primary-element)'), 'icon well primary fill');
assertTrue(is_string($css) && !preg_match('/\.hmk-app\s*\{[^}]*max-width:\s*72rem/s', $css), 'no 72rem page cap');
$shellInit = file_get_contents($root . '/js/shell-init.js');
assertTrue(is_string($shellInit) && str_contains($shellInit, "classList.add('hmk-app')"), 'shell init script');
assertTrue(is_string($shellInit) && str_contains($shellInit, 'DOMContentLoaded'), 'shell init waits for DOM');
assertTrue(is_string($shellInit) && str_contains($shellInit, 'app-homecheck'), 'shell init targets NC34 content root');
assertTrue(is_string($jsSrc) && str_contains($jsSrc, 'app-homecheck'), 'app.js targets NC34 content root');
assertTrue(is_string($mainTpl) && str_contains($mainTpl, 'hmk-shell hmk-shell--wide'), 'template wide shell');
assertTrue(is_string($mainTpl) && str_contains($mainTpl, 'button-vue primary'), 'main uses NC primary buttons');
assertTrue(is_string($css) && str_contains($css, 'body.theme--dark') && str_contains($css, '--hmk-primary-fill'), 'dark theme primary fill token');
$enL10n = json_decode((string) file_get_contents($root . '/l10n/en.json'), true, 512, JSON_THROW_ON_ERROR);
$enKeys = array_keys($enL10n['translations'] ?? []);
assertTrue(in_array('Drag cards to reorder. Tap Done when finished.', $enKeys, true), 'edit banner msgid in catalog');
assertTrue(!in_array('Edit mode — use the menu or drag cards. Opening apps is paused.', $enKeys, true), 'stale edit msgid removed');
assertTrue(count($enKeys) === 62, 'l10n catalog has 62 keys');

exit($failures > 0 ? 1 : 0);
