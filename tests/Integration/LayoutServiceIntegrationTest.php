<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Docker integration: exercises LayoutService against real IConfig + navigation.
 */

namespace OCA\HomeCheck\Tests\Integration;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Service\AppOrderFlattener;
use OCA\HomeCheck\Service\LayoutMerger;
use OCA\HomeCheck\Service\LayoutService;
use OCA\HomeCheck\Service\LayoutValidator;
use OCA\HomeCheck\Service\LayoutWriteGuard;
use OCA\HomeCheck\Service\NavigationHrefGuard;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\INavigationManager;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class LayoutServiceIntegrationTest extends TestCase
{
	private string $uid;

	protected function setUp(): void
	{
		if (!class_exists(\OC::class) && !class_exists(\OCP\Server::class)) {
			$this->markTestSkipped('Nextcloud runtime required (run via docker compose exec)');
		}
		$users = Server::get(IUserManager::class);
		$this->uid = 'hmk_it_' . substr(bin2hex(random_bytes(4)), 0, 8);
		$users->createUser($this->uid, 'TestTest1!');
	}

	protected function tearDown(): void
	{
		if (!isset($this->uid)) {
			return;
		}
		$config = Server::get(IConfig::class);
		$config->deleteUserValue($this->uid, Application::APP_ID, LayoutService::USER_LAYOUT_KEY);
		$config->deleteUserValue($this->uid, Application::APP_ID, LayoutService::USER_CTA_DISMISS_KEY);
		$config->deleteUserValue($this->uid, 'core', 'apporder');
		$config->deleteUserValue($this->uid, 'core', 'defaultapp');
		$users = Server::get(IUserManager::class);
		$user = $users->get($this->uid);
		if ($user !== null) {
			$user->delete();
		}
	}

	private function service(): LayoutService
	{
		return new LayoutService(
			Server::get(IConfig::class),
			Server::get(INavigationManager::class),
			new LayoutValidator(),
			new LayoutMerger(),
			new AppOrderFlattener(),
			new NavigationHrefGuard(Server::get(IURLGenerator::class)),
			new LayoutWriteGuard(Server::get(IDBConnection::class)),
			Server::get(LoggerInterface::class),
		);
	}

	public function testGetSaveAndApporderPersist(): void
	{
		$svc = $this->service();
		$got = $svc->getForUser($this->uid);
		$this->assertGreaterThanOrEqual(1, $got['layout']['revision']);
		$this->assertNotEmpty($got['entries']);

		$firstId = $got['entries'][0]['id'];
		$items = [['type' => 'app', 'id' => $firstId]];
		foreach (array_slice($got['entries'], 1) as $e) {
			$items[] = ['type' => 'app', 'id' => $e['id']];
		}
		// Reverse order
		$items = array_reverse($items);

		$saved = $svc->saveForUser($this->uid, [
			'version' => 1,
			'revision' => $got['layout']['revision'],
			'items' => $items,
		]);
		$this->assertTrue($saved['apporderSynced']);

		$config = Server::get(IConfig::class);
		$apporder = json_decode($config->getUserValue($this->uid, 'core', 'apporder', '[]'), true, 512, JSON_THROW_ON_ERROR);
		$this->assertIsArray($apporder);
		$this->assertNotEmpty($apporder);
		$lastItem = $items[count($items) - 1];
		$this->assertArrayHasKey($lastItem['id'], $apporder);
	}

	public function testUserIsolation(): void
	{
		$svc = $this->service();
		$a = $svc->getForUser($this->uid);
		$users = Server::get(IUserManager::class);
		$uid2 = $this->uid . '_b';
		$users->createUser($uid2, 'TestTest1!');
		try {
			$svc->getForUser($uid2);
			$svc->saveForUser($this->uid, [
				'version' => 1,
				'revision' => $a['layout']['revision'],
				'items' => array_map(static fn (array $e) => ['type' => 'app', 'id' => $e['id']], $a['entries']),
			]);
			$b = $svc->getForUser($uid2);
			// uid2 should still be at revision from its own first get (1), not alice's bump unless same
			$this->assertSame(1, $b['layout']['revision']);
		} finally {
			$config = Server::get(IConfig::class);
			$config->deleteUserValue($uid2, Application::APP_ID, LayoutService::USER_LAYOUT_KEY);
			$config->deleteUserValue($uid2, 'core', 'apporder');
			$u = $users->get($uid2);
			if ($u !== null) {
				$u->delete();
			}
		}
	}

	public function testConcurrentSaveSecondGetsConflict(): void
	{
		$svc = $this->service();
		$got = $svc->getForUser($this->uid);
		$rev = $got['layout']['revision'];
		$items = array_map(static fn (array $e) => ['type' => 'app', 'id' => $e['id']], $got['entries']);
		$svc->saveForUser($this->uid, [
			'version' => 1,
			'revision' => $rev,
			'items' => $items,
		]);
		$this->expectException(\OCA\HomeCheck\Exception\DomainException::class);
		$svc->saveForUser($this->uid, [
			'version' => 1,
			'revision' => $rev,
			'items' => array_reverse($items),
		]);
	}

	public function testResyncAppOrderPersistsWithoutBump(): void
	{
		$svc = $this->service();
		$got = $svc->getForUser($this->uid);
		$rev = $got['layout']['revision'];
		$result = $svc->resyncAppOrderForUser($this->uid);
		$this->assertTrue($result['apporderSynced']);
		$this->assertSame($rev, $result['layout']['revision']);
		$config = Server::get(IConfig::class);
		$apporder = json_decode($config->getUserValue($this->uid, 'core', 'apporder', '[]'), true, 512, JSON_THROW_ON_ERROR);
		$this->assertIsArray($apporder);
		$this->assertNotEmpty($apporder);
	}
}
