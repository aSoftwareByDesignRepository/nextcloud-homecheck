<?php

declare(strict_types=1);

/*
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

/**
 * Shared upgrade-backup lock contract (family convention).
 *
 * HomeCheck has no snapshot/restore facility — this stub exists so the
 * synced config-transfer engine (TransferService / TransferApplyJob) can
 * lock against the same family key a backup restore would hold
 * exclusively. If a real snapshot service lands later it must keep this
 * constant and take over the lock contract.
 */
final class UpgradeBackupService
{
	public const LOCK_KEY = 'homecheck-upgrade-backup';
}
