<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit\Dashboard;

use OCA\HomeCheck\Dashboard\LauncherWidget;
use OCA\HomeCheck\Service\AppIconService;
use OCA\HomeCheck\Service\LayoutService;
use OCP\App\IAppManager;
use OCP\Dashboard\Model\WidgetButton;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class LauncherWidgetTest extends TestCase
{
	private LayoutService&MockObject $layout;
	private IUserSession&MockObject $session;
	private LauncherWidget $widget;

	protected function setUp(): void
	{
		parent::setUp();
		$this->layout = $this->createMock(LayoutService::class);
		$this->session = $this->createMock(IUserSession::class);
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$this->session->method('getUser')->willReturn($user);
		$url = $this->createMock(IURLGenerator::class);
		$url->method('imagePath')->willReturn('/apps/homecheck/img/app-dashboard.svg');
		$url->method('getAbsoluteURL')->willReturnCallback(static fn (string $p) => 'https://nc.test' . $p);
		$url->method('linkToRouteAbsolute')->willReturn('https://nc.test/apps/homecheck/');
		$l10n = $this->createMock(IL10N::class);
		$l10n->method('t')->willReturnCallback(static function (string $s, array $a = []) {
			foreach ($a as $i => $v) {
				$s = str_replace('%' . ($i + 1) . '$s', (string)$v, $s);
			}
			return $s;
		});
		$apps = $this->createMock(IAppManager::class);
		$apps->method('getAppVersion')->willReturn('1.0.15');
		$icons = new AppIconService($url, $apps);
		$this->widget = new LauncherWidget(
			$l10n,
			$url,
			$this->session,
			$this->layout,
			$icons,
			$this->createMock(LoggerInterface::class),
		);
	}

	public function testStableWidgetId(): void
	{
		$this->assertSame('homecheck-launcher', $this->widget->getId());
	}

	public function testIconUrlUsesDarkSurfaceAsset(): void
	{
		$this->assertStringContainsString('app-dashboard.svg', $this->widget->getIconUrl());
		$this->assertStringStartsWith('https://', $this->widget->getIconUrl());
		$this->assertStringContainsString('v=1.0.15', $this->widget->getIconUrl());
	}

	public function testUsesReadOnlySummarizeNotGetForUser(): void
	{
		$this->layout->expects($this->once())->method('summarizeForUser')->with('alice')->willReturn([
			'appCount' => 3,
			'folderCount' => 1,
			'tileCount' => 3,
			'isDefaultLanding' => false,
			'hasPersonalLayout' => true,
		]);
		$this->layout->expects($this->never())->method('getForUser');

		$items = $this->widget->getItemsV2('alice');
		$this->assertCount(2, $items->getItems());
		$this->assertSame('', $items->getEmptyContentMessage());
	}

	public function testEmptyWhenNoApps(): void
	{
		$this->layout->method('summarizeForUser')->willReturn([
			'appCount' => 0,
			'folderCount' => 0,
			'tileCount' => 0,
			'isDefaultLanding' => false,
			'hasPersonalLayout' => false,
		]);
		$items = $this->widget->getItemsV2('alice');
		$this->assertSame([], $items->getItems());
		$this->assertNotSame('', $items->getEmptyContentMessage());
	}

	public function testLandingOnSubtitle(): void
	{
		$this->layout->method('summarizeForUser')->willReturn([
			'appCount' => 2,
			'folderCount' => 0,
			'tileCount' => 2,
			'isDefaultLanding' => true,
			'hasPersonalLayout' => true,
		]);
		$items = $this->widget->getItemsV2('alice')->getItems();
		$this->assertCount(2, $items);
		$this->assertStringContainsString('opens after you sign in', $items[1]->getSubtitle());
	}

	public function testItemsRequireMatchingSessionUser(): void
	{
		$this->layout->expects($this->never())->method('summarizeForUser');
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn(null);
		$url = $this->createMock(IURLGenerator::class);
		$url->method('linkToRouteAbsolute')->willReturn('https://nc.test/apps/homecheck/');
		$url->method('imagePath')->willReturn('/apps/homecheck/img/app-dashboard.svg');
		$url->method('getAbsoluteURL')->willReturnCallback(static fn (string $p) => 'https://nc.test' . $p);
		$l10n = $this->createMock(IL10N::class);
		$l10n->method('t')->willReturnArgument(0);
		$apps = $this->createMock(IAppManager::class);
		$apps->method('getAppVersion')->willReturn('1.0.15');
		$widget = new LauncherWidget(
			$l10n,
			$url,
			$session,
			$this->layout,
			new AppIconService($url, $apps),
			$this->createMock(LoggerInterface::class),
		);
		$items = $widget->getItemsV2('alice');
		$this->assertSame([], $items->getItems());
		$this->assertSame('', $items->getEmptyContentMessage());

		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('bob');
		$sessionMismatch = $this->createMock(IUserSession::class);
		$sessionMismatch->method('getUser')->willReturn($user);
		$widget2 = new LauncherWidget(
			$l10n,
			$url,
			$sessionMismatch,
			$this->layout,
			new AppIconService($url, $apps),
			$this->createMock(LoggerInterface::class),
		);
		$items2 = $widget2->getItemsV2('alice');
		$this->assertSame([], $items2->getItems());
	}

	public function testButtonsRequireMatchingSessionUser(): void
	{
		$url = $this->createMock(IURLGenerator::class);
		$url->method('linkToRouteAbsolute')->willReturn('https://nc.test/apps/homecheck/');
		$url->method('imagePath')->willReturn('/apps/homecheck/img/app-dashboard.svg');
		$url->method('getAbsoluteURL')->willReturnCallback(static fn (string $p) => 'https://nc.test' . $p);
		$l10n = $this->createMock(IL10N::class);
		$l10n->method('t')->willReturnArgument(0);
		$apps = $this->createMock(IAppManager::class);
		$apps->method('getAppVersion')->willReturn('1.0.15');
		$icons = new AppIconService($url, $apps);

		$sessionNull = $this->createMock(IUserSession::class);
		$sessionNull->method('getUser')->willReturn(null);
		$widgetNull = new LauncherWidget(
			$l10n,
			$url,
			$sessionNull,
			$this->layout,
			$icons,
			$this->createMock(LoggerInterface::class),
		);
		$this->assertSame([], $widgetNull->getWidgetButtons('alice'));

		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('alice');
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$widget = new LauncherWidget(
			$l10n,
			$url,
			$session,
			$this->layout,
			$icons,
			$this->createMock(LoggerInterface::class),
		);
		$buttons = $widget->getWidgetButtons('alice');
		$this->assertCount(1, $buttons);
		$this->assertSame(WidgetButton::TYPE_MORE, $buttons[0]->getType());
		$this->assertSame('https://nc.test/apps/homecheck/', $buttons[0]->getLink());
	}

	public function testSummarizeFailureReturnsEmptyMessage(): void
	{
		$this->layout->method('summarizeForUser')->willThrowException(new \RuntimeException('boom'));
		$items = $this->widget->getItemsV2('alice');
		$this->assertSame([], $items->getItems());
		$this->assertStringContainsString('Could not load', $items->getEmptyContentMessage());
	}
}
