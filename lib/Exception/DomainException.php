<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Exception;

use Exception;

class DomainException extends Exception
{
	/**
	 * @param array<string,mixed>|null $payload Optional structured payload (e.g. server layout on 409)
	 */
	public function __construct(
		public readonly string $errorCode,
		string $message = '',
		public readonly int $httpStatus = 400,
		public readonly ?array $payload = null,
	) {
		parent::__construct($message !== '' ? $message : $errorCode, $httpStatus);
	}
}
