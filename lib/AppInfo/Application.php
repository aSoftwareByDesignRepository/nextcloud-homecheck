<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\AppInfo;

use OCA\HomeCheck\Dashboard\LauncherWidget;
use OCA\HomeCheck\Repair\UninstallCleanup;
use OCA\HomeCheck\Service\ILayoutWriteGuard;
use OCA\HomeCheck\Service\LayoutWriteGuard;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\IConfig;
use OCP\IDBConnection;

class Application extends App implements IBootstrap
{
	public const APP_ID = 'homecheck';

	public function __construct()
	{
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void
	{
		$context->registerService(UninstallCleanup::class, function ($c): UninstallCleanup {
			return new UninstallCleanup(
				$c->get(IDBConnection::class),
				$c->get(IConfig::class),
			);
		});
		$context->registerService(LayoutWriteGuard::class, function ($c): LayoutWriteGuard {
			return new LayoutWriteGuard($c->get(IDBConnection::class));
		});
		$context->registerService(ILayoutWriteGuard::class, function ($c): ILayoutWriteGuard {
			return $c->get(LayoutWriteGuard::class);
		});
		$context->registerDashboardWidget(LauncherWidget::class);
	}

	public function boot(IBootContext $context): void
	{
	}
}
