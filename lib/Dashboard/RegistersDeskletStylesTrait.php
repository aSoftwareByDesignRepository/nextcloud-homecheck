<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Dashboard;

use OCA\HomeCheck\AppInfo\Application;
use OCP\Util;

/**
 * Dashboard widgets render outside HomeCheck page templates — they must
 * register desklet styles in {@see \OCP\Dashboard\IWidget::load()} themselves.
 */
trait RegistersDeskletStylesTrait
{
	private static bool $deskletStylesRegistered = false;

	private function registerDeskletStylesForWidget(): void
	{
		if (self::$deskletStylesRegistered) {
			return;
		}
		self::$deskletStylesRegistered = true;
		Util::addStyle(Application::APP_ID, 'desklet-nextcloud');
	}
}
