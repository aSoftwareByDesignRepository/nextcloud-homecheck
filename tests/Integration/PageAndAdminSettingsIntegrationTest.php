<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Integration;

use OCA\HomeCheck\Controller\PageController;
use OCA\HomeCheck\Service\LayoutService;
use OCA\HomeCheck\Settings\AdminSettings;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * Exercises PageController::index + AdminSettings::getForm against real NC Util/session.
 */
final class PageAndAdminSettingsIntegrationTest extends TestCase
{
	private string $uid;

	protected function setUp(): void
	{
		if (!class_exists(\OC::class) && !class_exists(\OCP\Server::class)) {
			$this->markTestSkipped('Nextcloud runtime required (run via docker compose exec)');
		}
		$users = Server::get(IUserManager::class);
		$this->uid = 'hmk_page_' . substr(bin2hex(random_bytes(4)), 0, 8);
		$users->createUser($this->uid, 'TestTest1!');
	}

	protected function tearDown(): void
	{
		if (!isset($this->uid)) {
			return;
		}
		$users = Server::get(IUserManager::class);
		$user = $users->get($this->uid);
		if ($user !== null) {
			$user->delete();
		}
	}

	public function testPageIndexInvokesGetForUser(): void
	{
		$user = Server::get(IUserManager::class)->get($this->uid);
		$this->assertNotNull($user);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$layouts = Server::get(LayoutService::class);
		$c = new PageController('homecheck', Server::get(IRequest::class), $session, $layouts);
		$res = $c->index();
		$this->assertInstanceOf(TemplateResponse::class, $res);
		$state = $res->getParams()['initialState'];
		$this->assertIsArray($state['layout']);
		$this->assertArrayHasKey('entries', $state);
		$this->assertSame($user->getDisplayName() !== '' ? $user->getDisplayName() : '', $state['displayName'] !== '' ? $state['displayName'] : $state['displayName']);
		$this->assertIsString($state['displayName']);
	}

	public function testAdminSettingsGetFormLoadsTemplate(): void
	{
		$settings = new AdminSettings(Server::get(LayoutService::class));
		$form = $settings->getForm();
		$this->assertInstanceOf(TemplateResponse::class, $form);
		$this->assertArrayHasKey('template', $form->getParams());
	}
}
