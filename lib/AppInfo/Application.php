<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\AppInfo;

use OCA\HomeCheck\Dashboard\LauncherWidget;
use OCA\HomeCheck\Middleware\ApiExceptionMiddleware;
use OCA\HomeCheck\Repair\UninstallCleanup;
use OCA\HomeCheck\Repair\UninstallDropTables;
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
		$context->registerService(UninstallDropTables::class, function ($c): UninstallDropTables {
			return new UninstallDropTables(
				$c->get(IDBConnection::class),
				$c->get(IConfig::class),
				$c->get(\OCP\Files\IRootFolder::class),
			);
		});
		$context->registerService(LayoutWriteGuard::class, function ($c): LayoutWriteGuard {
			return new LayoutWriteGuard($c->get(IDBConnection::class));
		});
		$context->registerService(ILayoutWriteGuard::class, function ($c): ILayoutWriteGuard {
			return $c->get(LayoutWriteGuard::class);
		});
		$context->registerMiddleware(ApiExceptionMiddleware::class);
		$context->registerDashboardWidget(LauncherWidget::class);

		// ── Config & data transfer (test → production) ──────────────────
		$context->registerService(\OCA\HomeCheck\ConfigTransfer\TransferManifest::class, fn () => new \OCA\HomeCheck\ConfigTransfer\TransferManifest());
		$context->registerService(\OCA\HomeCheck\ConfigTransfer\TransferHooks::class, function ($c): \OCA\HomeCheck\ConfigTransfer\TransferHooks {
			return new \OCA\HomeCheck\ConfigTransfer\TransferHooks(
				$c->get(\OCA\HomeCheck\Service\LayoutValidator::class),
				$c->get(\OCP\IGroupManager::class),
				$c->get(\Psr\Log\LoggerInterface::class),
			);
		});
		$context->registerService(\OCA\HomeCheck\ConfigTransfer\TransferPendingStore::class, fn ($c) => new \OCA\HomeCheck\ConfigTransfer\TransferPendingStore($c->get(\OCP\Files\IRootFolder::class), $c->get(IConfig::class), 'homecheck'));
		$context->registerService(\OCA\HomeCheck\ConfigTransfer\TransferReceiptStore::class, fn ($c) => new \OCA\HomeCheck\ConfigTransfer\TransferReceiptStore($c->get(IConfig::class), 'homecheck'));
		$context->registerService(\OCA\HomeCheck\ConfigTransfer\TransferService::class, function ($c): \OCA\HomeCheck\ConfigTransfer\TransferService {
			return new \OCA\HomeCheck\ConfigTransfer\TransferService(
				$c->get(IDBConnection::class),
				$c->get(IConfig::class),
				$c->get(\OCP\IUserManager::class),
				$c->get(\OCP\IGroupManager::class),
				$c->get(\OCP\Files\IRootFolder::class),
				$c->get(\OCP\App\IAppManager::class),
				$c->get(\OCP\Lock\ILockingProvider::class),
				$c->get(\OCP\IURLGenerator::class),
				$c->get(\Psr\Log\LoggerInterface::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferManifest::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferHooks::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferPendingStore::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferReceiptStore::class),
				'homecheck',
				$c->get(\OCP\IAppConfig::class),
			);
		});
		$context->registerService(\OCA\HomeCheck\BackgroundJob\TransferApplyJob::class, function ($c): \OCA\HomeCheck\BackgroundJob\TransferApplyJob {
			return new \OCA\HomeCheck\BackgroundJob\TransferApplyJob(
				$c->get(\OCP\AppFramework\Utility\ITimeFactory::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferService::class),
				$c->get(\OCP\Lock\ILockingProvider::class),
				$c->get(\OCP\BackgroundJob\IJobList::class),
				$c->get(\Psr\Log\LoggerInterface::class),
			);
		});
		$context->registerService(\OCA\HomeCheck\Controller\TransferApiController::class, function ($c): \OCA\HomeCheck\Controller\TransferApiController {
			return new \OCA\HomeCheck\Controller\TransferApiController(
				'homecheck',
				$c->get(\OCP\IRequest::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferHooks::class),
				$c->get(\OCA\HomeCheck\ConfigTransfer\TransferService::class),
				$c->get(\OCP\BackgroundJob\IJobList::class),
				$c->get(\OCP\Security\Bruteforce\IThrottler::class),
				$c->get(\OCP\IGroupManager::class),
				$c->get(\OCP\IUserSession::class),
			);
		});
	}

	public function boot(IBootContext $context): void
	{
	}
}
