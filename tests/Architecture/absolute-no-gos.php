<?php

declare(strict_types=1);

/**
 * Absolute No-Go architecture contracts for AppHome (Zeus NG-01..NG-04 + icon filter).
 *
 * Usage: php tests/Architecture/absolute-no-gos.php
 */

$root = dirname(__DIR__, 2);
$fail = 0;

function fail(string $msg): void
{
	global $fail;
	echo "FAIL: {$msg}\n";
	$fail++;
}

function ok(string $msg): void
{
	echo "OK: {$msg}\n";
}

$api = (string) file_get_contents($root . '/lib/Controller/ApiController.php');
$page = (string) file_get_contents($root . '/lib/Controller/PageController.php');
$guard = (string) file_get_contents($root . '/lib/Service/NavigationHrefGuard.php');
$write = (string) file_get_contents($root . '/lib/Service/LayoutWriteGuard.php');
$svc = (string) file_get_contents($root . '/lib/Service/LayoutService.php');
$uninstall = (string) file_get_contents($root . '/lib/Repair/UninstallCleanup.php');
$css = (string) file_get_contents($root . '/css/app.css');
$js = (string) file_get_contents($root . '/js/app.js');

/* NG-01: UID only from session */
if (!str_contains($api, 'userSession->getUser()') || str_contains($api, 'getParam(\'userId\')') || str_contains($api, 'getParam("userId")')) {
	fail('NG-01: ApiController must use session UID only');
} else {
	ok('NG-01: session UID only');
}

/* NG-02: javascript: / foreign absolute blocked */
if (!str_contains($guard, 'javascript') && !str_contains($guard, "str_starts_with(\$href, '//')")) {
	fail('NG-02: NavigationHrefGuard missing protocol-relative / scheme checks');
} else {
	ok('NG-02: href allowlist present');
}
if (!str_contains($js, 'function isSafeHref') || !str_contains($js, 'https?:') || !str_contains($js, "indexOf('//')")) {
	fail('NG-02: client isSafeHref missing (relative + http(s) allowlist)');
} else {
	ok('NG-02: client isSafeHref present');
}
if (!str_contains($js, 'isSafeHref(entry.icon)') || preg_match('/entry\.icon\.indexOf\([\'"]javascript:/', $js) === 1) {
	fail('NG-02: icon src must use isSafeHref (not javascript: prefix-only)');
} else {
	ok('NG-02: icon src uses isSafeHref');
}

/* NG-03: no NoCSRFRequired on API mutators */
if (preg_match('/NoCSRFRequired/', $api) === 1) {
	fail('NG-03: ApiController must not disable CSRF');
} else {
	ok('NG-03: ApiController CSRF default on');
}
if (preg_match('/#\[NoCSRFRequired\]\s*\n\s*public function index/', $page) !== 1) {
	fail('NG-03: PageController GET should be NoCSRFRequired only on index');
} else {
	ok('NG-03: Page GET exempt only');
}

/* NG-04: uninstall strips defaultapp */
if (!str_contains($uninstall, 'stripFromDefaultApp') || !str_contains($uninstall, 'defaultapp')) {
	fail('NG-04: UninstallCleanup must strip defaultapp');
} else {
	ok('NG-04: uninstall strips defaultapp');
}

/* CAS required for layout writes */
if (!str_contains($write, 'FOR UPDATE') || !str_contains($svc, 'compareAndSwap')) {
	fail('CAS: layout writes must use FOR UPDATE + compareAndSwap');
} else {
	ok('CAS: LayoutWriteGuard + LayoutService');
}

/* Desklet must not persist */
if (preg_match('/function summarizeForUser\(.*?\{(.*?)\n\t\}/s', $svc, $m) === 1) {
	if (str_contains($m[1], 'compareAndSwap') || str_contains($m[1], 'syncAppOrder')) {
		fail('Desklet summarizeForUser must not write layout/apporder');
	} else {
		ok('Desklet summarizeForUser is read-only');
	}
} else {
	fail('Could not locate summarizeForUser body');
}

$desklet = (string) file_get_contents($root . '/lib/Dashboard/LauncherWidget.php');
if (!str_contains($desklet, 'getUID() !== $userId') || !str_contains($desklet, 'summarizeForUser')) {
	fail('NG-06: LauncherWidget getItemsV2 must bind session UID before summarize');
} else {
	ok('NG-06: desklet getItemsV2 binds session UID');
}

/* Icon filter must not use NC sentinel */
if (preg_match('/filter:\s*var\(--primary-invert-if-/', $css) === 1) {
	fail('Icons must not use NC invert sentinel in filter');
} else {
	ok('Icons avoid NC invert sentinel');
}
if (preg_match('/filter:\s*brightness\(0\)\s*;/', $css) !== 1) {
	fail('Icons must use brightness(0) black silhouette on light well');
} else {
	ok('Icons use brightness(0) on light well');
}

exit($fail > 0 ? 1 : 0);
