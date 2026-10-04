<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit\Middleware;

use OCA\HomeCheck\Controller\ApiController;
use OCA\HomeCheck\Middleware\ApiExceptionMiddleware;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Http;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class ApiExceptionMiddlewareTest extends TestCase
{
	private function apiController(): ApiController
	{
		return new ApiController(
			'homecheck',
			$this->createMock(IRequest::class),
			$this->createMock(IUserSession::class),
			$this->createMock(IGroupManager::class),
			$this->createMock(LayoutService::class),
		);
	}

	public function testApiExceptionSerializesToJsonEnvelope(): void
	{
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects($this->once())->method('error');
		$mw = new ApiExceptionMiddleware($logger);
		$res = $mw->afterException($this->apiController(), 'putLayout', new \RuntimeException('db gone'));
		$this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $res->getStatus());
		$data = $res->getData();
		$this->assertFalse($data['ok']);
		$this->assertSame('internal_error', $data['error']['code']);
		$this->assertArrayNotHasKey('trace', $data, 'envelope must not leak internals');
	}

	public function testNonApiControllerRethrows(): void
	{
		$mw = new ApiExceptionMiddleware($this->createMock(LoggerInterface::class));
		$other = new class('core', $this->createMock(IRequest::class)) extends \OCP\AppFramework\Controller {
		};
		$this->expectException(\RuntimeException::class);
		$mw->afterException($other, 'index', new \RuntimeException('nope'));
	}
}
