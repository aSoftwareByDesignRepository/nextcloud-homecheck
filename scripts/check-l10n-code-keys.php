<?php

declare(strict_types=1);

/**
 * Ensures every $l->t('…') string in PHP templates is present in l10n/en.json.
 *
 * Usage: php scripts/check-l10n-code-keys.php
 */

$root = dirname(__DIR__);
$en = json_decode((string) file_get_contents($root . '/l10n/en.json'), true, 512, JSON_THROW_ON_ERROR);
$catalog = $en['translations'] ?? [];

$files = [
	$root . '/templates/main.php',
	$root . '/templates/admin.php',
];

$missing = [];
foreach ($files as $file) {
	$src = (string) file_get_contents($file);
	if (!preg_match_all("/\\\$l->t\\('((?:\\\\'|[^'])*)'\\)/", $src, $m)) {
		continue;
	}
	foreach ($m[1] as $raw) {
		$key = str_replace("\\'", "'", $raw);
		if (!array_key_exists($key, $catalog)) {
			$missing[] = basename($file) . ': ' . $key;
		}
	}
}

if ($missing !== []) {
	fwrite(STDERR, "Strings used in PHP but missing from l10n/en.json:\n");
	foreach ($missing as $line) {
		fwrite(STDERR, "  - {$line}\n");
	}
	exit(1);
}

echo 'l10n code keys OK (' . count($catalog) . ' catalog keys, ' . count($files) . " templates scanned).\n";
exit(0);
