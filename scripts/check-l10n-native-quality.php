<?php

declare(strict_types=1);

/**
 * Register native quality gate for HomeCheck.
 *
 * Fails when user-facing prose is identical to English (outside allowlist)
 * or when the wrong address register appears: German ships Sie-form
 * (Atlas farm policy, matching the other Check apps); the remaining
 * locales keep their informal register (tu/du/…).
 *
 * Usage: php scripts/check-l10n-native-quality.php
 */

$base = dirname(__DIR__) . '/l10n';
$en = json_decode((string) file_get_contents($base . '/en.json'), true, 512, JSON_THROW_ON_ERROR);

/** @var array<string, true> */
$allowExact = [
	'HomeCheck' => true,
	'Apps' => true,
	'JSON' => true,
	'Nextcloud' => true,
	'Folder' => true,
	'Software by Design' => true,
	'(opens in a new window)' => true,
];

/**
 * German informal register detection: du-family pronouns, bare du-imperative
 * stems (both cases — 'nutze'/'Nutze'), and unambiguous 2nd-person -st forms
 * (nutzt, gibst, wirst …). -st forms that collide with 3rd person (lässt,
 * liest, isst, passt, vergisst) are intentionally excluded. Imperative stems
 * are guarded by an ich-lookbehind so 1st-person 'ich erstelle' does not trip.
 */
$deImperativeStems = '(?:nutze|Nutze|füge|Füge|tippe|Tippe|ziehe|Ziehe|wähle|Wähle|öffne|Öffne|klicke|Klicke|drücke|Drücke|speichere|Speichere|lösche|Lösche|entferne|Entferne|versuche|Versuche|aktiviere|Aktiviere|deaktiviere|Deaktiviere|markiere|Markiere|benenne|Benenne|verschiebe|Verschiebe|prüfe|Prüfe|erstelle|Erstelle|wiederhole|Wiederhole|bestätige|Bestätige|beende|Beende|ändere|Ändere|verwende|Verwende|beachte|Beachte|befolge|Befolge|installiere|Installiere|scanne|Scanne|buche|Buche|aktualisiere|Aktualisiere|kopiere|Kopiere|sende|Sende|warte|Warte|schaue|Schaue|zeige|Zeige|suche|nimm|Nimm|sieh|Sieh|schreib|Schreib|trag|Trag|halt|Halt|mach|Mach|sag|Sag|zeig|Zeig|such|Such|lad|Lad|schau|Schau|geh|Geh|gib|Gib|setz|Setz|leg|Leg|stell|Stell|find|Find|schließ|Schließ|bleib|Bleib|komm|Komm|hol|Hol|bring|Bring|trink|Trink|ruf|Ruf|blende|Blende|vergiss|Vergiss|antworte|Antworte)';
$deSecondPersonSt = '(?:nutzt|klickst|tippst|ziehst|wählst|öffnest|drückst|speicherst|löschst|entfernst|versuchst|aktivierst|deaktivierst|markierst|benennst|verschiebst|startest|prüfst|erstellst|nimmst|siehst|schreibst|trägst|hältst|machst|sagst|zeigst|suchst|lädst|schaust|wartest|wiederholst|bestätigst|beendest|änderst|verwendest|beachtest|befolgst|installierst|gehst|gibst|legst|stellst|findest|bleibst|kommst|holst|bringst|trinkst|buchst|fährst|schläfst|wirst)';

/** @var array<string, string> Informal address banned in German (Sie-form required). */
$informalPatterns = [
	'de' => '/\b(du|dich|dir|euch|dein\w*|euer\w*|Du|Dich|Dir|Euch|Dein\w*|Euer\w*)\b'
		. '|(?<!\bich )(?<!\bIch )\b' . $deImperativeStems . '\b'
		. '|\b' . $deSecondPersonSt . '\b/u',
];

/** @var array<string, string> Formal address banned in informal-register locales. */
$formalPatterns = [
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
	$registerHits = [];

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
		if (isset($informalPatterns[$lang]) && preg_match($informalPatterns[$lang], $value) === 1) {
			$registerHits[] = "informal: {$key}: {$value}";
		}
		if (isset($formalPatterns[$lang]) && preg_match($formalPatterns[$lang], $value) === 1) {
			if (in_array($lang, ['da', 'nb'], true) && preg_match('/\bDe (vises|har|er|bliver)\b/u', $value) === 1) {
				continue;
			}
			$registerHits[] = "formal: {$key}: {$value}";
		}
	}

	if ($identical !== [] || $registerHits !== []) {
		$ok = false;
		fwrite(STDERR, "== {$lang} ==\n");
		if ($identical !== []) {
			fwrite(STDERR, '  Identical to English (' . count($identical) . "):\n");
			foreach (array_slice($identical, 0, 20) as $key) {
				fwrite(STDERR, "    - {$key}\n");
			}
		}
		if ($registerHits !== []) {
			fwrite(STDERR, '  Wrong register (' . count($registerHits) . "):\n");
			foreach (array_slice($registerHits, 0, 20) as $line) {
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
