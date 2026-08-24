<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Controller;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;

trait ApiJsonTrait
{
	protected function ok(mixed $data = null, int $status = Http::STATUS_OK): JSONResponse
	{
		return new JSONResponse(['ok' => true, 'data' => $data], $status);
	}

	/**
	 * @param array<string,mixed>|null $payload
	 */
	protected function fail(string $code, int $status, ?string $message = null, ?array $payload = null): JSONResponse
	{
		$body = [
			'ok' => false,
			'error' => [
				'code' => $code,
				'message' => $message ?? $code,
			],
		];
		if ($payload !== null) {
			$body['data'] = $payload;
		}
		return new JSONResponse($body, $status);
	}
}
