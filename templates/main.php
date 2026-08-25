<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** @var array $initialState */
$stateJson = json_encode($initialState, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);

$i18n = [
	'edit' => $l->t('Edit'),
	'done' => $l->t('Done'),
	'folder' => $l->t('Folder'),
	'moveLeft' => $l->t('Move left'),
	'moveRight' => $l->t('Move right'),
	'newFolder' => $l->t('New folder'),
	'addToFolder' => $l->t('Add to folder'),
	'removeFromFolder' => $l->t('Remove from folder'),
	'hideApp' => $l->t('Hide'),
	'hiddenApps' => $l->t('Hidden apps'),
	'showApp' => $l->t('Show again'),
	'hiddenEmpty' => $l->t('No hidden apps.'),
	'appHidden' => $l->t('Hidden from AppHome'),
	'folderHidden' => $l->t('Folder hidden from AppHome'),
	'renameFolder' => $l->t('Rename folder'),
	'deleteFolder' => $l->t('Delete folder'),
	'confirmDeleteFolder' => $l->t('Delete this folder? Apps inside return to the home screen.'),
	'saving' => $l->t('Saving…'),
	'saved' => $l->t('Saved'),
	'saveFailed' => $l->t('Could not save — try again'),
	'conflict' => $l->t('Someone changed the layout — reloading'),
	'openFolder' => $l->t('Open folder'),
	'nameFolder' => $l->t('Folder name'),
	'nameInvalid' => $l->t('Name must be 1–40 characters'),
	'nameChars' => $l->t('Name has invalid characters'),
	'moreActions' => $l->t('More actions'),
	'viewSubtitle' => $l->t('Tap a pane to open an app.'),
	'editSubtitle' => $l->t('Drag panes to rearrange. Hide apps you do not need. Tap Done when finished.'),
	'editBanner' => $l->t('Editing your apps'),
	'chooseFolder' => $l->t('Choose a folder'),
	'noFoldersYet' => $l->t('No folders yet — a new one will be created.'),
	'delete' => $l->t('Delete'),
	'rename' => $l->t('Rename'),
	'syncWarn' => $l->t('Saved (top-bar sync failed — try again)'),
	'syncRetrying' => $l->t('Retrying top-bar sync…'),
	'startOk' => $l->t('AppHome is your start page'),
	'startCleared' => $l->t('AppHome is no longer your start page'),
	'startFail' => $l->t('Could not update start page'),
	'useAsHome' => $l->t('Use as home'),
	'unsetAsHome' => $l->t('Unset as home'),
	'useAsHomeHint' => $l->t('Open AppHome after you sign in'),
	'unsetAsHomeHint' => $l->t('Stop opening AppHome after you sign in'),
	'unsafeLink' => $l->t('This app link is not safe to open'),
	'emptyFolder' => $l->t('This folder is empty — add apps from Edit.'),
	'limitItems' => $l->t('Too many items on the home screen (max 100)'),
	'limitChildren' => $l->t('Too many apps in this folder (max 40)'),
	'goodMorning' => $l->t('Good morning'),
	'goodMorningName' => $l->t('Good morning, {name}'),
	'goodAfternoon' => $l->t('Good afternoon'),
	'goodAfternoonName' => $l->t('Good afternoon, {name}'),
	'goodEvening' => $l->t('Good evening'),
	'goodEveningName' => $l->t('Good evening, {name}'),
	'hello' => $l->t('Hello'),
	'helloName' => $l->t('Hello, {name}'),
];
$i18nJson = json_encode($i18n, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);

$displayName = is_string($initialState['displayName'] ?? null) ? (string)$initialState['displayName'] : '';
$hour = (int)(new \DateTimeImmutable('now'))->format('G');
if ($hour >= 22 || $hour < 5) {
	$greeting = $displayName !== ''
		? $l->t('Hello, {name}', ['name' => $displayName])
		: $l->t('Hello');
} elseif ($hour >= 18) {
	$greeting = $displayName !== ''
		? $l->t('Good evening, {name}', ['name' => $displayName])
		: $l->t('Good evening');
} elseif ($hour >= 12) {
	$greeting = $displayName !== ''
		? $l->t('Good afternoon, {name}', ['name' => $displayName])
		: $l->t('Good afternoon');
} else {
	$greeting = $displayName !== ''
		? $l->t('Good morning, {name}', ['name' => $displayName])
		: $l->t('Good morning');
}
?>
<script id="hmk-initial-state" type="application/json"><?php echo $stateJson; ?></script>
<script id="hmk-i18n" type="application/json"><?php echo $i18nJson; ?></script>
<div id="homecheck-app">
	<a class="hmk-skip" href="#hmk-main"><?php p($l->t('Skip to apps')); ?></a>

	<div id="app-content-wrapper" class="hmk-shell hmk-shell--wide hmk-shell--dashboard">
		<div class="hmk-topbar">
			<h2 class="hmk-greeting" id="hmk-greeting"><?php p($greeting); ?></h2>
			<header class="hmk-chrome" role="toolbar" aria-label="<?php p($l->t('AppHome')); ?>">
				<p class="hidden-visually" id="hmk-page-title"><?php p($l->t('AppHome')); ?></p>
				<p class="hidden-visually" id="hmk-instructions"><?php p($l->t('Tap a pane to open an app.')); ?></p>
				<div class="hmk-toolbar__actions">
					<button type="button" class="button-vue secondary hmk-touch-btn hmk-chrome__btn" id="hmk-home-toggle" aria-pressed="false">
						<?php p($l->t('Use as home')); ?>
					</button>
					<button type="button" class="button-vue secondary hmk-touch-btn hmk-chrome__btn" id="hmk-new-folder" hidden>
						<?php p($l->t('New folder')); ?>
					</button>
					<button type="button" class="button-vue secondary hmk-touch-btn hmk-chrome__btn" id="hmk-hidden-apps" hidden>
						<?php p($l->t('Hidden apps')); ?>
					</button>
					<button type="button" class="button-vue primary hmk-touch-btn hmk-chrome__btn" id="hmk-edit-toggle" aria-pressed="false" aria-describedby="hmk-instructions">
						<?php p($l->t('Edit')); ?>
					</button>
				</div>
			</header>
		</div>

		<p id="hmk-edit-hint" class="hmk-edit-hint" hidden><?php p($l->t('Drag panes to rearrange. Hide apps you do not need. Tap Done when finished.')); ?></p>

		<div id="hmk-cta" class="notecard hmk-cta" hidden role="region" aria-label="<?php p($l->t('Start page')); ?>">
			<p class="hmk-cta__text"><?php p($l->t('Make AppHome your start page after login?')); ?></p>
			<div class="hmk-cta__actions">
				<button type="button" class="button-vue primary hmk-touch-btn" id="hmk-cta-yes"><?php p($l->t('Use as start page')); ?></button>
				<button type="button" class="button-vue secondary hmk-touch-btn" id="hmk-cta-no"><?php p($l->t('Not now')); ?></button>
			</div>
		</div>

		<main id="hmk-main" class="hmk-main" tabindex="-1">
			<p class="hmk-status" id="hmk-status" role="status" aria-live="polite"></p>

			<div id="hmk-loading" class="hmk-loading" hidden><?php p($l->t('Loading…')); ?></div>
			<div id="hmk-empty" class="hmk-empty" hidden>
				<p><?php p($l->t('No other apps are available for you yet.')); ?></p>
			</div>
			<div id="hmk-panels" class="hmk-panels" role="list" aria-label="<?php p($l->t('Apps')); ?>"></div>
		</main>

		<footer class="hmk-credit" role="contentinfo">
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

	<dialog id="hmk-folder-dialog" class="hmk-dialog" aria-labelledby="hmk-folder-title">
		<div class="hmk-dialog__head">
			<h2 id="hmk-folder-title" class="hmk-dialog__title"></h2>
			<button type="button" class="button-vue tertiary hmk-touch-btn hmk-dialog__close" id="hmk-folder-close" aria-label="<?php p($l->t('Close')); ?>">×</button>
		</div>
		<div id="hmk-folder-grid" class="hmk-folder-list" role="list"></div>
	</dialog>

	<dialog id="hmk-prompt-dialog" class="hmk-dialog hmk-dialog--prompt" aria-labelledby="hmk-prompt-title">
		<h2 id="hmk-prompt-title" class="hmk-dialog__title"></h2>
		<label class="hmk-label" for="hmk-prompt-input" id="hmk-prompt-label"></label>
		<input type="text" id="hmk-prompt-input" class="hmk-input" maxlength="40" autocomplete="off" />
		<p class="hmk-error" id="hmk-prompt-error" role="alert"></p>
		<div class="hmk-dialog__actions">
			<button type="button" class="button-vue secondary hmk-touch-btn" id="hmk-prompt-cancel"><?php p($l->t('Cancel')); ?></button>
			<button type="button" class="button-vue primary hmk-touch-btn" id="hmk-prompt-ok"><?php p($l->t('Save')); ?></button>
		</div>
	</dialog>

	<dialog id="hmk-confirm-dialog" class="hmk-dialog hmk-dialog--confirm" aria-labelledby="hmk-confirm-message">
		<p id="hmk-confirm-message" class="hmk-dialog__message"></p>
		<div class="hmk-dialog__actions">
			<button type="button" class="button-vue secondary hmk-touch-btn" id="hmk-confirm-cancel"><?php p($l->t('Cancel')); ?></button>
			<button type="button" class="button-vue primary hmk-touch-btn hmk-btn--danger" id="hmk-confirm-ok"><?php p($l->t('Delete')); ?></button>
		</div>
	</dialog>

	<dialog id="hmk-folder-picker" class="hmk-dialog hmk-dialog--picker" aria-labelledby="hmk-folder-picker-title">
		<h2 id="hmk-folder-picker-title" class="hmk-dialog__title"><?php p($l->t('Choose a folder')); ?></h2>
		<div id="hmk-folder-picker-list" class="hmk-picker-list" role="list"></div>
		<div class="hmk-dialog__actions">
			<button type="button" class="button-vue secondary hmk-touch-btn" id="hmk-folder-picker-cancel"><?php p($l->t('Cancel')); ?></button>
		</div>
	</dialog>

	<dialog id="hmk-hidden-dialog" class="hmk-dialog hmk-dialog--picker" aria-labelledby="hmk-hidden-title">
		<div class="hmk-dialog__head">
			<h2 id="hmk-hidden-title" class="hmk-dialog__title"><?php p($l->t('Hidden apps')); ?></h2>
			<button type="button" class="button-vue tertiary hmk-touch-btn hmk-dialog__close" id="hmk-hidden-close" aria-label="<?php p($l->t('Close')); ?>">×</button>
		</div>
		<div id="hmk-hidden-list" class="hmk-hidden-list" role="list"></div>
		<div class="hmk-dialog__actions">
			<button type="button" class="button-vue secondary hmk-touch-btn" id="hmk-hidden-cancel"><?php p($l->t('Close')); ?></button>
		</div>
	</dialog>
</div>
