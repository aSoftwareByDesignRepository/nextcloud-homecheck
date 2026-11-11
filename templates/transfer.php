<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * HomeCheck Settings → Transfer configuration (test → production).
 *
 * Dedicated shell: the synced settings part renders inside the app chrome —
 * NC system admins only (PageController::settings gates; non-admins are
 * redirected to the app index). Export needs no extra right, Replace mode
 * is additionally maintenance-mode gated inside the engine.
 *
 * @var array $_
 * @var \OCP\IL10N $l
 */
$appId = 'homecheck';
style($appId, 'app');
style($appId, 'common/transfer');
script($appId, 'transfer-bridge');
script($appId, 'transfer');
?>
<div id="app-content">
	<div id="app-content-wrapper">
		<div id="homecheck-app" class="hmk-app hmk-transfer-page" data-app="<?php p($appId); ?>">
			<main id="hmk-main" class="hmk-main hmk-transfer-main" tabindex="-1">
				<h2 class="hmk-transfer-title"><?php p($l->t('Transfer configuration')); ?></h2>
				<?php include __DIR__ . '/parts/settings/transfer.php'; ?>
			</main>
		</div>
	</div>
</div>
