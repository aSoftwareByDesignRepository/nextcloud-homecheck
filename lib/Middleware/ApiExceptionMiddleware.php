<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Catch-all JSON envelope for HomeCheck API routes. Without this, unexpected
 * storage/runtime failures bubble to core and render an HTML 500 error page
 * on /api/* endpoints — clients (and the Atlas contract) require a JSON
 * {ok:false, error:{code,message}} envelope for every non-2xx.
 */

namespace OCA\HomeCheck\Middleware;

use OCA\HomeCheck\Controller\ApiController;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Middleware;
use Psr\Log\LoggerInterface;

class ApiExceptionMiddleware extends Middleware
{
	public function __construct(
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * @param Controller $controller
	 */
	public function afterException($controller, $methodName, \Exception $exception): JSONResponse
	{
		if (!($controller instanceof ApiController)) {
			throw $exception;
		}
		$this->logger->error('HomeCheck API request failed', [
			'app' => 'homecheck',
			'exception' => $exception,
		]);
		return new JSONResponse([
			'ok' => false,
			'error' => [
				'code' => 'internal_error',
				'message' => 'Internal error',
			],
		], Http::STATUS_INTERNAL_SERVER_ERROR);
	}
}
