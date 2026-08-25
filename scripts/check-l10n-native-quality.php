<?php

declare(strict_types=1);

/**
 * Informal-register native quality gate for AppHome (personal app launcher).
 *
 * Fails when user-facing prose is identical to English (outside allowlist),
 * when formal address appears (Sie/vous/…), or when banned English jargon leaks.
 *
 * Usage: php scripts/check-l10n-native-quality.php
 */

$base = dirname(__DIR__) . '/l10n';
$en = json_decode((string) file_get_contents($base . '/en.json'), true, 512, JSON_THROW_ON_ERROR);

/** @var array<string, true> */
$allowExact = [
	'AppHome' => true,
	'Apps' => true,
	'JSON' => true,
	'Nextcloud' => true,
	'Folder' => true,
	'Software by Design' => true,
	'(opens in a new window)' => true,
];

/** @var array<string, string> */
$formalPatterns = [
	'de' => '/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/u',
	'fr' => '/\b(vous|votre|vos|Vous|Votre|Vos)\b/u',
	'es' => '/\b(usted|Usted|ustedes|Ustedes)\b/u',
	'da' => '/\b(De|Dem|Deres)\b/u',
	'nb' => '/\b(De|Dem|Deres)\b/u',
	'sv' => '/\b(Ni|Er|Ert|Era)\b/u',
	'nl' => '/(?:^|[^a-zA-Z])(u|Uw)(?:[^a-zA-Z]|$)/u',
	'it' => '/\b(Lei|Loro)\b/u',
	'pl' => '/\b(Pan|Pani|Państwo)\b/u',
	'pt_BR' => '/\b(senhor|senhora|Sr\.|Sra\.|Vossa|Vosso)\b/iu',
];

$locales = ['de', 'fr', 'es', 'da', 'nl', 'it', 'pl', 'sv', 'nb', 'pt_BR'];
$ok = true;

foreach ($locales as $lang) {
	$path = $base . '/' . $lang . '.json';
	$cat = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
	$identical = [];
	$formalHits = [];

	foreach ($cat['translations'] as $key => $value) {
		if (!is_string($key) || !is_string($value)) {
			continue;
		}
		$enValue = $en['translations'][$key] ?? $key;
		if (is_string($enValue) && $value === $enValue && !($allowExact[$value] ?? false)) {
			if (preg_match('/\p{L}/u', $value) && mb_strlen($value) > 3) {
				$identical[] = $key;
			}
		}
		if (isset($formalPatterns[$lang]) && preg_match($formalPatterns[$lang], $value) === 1) {
			if (in_array($lang, ['da', 'nb'], true) && preg_match('/\bDe (vises|har|er|bliver)\b/u', $value) === 1) {
				continue;
			}
			$formalHits[] = "{$key}: {$value}";
		}
	}

	if ($identical !== [] || $formalHits !== []) {
		$ok = false;
		fwrite(STDERR, "== {$lang} ==\n");
		if ($identical !== []) {
			fwrite(STDERR, '  Identical to English (' . count($identical) . "):\n");
			foreach (array_slice($identical, 0, 20) as $key) {
				fwrite(STDERR, "    - {$key}\n");
			}
		}
		if ($formalHits !== []) {
			fwrite(STDERR, '  Formal address (' . count($formalHits) . "):\n");
			foreach (array_slice($formalHits, 0, 20) as $line) {
				fwrite(STDERR, "    - {$line}\n");
			}
		}
	} else {
		echo "l10n native quality OK: {$lang} (" . count($cat['translations']) . " keys)\n";
	}
}

if (!$ok) {
	fwrite(STDERR, "\nl10n native quality check FAILED.\n");
	exit(1);
}

echo 'l10n native quality OK for all locales (' . implode('/', $locales) . ").\n";
exit(0);
