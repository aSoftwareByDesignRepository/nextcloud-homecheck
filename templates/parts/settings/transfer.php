<?php
/**
 * Settings sub-page: Transfer configuration (test → production).
 * Two cards — Export (passphrase → .nctransfer download) and Import
 * (mode → file → passphrase → mandatory dry-run → confirm) — plus the
 * "Last transfer" receipt line. The report dialog is a native <dialog>.
 *
 * Synced from apps/_shared/config-transfer — do not edit app-side.
 *
 * @var array $_
 * @var \OCP\IL10N $l
 */
$isSystemAdmin = !empty($_['isSystemAdmin']);
$lastReceipt = is_array($_['transferLastReceipt'] ?? null) ? $_['transferLastReceipt'] : null;
?>
<section class="hmk-card hmk-section" aria-labelledby="hmk-xfer-export-h" id="hmk-transfer-export-card">
	<header class="hmk-section__header">
		<div>
			<h2 id="hmk-xfer-export-h"><?php p($l->t('Export configuration')); ?></h2>
			<p class="hmk-section__sub"><?php p($l->t('Download all settings, catalogues and business data as one encrypted file — then import it on your production instance.')); ?></p>
		</div>
	</header>
	<div class="hmk-callout hmk-callout--info" role="note">
		<p><strong><?php p($l->t('Secrets are never included.')); ?></strong>
		<?php p($l->t('Passwords, tokens and salts stay on this instance — the file is encrypted and still does not carry them. It does contain user and group names: handle it like personal data.')); ?></p>
	</div>
	<form id="hmk-transfer-export-form" class="hmk-form" novalidate>
		<div class="hmk-form-row">
			<label for="hmk-transfer-passphrase"><?php p($l->t('Encryption passphrase')); ?></label>
			<div class="hmk-input-group">
				<input type="password" id="hmk-transfer-passphrase" name="passphrase" autocomplete="new-password" required minlength="12" aria-describedby="hmk-transfer-passphrase-hint hmk-transfer-passphrase-strength">
				<button type="button" class="hmk-btn hmk-btn--ghost" id="hmk-transfer-passphrase-toggle" aria-pressed="false"><?php p($l->t('Show')); ?></button>
				<button type="button" class="hmk-btn hmk-btn--secondary" id="hmk-transfer-passphrase-generate"><?php p($l->t('Generate')); ?></button>
			</div>
			<p class="hmk-form-row__hint" id="hmk-transfer-passphrase-hint"><?php p($l->t('At least 12 characters. Without this passphrase the file cannot be restored — store it safely.')); ?></p>
			<p class="hmk-form-row__hint hmk-transfer-strength" id="hmk-transfer-passphrase-strength" role="status" aria-live="polite"></p>
		</div>
		<div class="hmk-actions">
			<button type="submit" class="hmk-btn hmk-btn--primary" id="hmk-transfer-export-btn">
				<?php p($l->t('Download encrypted transfer file')); ?>
			</button>
		</div>
	</form>
</section>

<section class="hmk-card hmk-section" aria-labelledby="hmk-xfer-import-h" id="hmk-transfer-import-card">
	<header class="hmk-section__header">
		<div>
			<h2 id="hmk-xfer-import-h"><?php p($l->t('Import configuration')); ?></h2>
			<p class="hmk-section__sub"><?php p($l->t('Pick a transfer file, enter its passphrase, review the preview — then confirm. Nothing is written before you confirm.')); ?></p>
		</div>
	</header>
	<?php if ($lastReceipt !== null): ?>
	<p class="hmk-transfer-last" id="hmk-transfer-last">
		<?php p($l->t('Last transfer')); ?>:
		<strong><?php p((string)($lastReceipt['at'] ?? '—')); ?></strong>
		· <?php
			$transferMode = (string)($lastReceipt['mode'] ?? '');
			if ($transferMode === 'merge') {
				p($l->t('Merge'));
			} elseif ($transferMode === 'replace') {
				p($l->t('Replace'));
			} else {
				p($transferMode !== '' ? $transferMode : '—');
			}
		?>
		· <?php p(($lastReceipt['result'] ?? '') === 'applied' ? $l->t('applied') : $l->t('failed')); ?>
		<?php if (($lastReceipt['snapshotId'] ?? null) !== null): ?>
			· <?php p($l->t('undo via snapshot')); ?> <code><?php p((string)$lastReceipt['snapshotId']); ?></code>
		<?php endif; ?>
	</p>
	<?php endif; ?>
	<form id="hmk-transfer-import-form" class="hmk-form" novalidate>
		<fieldset class="hmk-form-row hmk-fieldset">
			<legend><?php p($l->t('Mode')); ?></legend>
			<label class="hmk-radio">
				<input type="radio" name="mode" value="merge" checked>
				<span><strong><?php p($l->t('Merge')); ?></strong> — <?php p($l->t('add and update; nothing is deleted')); ?></span>
			</label>
			<label class="hmk-radio hmk-radio--danger">
				<input type="radio" name="mode" value="replace" <?php if (!$isSystemAdmin): ?>disabled<?php endif; ?>>
				<span><strong><?php p($l->t('Replace')); ?></strong> — <?php p($l->t('make identical to the file; prod-only rows are deleted')); ?></span>
			</label>
			<p class="hmk-form-row__hint" id="hmk-transfer-replace-hint">
				<?php if ($isSystemAdmin): ?>
					<?php p($l->t('Replace needs maintenance mode ON (occ maintenance:mode --on) — you will type REPLACE in the preview to confirm.')); ?>
				<?php else: ?>
					<?php p($l->t('Replace is available to Nextcloud system administrators only.')); ?>
				<?php endif; ?>
			</p>
		</fieldset>
		<div class="hmk-form-row">
			<label for="hmk-transfer-file"><?php p($l->t('Transfer file')); ?></label>
			<input type="file" id="hmk-transfer-file" name="file" accept=".nctransfer,application/json" class="hmk-file-input">
		</div>
		<div class="hmk-form-row">
			<label for="hmk-transfer-import-passphrase"><?php p($l->t('File passphrase')); ?></label>
			<div class="hmk-input-group">
				<input type="password" id="hmk-transfer-import-passphrase" name="import_passphrase" autocomplete="off">
				<button type="button" class="hmk-btn hmk-btn--ghost" id="hmk-transfer-import-passphrase-toggle" aria-pressed="false"><?php p($l->t('Show')); ?></button>
			</div>
		</div>
		<div id="hmk-transfer-import-status" class="hmk-form-row__hint" role="status" aria-live="polite"></div>
	</form>
</section>

<dialog id="hmk-transfer-report" class="hmk-dialog hmk-transfer-report" aria-labelledby="hmk-transfer-report-h">
	<div class="hmk-dialog__body">
		<h3 id="hmk-transfer-report-h"><?php p($l->t('Import preview')); ?></h3>
		<p id="hmk-transfer-report-verdict" class="hmk-transfer-report__verdict"></p>
		<p id="hmk-transfer-report-file" class="hmk-form-row__hint"></p>
		<div id="hmk-transfer-report-groups"></div>
	</div>
	<footer class="hmk-dialog__footer">
		<div id="hmk-transfer-replace-confirm" class="hmk-form-row" hidden>
			<label for="hmk-transfer-replace-token"><?php p($l->t('Type REPLACE to confirm')); ?></label>
			<input type="text" id="hmk-transfer-replace-token" autocomplete="off" spellcheck="false" placeholder="REPLACE">
		</div>
		<div class="hmk-actions">
			<button type="button" class="hmk-btn hmk-btn--secondary" id="hmk-transfer-cancel" value="cancel"><?php p($l->t('Cancel')); ?></button>
			<button type="button" class="hmk-btn hmk-btn--primary" id="hmk-transfer-confirm"><?php p($l->t('Apply import')); ?></button>
		</div>
	</footer>
</dialog>

<dialog id="hmk-transfer-progress" class="hmk-dialog" aria-labelledby="hmk-transfer-progress-h" aria-live="polite">
	<div class="hmk-dialog__body">
		<h3 id="hmk-transfer-progress-h"><?php p($l->t('Applying import')); ?></h3>
		<progress id="hmk-transfer-progress-bar" max="100" value="0"></progress>
		<p id="hmk-transfer-progress-text"><?php p($l->t('Starting…')); ?></p>
		<p class="hmk-form-row__hint"><?php p($l->t('You can close this — the result is saved and shown under “Last transfer”.')); ?></p>
	</div>
</dialog>

<div id="hmk-transfer-result-live" class="hmk-visually-hidden" role="status" aria-live="polite"></div>
