<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

use OCA\HomeCheck\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\IURLGenerator;
use RuntimeException;

/**
 * Theme-safe HomeCheck icon URLs for header, dashboard, and notifications.
 *
 * - Header / app menu: white {@see app.svg}
 * - Dashboard / notifications: black {@see app-dashboard.svg} / {@see app-dark.svg}
 */
final class AppIconService
{
	/** Preferred order for main-background surfaces (dashboard, notifications). */
	private const SURFACE_CANDIDATES = ['app-dashboard.svg', 'app-dark.svg', 'app.svg'];

	public function __construct(
		private readonly IURLGenerator $urlGenerator,
		private readonly IAppManager $appManager,
	) {
	}

	/**
	 * Relative image path for Nextcloud header / app navigation entry (white glyph).
	 */
	public function headerIconPath(): string
	{
		return $this->withCacheBust(
			$this->urlGenerator->imagePath(Application::APP_ID, 'app.svg')
		);
	}

	/**
	 * Relative image path for dashboard widgets and notifications (dark glyph).
	 */
	public function surfaceIconPath(): string
	{
		foreach (self::SURFACE_CANDIDATES as $iconFile) {
			try {
				return $this->withCacheBust(
					$this->urlGenerator->imagePath(Application::APP_ID, $iconFile)
				);
			} catch (RuntimeException) {
				// Try next candidate.
			}
		}

		try {
			return $this->urlGenerator->imagePath('core', 'places/default-app-icon.svg');
		} catch (RuntimeException) {
			return '';
		}
	}

	/**
	 * Absolute URL for {@see \OCP\Dashboard\IIconWidget::getIconUrl()}.
	 */
	public function absoluteSurfaceIconUrl(): string
	{
		$path = $this->surfaceIconPath();
		if ($path === '') {
			return '';
		}
		return $this->urlGenerator->getAbsoluteURL($path);
	}

	private function withCacheBust(string $path): string
	{
		if ($path === '') {
			return '';
		}
		$version = $this->appManager->getAppVersion(Application::APP_ID);
		if ($version === '') {
			return $path;
		}
		$separator = str_contains($path, '?') ? '&' : '?';
		return $path . $separator . 'v=' . rawurlencode($version);
	}
}
