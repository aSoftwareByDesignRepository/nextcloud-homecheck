<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

use OCP\IURLGenerator;

/**
 * Defense-in-depth launch/icon URLs:
 * - relative same-origin paths (/…)
 * - absolute http(s) only when full origin (scheme+host+port) matches Nextcloud
 * Blocks javascript:, data:, protocol-relative //, and foreign origins.
 */
final class NavigationHrefGuard
{
	public function __construct(
		private readonly ?IURLGenerator $urlGenerator = null,
	) {
	}

	public function isSafe(string $href): bool
	{
		$href = trim($href);
		if ($href === '') {
			return false;
		}
		if (str_starts_with($href, '/')) {
			return !str_starts_with($href, '//');
		}
		if (preg_match('#^https?://#i', $href) !== 1) {
			return false;
		}
		$allowedOrigin = $this->allowedOrigin();
		if ($allowedOrigin === null) {
			return false;
		}
		$parts = parse_url($href);
		if (!is_array($parts)) {
			return false;
		}
		$hrefOrigin = $this->originFromParts($parts);
		return $hrefOrigin !== null && strcasecmp($hrefOrigin, $allowedOrigin) === 0;
	}

	public function filter(string $href): ?string
	{
		return $this->isSafe($href) ? $href : null;
	}

	private function allowedOrigin(): ?string
	{
		if ($this->urlGenerator === null) {
			return null;
		}
		try {
			$abs = $this->urlGenerator->getAbsoluteURL('/');
		} catch (\Throwable) {
			return null;
		}
		$parts = parse_url($abs);
		if (!is_array($parts)) {
			return null;
		}
		return $this->originFromParts($parts);
	}

	/**
	 * @param array<string,mixed> $parts
	 */
	private function originFromParts(array $parts): ?string
	{
		$scheme = strtolower((string)($parts['scheme'] ?? ''));
		$host = strtolower((string)($parts['host'] ?? ''));
		if ($host === '' || !in_array($scheme, ['http', 'https'], true)) {
			return null;
		}
		$defaultPort = $scheme === 'https' ? 443 : 80;
		$port = isset($parts['port']) ? (int)$parts['port'] : $defaultPort;
		$portPart = ($port === $defaultPort) ? '' : ':' . $port;
		return $scheme . '://' . $host . $portPart;
	}
}
