<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** @var array|null $template */
$json = json_encode($template, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

$adminI18n = [
	'saving' => $l->t('Saving…'),
	'saved' => $l->t('Saved'),
	'saveFailed' => $l->t('Save failed'),
	'invalidJson' => $l->t('Invalid JSON'),
];
$adminI18nJson = json_encode($adminI18n, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
?>
<script id="hmk-admin-i18n" type="application/json"><?php echo $adminI18nJson; ?></script>
<div id="hmk-admin" class="hmk-admin section" data-hmk-template="<?php p($json === false ? 'null' : $json); ?>">
	<h2><?php p($l->t('HomeCheck')); ?></h2>
	<p class="settings-hint">
		<?php p($l->t('Optional seed layout for users who have never opened HomeCheck. Applied once; users can change everything afterwards. Folders never appear in the top bar.')); ?>
	</p>
	<label class="hmk-label" for="hmk-admin-json"><?php p($l->t('Seed template JSON')); ?></label>
	<textarea id="hmk-admin-json" class="hmk-textarea" rows="12" spellcheck="false" aria-describedby="hmk-admin-hint"></textarea>
	<p id="hmk-admin-hint" class="hmk-muted">
		<?php p($l->t('Example: {"version":1,"revision":0,"items":[{"type":"folder","id":"fld_abcdefgh","name":"Work","children":["files","calendar"]}]}')); ?>
	</p>
	<p class="hmk-error" id="hmk-admin-error" role="alert"></p>
	<p class="hmk-status" id="hmk-admin-status" role="status" aria-live="polite"></p>
	<div class="hmk-admin__actions">
		<button type="button" class="button-vue hmk-btn hmk-btn--primary" id="hmk-admin-save"><?php p($l->t('Save seed template')); ?></button>
		<button type="button" class="button-vue hmk-btn hmk-btn--ghost" id="hmk-admin-clear"><?php p($l->t('Clear seed')); ?></button>
	</div>
	<footer class="hmk-credit hmk-credit--admin" role="contentinfo">
		<p class="hmk-credit__text">
			<a
				class="hmk-credit__link"
				href="https://nextcloud.software-by-design.de/"
				target="_blank"
				rel="noopener noreferrer"
			><?php p($l->t('More Nextcloud apps from Software by Design')); ?><span class="hidden-visually"> <?php p($l->t('(opens in a new window)')); ?></span></a>
		</p>
	</footer>
</div>
