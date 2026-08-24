<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Controller\ApiController;
use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Http;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

final class ApiControllerTest extends TestCase
{
	private function controller(LayoutService $layouts, ?IUser $user = null, bool $admin = false): ApiController
	{
		$request = $this->createMock(IRequest::class);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$groups = $this->createMock(IGroupManager::class);
		$groups->method('isAdmin')->willReturn($admin);
		return new ApiController('homecheck', $request, $session, $groups, $layouts);
	}

	private function user(string $uid = 'alice'): IUser
	{
		$u = $this->createMock(IUser::class);
		$u->method('getUID')->willReturn($uid);
		return $u;
	}

	public function testPutLayoutConflictIncludesPayload(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$layouts->method('saveForUser')->willThrowException(new DomainException(
			'layout_revision',
			'conflict',
			409,
			['layout' => ['version' => 1, 'revision' => 4, 'items' => []]],
		));
		$request = $this->createMock(IRequest::class);
		$request->method('getParam')->with('layout')->willReturn([
			'version' => 1,
			'revision' => 1,
			'items' => [],
		]);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$groups = $this->createMock(IGroupManager::class);
		$c = new ApiController('homecheck', $request, $session, $groups, $layouts);
		$res = $c->putLayout();
		$this->assertSame(409, $res->getStatus());
		$data = $res->getData();
		$this->assertFalse($data['ok']);
		$this->assertSame('layout_revision', $data['error']['code']);
		$this->assertSame(4, $data['data']['layout']['revision']);
	}

	public function testPutLayoutApporderFailReturns502(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$layouts->method('saveForUser')->willReturn([
			'layout' => ['version' => 1, 'revision' => 2, 'items' => []],
			'entries' => [],
			'apporderSynced' => false,
		]);
		$request = $this->createMock(IRequest::class);
		$request->method('getParam')->with('layout')->willReturn([
			'version' => 1,
			'revision' => 1,
			'items' => [],
		]);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$c = new ApiController('homecheck', $request, $session, $this->createMock(IGroupManager::class), $layouts);
		$res = $c->putLayout();
		$this->assertSame(Http::STATUS_BAD_GATEWAY, $res->getStatus());
		$this->assertTrue($res->getData()['ok']);
		$this->assertSame('apporder_sync_failed', $res->getData()['data']['warning']);
	}

	public function testSyncAppOrderSuccess(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$layouts->method('resyncAppOrderForUser')->willReturn([
			'apporderSynced' => true,
			'layout' => ['version' => 1, 'revision' => 2, 'items' => []],
		]);
		$request = $this->createMock(IRequest::class);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$c = new ApiController('homecheck', $request, $session, $this->createMock(IGroupManager::class), $layouts);
		$res = $c->syncAppOrder();
		$this->assertSame(200, $res->getStatus());
		$this->assertTrue($res->getData()['data']['apporderSynced']);
	}

	public function testSyncAppOrderFailReturns502(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$layouts->method('resyncAppOrderForUser')->willReturn([
			'apporderSynced' => false,
			'layout' => ['version' => 1, 'revision' => 2, 'items' => []],
		]);
		$request = $this->createMock(IRequest::class);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$c = new ApiController('homecheck', $request, $session, $this->createMock(IGroupManager::class), $layouts);
		$res = $c->syncAppOrder();
		$this->assertSame(Http::STATUS_BAD_GATEWAY, $res->getStatus());
		$this->assertSame('apporder_sync_failed', $res->getData()['data']['warning']);
	}

	public function testDefaultLandingRequiresParams(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn([]);
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($this->user());
		$c = new ApiController('homecheck', $request, $session, $this->createMock(IGroupManager::class), $layouts);
		$res = $c->defaultLanding();
		$this->assertSame(400, $res->getStatus());
		$this->assertSame('validation_failed', $res->getData()['error']['code']);
	}

	public function testAdminTemplateForbiddenForNonAdmin(): void
	{
		$layouts = $this->createMock(LayoutService::class);
		$c = $this->controller($layouts, $this->user(), false);
		$res = $c->getAdminTemplate();
		$this->assertSame(403, $res->getStatus());
	}
}
