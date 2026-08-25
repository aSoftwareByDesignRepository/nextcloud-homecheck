<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Momos: every mutating/read API method × unauthenticated + wrong-role matrix.
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Controller\ApiController;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Http;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

final class ApiControllerAuthTest extends TestCase
{
	private function user(string $uid = 'alice'): IUser
	{
		$u = $this->createMock(IUser::class);
		$u->method('getUID')->willReturn($uid);
		return $u;
	}

	private function controller(?IUser $user, bool $admin = false, ?IRequest $request = null): ApiController
	{
		$request ??= $this->createMock(IRequest::class);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('isAdmin')->willReturn($admin);
		$layouts = $this->createMock(LayoutService::class);
		$layouts->method('getForUser')->willReturn([
			'layout' => ['version' => 1, 'revision' => 1, 'items' => []],
			'entries' => [],
			'ctaDismissed' => false,
			'isDefaultLanding' => false,
			'apporderSynced' => true,
		]);
		$layouts->method('saveForUser')->willReturn([
			'layout' => ['version' => 1, 'revision' => 2, 'items' => []],
			'entries' => [],
			'apporderSynced' => true,
		]);
		$layouts->method('resyncAppOrderForUser')->willReturn([
			'apporderSynced' => true,
			'layout' => ['version' => 1, 'revision' => 1, 'items' => []],
		]);
		$layouts->method('getAdminTemplate')->willReturn(null);
		$layouts->method('saveAdminTemplate')->willReturn(null);
		$layouts->method('isDefaultLanding')->willReturn(false);
		return new ApiController('homecheck', $request, $session, $groups, $layouts);
	}

	public function testUnauthenticatedGetLayoutReturns401(): void
	{
		$res = $this->controller(null)->getLayout();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
		$this->assertFalse($res->getData()['ok']);
		$this->assertSame('unauthorized', $res->getData()['error']['code']);
	}

	public function testUnauthenticatedPutLayoutReturns401(): void
	{
		$request = $this->createMock(IRequest::class);
		$request->method('getParam')->with('layout')->willReturn([
			'version' => 1,
			'revision' => 1,
			'items' => [],
		]);
		$res = $this->controller(null, false, $request)->putLayout();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
		$this->assertSame('unauthorized', $res->getData()['error']['code']);
	}

	public function testUnauthenticatedSyncAppOrderReturns401(): void
	{
		$res = $this->controller(null)->syncAppOrder();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
	}

	public function testUnauthenticatedDefaultLandingReturns401(): void
	{
		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn(['enable' => true]);
		$res = $this->controller(null, false, $request)->defaultLanding();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
	}

	public function testUnauthenticatedAdminTemplateGetReturns401(): void
	{
		$res = $this->controller(null)->getAdminTemplate();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
	}

	public function testUnauthenticatedAdminTemplatePutReturns401(): void
	{
		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn(['template' => null]);
		$request->method('getParam')->with('template')->willReturn(null);
		$res = $this->controller(null, false, $request)->putAdminTemplate();
		$this->assertSame(Http::STATUS_UNAUTHORIZED, $res->getStatus());
	}

	public function testNonAdminCannotGetAdminTemplate(): void
	{
		$res = $this->controller($this->user(), false)->getAdminTemplate();
		$this->assertSame(Http::STATUS_FORBIDDEN, $res->getStatus());
		$this->assertSame('forbidden', $res->getData()['error']['code']);
	}

	public function testNonAdminCannotPutAdminTemplate(): void
	{
		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn(['template' => ['version' => 1, 'revision' => 0, 'items' => []]]);
		$request->method('getParam')->with('template')->willReturn(['version' => 1, 'revision' => 0, 'items' => []]);
		$layouts = $this->createMock(LayoutService::class);
		$layouts->expects($this->never())->method('saveAdminTemplate');
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('isAdmin')->willReturn(false);
		$c = new ApiController('homecheck', $request, $session, $groups, $layouts);
		$res = $c->putAdminTemplate();
		$this->assertSame(Http::STATUS_FORBIDDEN, $res->getStatus());
	}

	public function testAdminCanGetAdminTemplate(): void
	{
		$res = $this->controller($this->user('admin'), true)->getAdminTemplate();
		$this->assertSame(Http::STATUS_OK, $res->getStatus());
		$this->assertTrue($res->getData()['ok']);
	}

	public function testAuthenticatedGetLayoutDoesNotAcceptClientUserId(): void
	{
		$request = $this->createMock(IRequest::class);
		$request->method('getParam')->willReturnCallback(static function (string $key) {
			if ($key === 'userId' || $key === 'uid') {
				return 'victim';
			}
			return null;
		});
		$layouts = $this->createMock(LayoutService::class);
		$layouts->expects($this->once())->method('getForUser')->with('alice')->willReturn([
			'layout' => ['version' => 1, 'revision' => 1, 'items' => []],
			'entries' => [],
			'ctaDismissed' => false,
			'isDefaultLanding' => false,
			'apporderSynced' => true,
		]);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user('alice'));
		$c = new ApiController(
			'homecheck',
			$request,
			$session,
			$this->createMock(IGroupManager::class),
			$layouts,
		);
		$res = $c->getLayout();
		$this->assertSame(Http::STATUS_OK, $res->getStatus());
	}
}
