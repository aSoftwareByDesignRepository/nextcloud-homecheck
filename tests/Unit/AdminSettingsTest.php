<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Settings\AdminSettings;
use OCA\HomeCheck\Service\LayoutService;
use PHPUnit\Framework\TestCase;

/**
 * AdminSettings chrome that does not need Util/OC boot.
 * PageController::index + AdminSettings::getForm are proven by Playwright
 * (e2e/homecheck.spec.js, e2e/brand.spec.js) — Util::addScript needs full NC.
 */
final class AdminSettingsTest extends TestCase
{
	public function testSectionAndPriority(): void
	{
		$settings = new AdminSettings($this->createMock(LayoutService::class));
		$this->assertSame('additional', $settings->getSection());
		$this->assertSame(80, $settings->getPriority());
	}
}
