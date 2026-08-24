<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Settings;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings
{
	public function __construct(
		private readonly LayoutService $layouts,
	) {
	}

	public function getForm(): TemplateResponse
	{
		Util::addScript(Application::APP_ID, 'admin');
		Util::addStyle(Application::APP_ID, 'app');
		return new TemplateResponse(Application::APP_ID, 'admin', [
			'template' => $this->layouts->getAdminTemplate(),
		]);
	}

	public function getSection(): string
	{
		return 'additional';
	}

	public function getPriority(): int
	{
		return 80;
	}
}
