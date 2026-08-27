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
	'Edit mode — use the menu or drag cards. Opening apps is paused.' => 'Drag panes to rearrange. Tap Done when finished.',
	'Drag cards to reorder. Tap Done when finished.' => 'Drag panes to rearrange. Tap Done when finished.',
	'Tap a card to open an app.' => 'Tap a pane to open an app.',
	'Delete this folder? Apps inside return to the home grid.' => 'Delete this folder? Apps inside return to the home screen.',
	'This folder is empty — add apps from the home grid.' => 'This folder is empty — add apps from Edit.',
	'Too many items on the home grid (max 100)' => 'Too many items on the home screen (max 100)',
	'AppHome' => 'HomeCheck',
	'Make AppHome your start page after login?' => 'Make HomeCheck your start page after login?',
	'AppHome is your start page' => 'HomeCheck is your start page',
	'Optional seed layout for users who have never opened AppHome. Applied once; users can change everything afterwards. Folders never appear in the top bar.' => 'Optional seed layout for users who have never opened HomeCheck. Applied once; users can change everything afterwards. Folders never appear in the top bar.',
	'AppHome opens after you sign in' => 'HomeCheck opens after you sign in',
	'Not set — open AppHome to choose' => 'Not set — open HomeCheck to choose',
	'Could not load AppHome status.' => 'Could not load HomeCheck status.',
	'AppHome is no longer your start page' => 'HomeCheck is no longer your start page',
	'Open AppHome after you sign in' => 'Open HomeCheck after you sign in',
	'Stop opening AppHome after you sign in' => 'Stop opening HomeCheck after you sign in',
	'Hidden from AppHome' => 'Hidden from HomeCheck',
	'Folder hidden from AppHome' => 'Folder hidden from HomeCheck',
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
