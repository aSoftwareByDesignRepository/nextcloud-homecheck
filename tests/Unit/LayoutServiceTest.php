<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\AppOrderFlattener;
use OCA\HomeCheck\Service\ILayoutWriteGuard;
use OCA\HomeCheck\Service\LayoutMerger;
use OCA\HomeCheck\Service\LayoutService;
use OCA\HomeCheck\Service\LayoutValidator;
use OCA\HomeCheck\Service\NavigationHrefGuard;
use OCP\IConfig;
use OCP\INavigationManager;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

final class LayoutServiceTest extends TestCase
{
	/** @var array<string, array<string, string>> */
	private array $userVals = [];
	/** @var array<string, string> */
	private array $appVals = [];

	private function config(): IConfig
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getUserValue')->willReturnCallback(function (string $uid, string $app, string $key, $default = '') {
			return $this->userVals[$uid][$app . '/' . $key] ?? $default;
		});
		$config->method('setUserValue')->willReturnCallback(function (string $uid, string $app, string $key, string $value): void {
			$this->userVals[$uid][$app . '/' . $key] = $value;
		});
		$config->method('getAppValue')->willReturnCallback(function (string $app, string $key, $default = '') {
			return $this->appVals[$app . '/' . $key] ?? $default;
		});
		$config->method('setAppValue')->willReturnCallback(function (string $app, string $key, string $value): void {
			$this->appVals[$app . '/' . $key] = $value;
		});
		$config->method('deleteAppValue')->willReturnCallback(function (string $app, string $key): void {
			unset($this->appVals[$app . '/' . $key]);
		});
		return $config;
	}

	private function nav(array $entries): INavigationManager
	{
		$nav = $this->createMock(INavigationManager::class);
		$nav->method('getAll')->willReturn($entries);
		return $nav;
	}

	private function memoryWriteGuard(): ILayoutWriteGuard
	{
		$guard = $this->createMock(ILayoutWriteGuard::class);
		$guard->method('readRaw')->willReturnCallback(function (string $uid): ?string {
			$key = Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY;
			$current = $this->userVals[$uid][$key] ?? null;
			return ($current === null || $current === '') ? null : $current;
		});
		$guard->method('compareAndSwap')->willReturnCallback(
			function (string $uid, ?string $expectedRaw, string $newRaw): bool {
				$key = Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY;
				$current = $this->userVals[$uid][$key] ?? null;
				$cur = ($current === null || $current === '') ? null : $current;
				$exp = ($expectedRaw === null || $expectedRaw === '') ? null : $expectedRaw;
				if ($cur !== $exp) {
					return false;
				}
				$this->userVals[$uid][$key] = $newRaw;
				return true;
			},
		);
		return $guard;
	}

	private function service(array $entries): LayoutService
	{
		return new LayoutService(
			$this->config(),
			$this->nav($entries),
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$this->memoryWriteGuard(),
			new NullLogger(),
		);
	}

	public function testFirstGetPersistsAndSyncsApporder(): void
	{
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/apps/calendar', 'order' => 2, 'app' => 'calendar'],
		]);
		$out = $svc->getForUser('alice');
		$this->assertSame(1, $out['layout']['revision']);
		$this->assertTrue($out['apporderSynced']);
		$this->assertCount(2, $out['layout']['items']);
		$raw = $this->userVals['alice'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY] ?? '';
		$this->assertNotSame('', $raw);
		$apporder = json_decode($this->userVals['alice']['core/apporder'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame(1, $apporder['files']['order']);
		$this->assertSame(2, $apporder['calendar']['order']);
	}

	public function testSeedAppliedOnceThenIgnored(): void
	{
		$this->appVals[Application::APP_ID . '/' . LayoutService::APP_SEED_KEY] = json_encode([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['files']],
				['type' => 'app', 'id' => 'calendar'],
			],
		], JSON_THROW_ON_ERROR);

		$entries = [
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/c', 'order' => 2, 'app' => 'calendar'],
		];
		$svc = $this->service($entries);
		$first = $svc->getForUser('bob');
		$this->assertSame('folder', $first['layout']['items'][0]['type']);

		// Change seed drastically
		$this->appVals[Application::APP_ID . '/' . LayoutService::APP_SEED_KEY] = json_encode([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'app', 'id' => 'calendar'],
			],
		], JSON_THROW_ON_ERROR);

		$svc2 = $this->service($entries);
		$second = $svc2->getForUser('bob');
		$this->assertSame('folder', $second['layout']['items'][0]['type']);
		$this->assertSame('Work', $second['layout']['items'][0]['name']);
	}

	public function testSaveConflictOnStaleRevision(): void
	{
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
		]);
		$svc->getForUser('carol');
		$this->expectException(DomainException::class);
		$svc->saveForUser('carol', [
			'version' => 1,
			'revision' => 0,
			'items' => [['type' => 'app', 'id' => 'files']],
		]);
	}

	public function testSaveIncrementsRevisionAndFlattensFolder(): void
	{
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/c', 'order' => 2, 'app' => 'calendar'],
		]);
		$svc->getForUser('dave');
		$result = $svc->saveForUser('dave', [
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'All', 'children' => ['files', 'calendar']],
			],
		]);
		$this->assertSame(2, $result['layout']['revision']);
		$this->assertTrue($result['apporderSynced']);
		$apporder = json_decode($this->userVals['dave']['core/apporder'], true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame(1, $apporder['files']['order']);
		$this->assertSame(2, $apporder['calendar']['order']);
	}

	public function testDefaultLandingOptIn(): void
	{
		$svc = $this->service([]);
		$this->userVals['erin']['core/defaultapp'] = 'files,dashboard';
		$svc->setDefaultLanding('erin', true, true);
		$this->assertTrue($svc->isDefaultLanding('erin'));
		$this->assertSame('1', $this->userVals['erin'][Application::APP_ID . '/' . LayoutService::USER_CTA_DISMISS_KEY]);
		$this->assertSame('homecheck,files,dashboard', $this->userVals['erin']['core/defaultapp']);
	}

	public function testDefaultLandingDisablePreservesOthers(): void
	{
		$svc = $this->service([]);
		$this->userVals['erin']['core/defaultapp'] = 'homecheck,files';
		$svc->setDefaultLanding('erin', false, false);
		$this->assertFalse($svc->isDefaultLanding('erin'));
		$this->assertSame('files', $this->userVals['erin']['core/defaultapp']);
	}

	public function testFirstGetSurfacesApporderSyncFailure(): void
	{
		$config = $this->createMock(IConfig::class);
		$userVals = &$this->userVals;
		$config->method('getUserValue')->willReturnCallback(function (string $uid, string $app, string $key, $default = '') use (&$userVals) {
			return $userVals[$uid][$app . '/' . $key] ?? $default;
		});
		$config->method('setUserValue')->willReturnCallback(function (string $uid, string $app, string $key, string $value) use (&$userVals): void {
			if ($app === 'core' && $key === 'apporder') {
				throw new \RuntimeException('boom');
			}
			$userVals[$uid][$app . '/' . $key] = $value;
		});
		$config->method('getAppValue')->willReturn('');
		$nav = $this->createMock(INavigationManager::class);
		$nav->method('getAll')->willReturn([
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 1, 'app' => 'files'],
		]);
		$svc = new LayoutService(
			$config,
			$nav,
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$this->memoryWriteGuard(),
			new NullLogger(),
		);
		$out = $svc->getForUser('firstfail');
		$this->assertFalse($out['apporderSynced']);
		$this->assertSame(1, $out['layout']['revision']);
	}

	public function testSyncAppOrderFailureSurfaces(): void
	{
		$config = $this->createMock(IConfig::class);
		$userVals = &$this->userVals;
		$config->method('getUserValue')->willReturnCallback(function (string $uid, string $app, string $key, $default = '') use (&$userVals) {
			return $userVals[$uid][$app . '/' . $key] ?? $default;
		});
		$config->method('setUserValue')->willReturnCallback(function (string $uid, string $app, string $key, string $value) use (&$userVals): void {
			if ($app === 'core' && $key === 'apporder') {
				throw new \RuntimeException('boom');
			}
			$userVals[$uid][$app . '/' . $key] = $value;
		});
		$config->method('getAppValue')->willReturn('');
		$nav = $this->createMock(INavigationManager::class);
		$nav->method('getAll')->willReturn([
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 1, 'app' => 'files'],
		]);
		$svc = new LayoutService(
			$config,
			$nav,
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$this->memoryWriteGuard(),
			new NullLogger(),
		);
		$svc->getForUser('fail');
		$result = $svc->saveForUser('fail', [
			'version' => 1,
			'revision' => 1,
			'items' => [['type' => 'app', 'id' => 'files']],
		]);
		$this->assertFalse($result['apporderSynced']);
	}

	public function testSaveCasConflictWhenRawChanged(): void
	{
		$entries = [
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
		];
		$key = Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY;
		$this->userVals['cas'][$key] = json_encode([
			'version' => 1,
			'revision' => 1,
			'items' => [['type' => 'app', 'id' => 'files']],
		], JSON_THROW_ON_ERROR);

		$guard = $this->createMock(ILayoutWriteGuard::class);
		$guard->method('readRaw')->willReturnCallback(function (string $uid) use ($key): ?string {
			$current = $this->userVals[$uid][$key] ?? null;
			return ($current === null || $current === '') ? null : $current;
		});
		$guard->method('compareAndSwap')->willReturnCallback(
			function (string $uid, ?string $expectedRaw, string $newRaw) use ($key): bool {
				$this->userVals[$uid][$key] = json_encode([
					'version' => 1,
					'revision' => 7,
					'items' => [['type' => 'app', 'id' => 'files']],
				], JSON_THROW_ON_ERROR);
				return false;
			},
		);
		$svc = new LayoutService(
			$this->config(),
			$this->nav($entries),
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$guard,
			new NullLogger(),
		);
		try {
			$svc->saveForUser('cas', [
				'version' => 1,
				'revision' => 1,
				'items' => [['type' => 'app', 'id' => 'files']],
			]);
			$this->fail('Expected DomainException');
		} catch (DomainException $e) {
			$this->assertSame(409, $e->httpStatus);
			$this->assertSame(7, $e->payload['layout']['revision']);
		}
	}

	public function testAdminTemplateRoundTrip(): void
	{
		$svc = $this->service([]);
		$saved = $svc->saveAdminTemplate([
			'version' => 1,
			'revision' => 5,
			'items' => [['type' => 'app', 'id' => 'files']],
		]);
		$this->assertSame(0, $saved['revision']);
		$got = $svc->getAdminTemplate();
		$this->assertSame('files', $got['items'][0]['id']);
		$svc->saveAdminTemplate(null);
		$this->assertNull($svc->getAdminTemplate());
	}

	public function testCorruptLayoutIsRegeneratedOnGet(): void
	{
		$this->userVals['zoe'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY] = '{not-json';
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 1, 'app' => 'files'],
		]);
		$out = $svc->getForUser('zoe');
		$this->assertSame(1, $out['layout']['revision']);
		$this->assertSame('files', $out['layout']['items'][0]['id']);
		$raw = $this->userVals['zoe'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY];
		$this->assertStringContainsString('"files"', $raw);
	}

	public function testDropsJavascriptHref(): void
	{
		$svc = $this->service([
			['id' => 'evil', 'name' => 'Evil', 'href' => 'javascript:alert(1)', 'order' => 1, 'app' => 'evil'],
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 2, 'app' => 'files'],
		]);
		$out = $svc->getForUser('safe');
		$ids = array_column($out['entries'], 'id');
		$this->assertNotContains('evil', $ids);
		$this->assertContains('files', $ids);
	}

	public function testResyncAppOrderWithoutRevisionBump(): void
	{
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/c', 'order' => 2, 'app' => 'calendar'],
		]);
		$svc->getForUser('resync');
		$before = json_decode($this->userVals['resync'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY], true, 512, JSON_THROW_ON_ERROR);
		$result = $svc->resyncAppOrderForUser('resync');
		$this->assertTrue($result['apporderSynced']);
		$this->assertSame((int)$before['revision'], $result['layout']['revision']);
		$apporder = json_decode($this->userVals['resync']['core/apporder'], true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame(1, $apporder['files']['order']);
		$after = json_decode($this->userVals['resync'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY], true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame($before['revision'], $after['revision']);
	}

	public function testFirstGetLostRaceResyncsApporder(): void
	{
		$entries = [
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
		];
		$key = Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY;
		$winnerLayout = json_encode([
			'version' => 1,
			'revision' => 1,
			'items' => [['type' => 'app', 'id' => 'files']],
		], JSON_THROW_ON_ERROR);

		$guard = $this->createMock(ILayoutWriteGuard::class);
		$guard->method('readRaw')->willReturnCallback(function (string $uid) use ($key): ?string {
			$current = $this->userVals[$uid][$key] ?? null;
			return ($current === null || $current === '') ? null : $current;
		});
		$guard->method('compareAndSwap')->willReturnCallback(
			function (string $uid, ?string $expectedRaw, string $newRaw) use ($key, $winnerLayout): bool {
				if ($expectedRaw === null) {
					$this->userVals[$uid][$key] = $winnerLayout;
					return false;
				}
				$this->userVals[$uid][$key] = $newRaw;
				return true;
			},
		);

		$svc = new LayoutService(
			$this->config(),
			$this->nav($entries),
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$guard,
			new NullLogger(),
		);
		$out = $svc->getForUser('race');
		$this->assertTrue($out['apporderSynced']);
		$this->assertSame(1, $out['layout']['revision']);
		$apporder = json_decode($this->userVals['race']['core/apporder'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
		$this->assertSame(1, $apporder['files']['order']);
	}

	public function testFirstGetLostRaceSurfacesApporderFailure(): void
	{
		$entries = [
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
		];
		$key = Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY;
		$winnerLayout = json_encode([
			'version' => 1,
			'revision' => 1,
			'items' => [['type' => 'app', 'id' => 'files']],
		], JSON_THROW_ON_ERROR);

		$config = $this->createMock(IConfig::class);
		$userVals = &$this->userVals;
		$config->method('getUserValue')->willReturnCallback(function (string $uid, string $app, string $key, $default = '') use (&$userVals) {
			return $userVals[$uid][$app . '/' . $key] ?? $default;
		});
		$config->method('setUserValue')->willReturnCallback(function (string $uid, string $app, string $key, string $value) use (&$userVals): void {
			if ($app === 'core' && $key === 'apporder') {
				throw new \RuntimeException('boom');
			}
			$userVals[$uid][$app . '/' . $key] = $value;
		});
		$config->method('getAppValue')->willReturn('');

		$guard = $this->createMock(ILayoutWriteGuard::class);
		$guard->method('readRaw')->willReturnCallback(function (string $uid) use ($key): ?string {
			$current = $this->userVals[$uid][$key] ?? null;
			return ($current === null || $current === '') ? null : $current;
		});
		$guard->method('compareAndSwap')->willReturnCallback(
			function (string $uid, ?string $expectedRaw, string $newRaw) use ($key, $winnerLayout): bool {
				if ($expectedRaw === null) {
					$this->userVals[$uid][$key] = $winnerLayout;
					return false;
				}
				$this->userVals[$uid][$key] = $newRaw;
				return true;
			},
		);

		$svc = new LayoutService(
			$config,
			$this->nav($entries),
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(),
			$guard,
			new NullLogger(),
		);
		$out = $svc->getForUser('racefail');
		$this->assertFalse($out['apporderSynced']);
		$this->assertSame(1, $out['layout']['revision']);
	}

	public function testSummarizeDoesNotPersistOrSyncApporder(): void
	{
		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/apps/files', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/apps/calendar', 'order' => 2, 'app' => 'calendar'],
		]);
		$summary = $svc->summarizeForUser('summary-user');
		$this->assertSame(2, $summary['appCount']);
		$this->assertSame(0, $summary['folderCount']);
		$this->assertSame(2, $summary['tileCount']);
		$this->assertFalse($summary['isDefaultLanding']);
		$this->assertFalse($summary['hasPersonalLayout']);
		$this->assertArrayNotHasKey('summary-user', $this->userVals);
	}

	public function testSummarizeCountsFolderChildrenAndLanding(): void
	{
		$this->userVals['fold'][Application::APP_ID . '/' . LayoutService::USER_LAYOUT_KEY] = json_encode([
			'version' => 1,
			'revision' => 3,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['files', 'calendar']],
			],
		], JSON_THROW_ON_ERROR);
		$this->userVals['fold']['core/defaultapp'] = 'homecheck,files';

		$svc = $this->service([
			['id' => 'files', 'name' => 'Files', 'href' => '/f', 'order' => 1, 'app' => 'files'],
			['id' => 'calendar', 'name' => 'Calendar', 'href' => '/c', 'order' => 2, 'app' => 'calendar'],
		]);
		$summary = $svc->summarizeForUser('fold');
		$this->assertSame(2, $summary['appCount']);
		$this->assertSame(1, $summary['folderCount']);
		$this->assertSame(1, $summary['tileCount']);
		$this->assertTrue($summary['isDefaultLanding']);
		$this->assertTrue($summary['hasPersonalLayout']);
		$this->assertArrayNotHasKey('core/apporder', $this->userVals['fold'] ?? []);
	}
}
