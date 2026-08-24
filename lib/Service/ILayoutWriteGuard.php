<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

interface ILayoutWriteGuard
{
	/**
	 * Replace layout raw JSON only if storage still matches $expectedRaw.
	 * Pass null/'' expected when the preference must be absent or empty.
	 */
	public function compareAndSwap(string $uid, ?string $expectedRaw, string $newRaw): bool;

	/** Unlocked read of personal layout JSON (null if absent/empty). */
	public function readRaw(string $uid): ?string;
}
