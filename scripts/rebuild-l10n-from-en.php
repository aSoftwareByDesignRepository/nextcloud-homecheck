<?php

declare(strict_types=1);

/**
 * Reorder locale JSON to match en.json keys and migrate retired msgids.
 *
 * Usage: php scripts/rebuild-l10n-from-en.php
 */

$base = __DIR__ . '/../l10n';
$en = json_decode((string) file_get_contents($base . '/en.json'), true, 512, JSON_THROW_ON_ERROR);
$enKeys = array_keys($en['translations'] ?? []);

$retired = [
	'Your apps — tap to open, or Edit to rearrange and group.' => null,
	'Edit mode — use the menu or drag cards. Opening apps is paused.' => 'Drag cards to reorder. Tap Done when finished.',
];

$locales = ['de', 'fr', 'es', 'da', 'nl', 'it', 'pl', 'sv', 'nb', 'pt_BR'];

foreach ($locales as $lang) {
	$path = $base . '/' . $lang . '.json';
	$cat = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
	$tr = $cat['translations'] ?? [];

	foreach ($retired as $old => $new) {
		if ($new !== null && isset($tr[$old]) && !isset($tr[$new])) {
			$tr[$new] = $tr[$old];
		}
		unset($tr[$old]);
	}

	$ordered = [];
	foreach ($enKeys as $key) {
		if (!array_key_exists($key, $tr)) {
			fwrite(STDERR, "Missing {$lang}: {$key}\n");
			exit(1);
		}
		$ordered[$key] = $tr[$key];
	}

	$cat['translations'] = $ordered;
	file_put_contents(
		$path,
		json_encode($cat, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n"
	);
	echo "Rebuilt {$lang}.json\n";
}

echo "Done.\n";
