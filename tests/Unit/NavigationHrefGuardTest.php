<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Service\NavigationHrefGuard;
use OCP\IURLGenerator;
use PHPUnit\Framework\TestCase;

final class NavigationHrefGuardTest extends TestCase
{
	public function testAllowsRelative(): void
	{
		$g = new NavigationHrefGuard();
		$this->assertTrue($g->isSafe('/apps/files'));
		$this->assertFalse($g->isSafe('//evil.test/phish'));
		$this->assertFalse($g->isSafe('javascript:alert(1)'));
		$this->assertFalse($g->isSafe('https://evil.test/x')); // no origin → fail closed
	}

	public function testAbsoluteSameOriginOnly(): void
	{
		$url = $this->createMock(IURLGenerator::class);
		$url->method('getAbsoluteURL')->willReturn('https://cloud.example/index.php/');
		$g = new NavigationHrefGuard($url);
		$this->assertTrue($g->isSafe('https://cloud.example/apps/files'));
		$this->assertTrue($g->isSafe('/apps/files'));
		$this->assertFalse($g->isSafe('https://evil.example/apps/files'));
		$this->assertFalse($g->isSafe('http://cloud.example/apps/files'), 'scheme must match');
		$this->assertFalse($g->isSafe('https://cloud.example:8443/apps/files'), 'port must match');
		$this->assertSame('/apps/files', $g->filter('/apps/files'));
		$this->assertNull($g->filter('javascript:x'));
	}

	public function testAbsoluteWithExplicitPort(): void
	{
		$url = $this->createMock(IURLGenerator::class);
		$url->method('getAbsoluteURL')->willReturn('https://cloud.example:8443/');
		$g = new NavigationHrefGuard($url);
		$this->assertTrue($g->isSafe('https://cloud.example:8443/apps/files'));
		$this->assertFalse($g->isSafe('https://cloud.example/apps/files'));
	}
}
