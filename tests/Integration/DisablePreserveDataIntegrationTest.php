<?php

declare(strict_types=1);

namespace OCA\HomeCheck\Tests\Integration;

use OCA\HomeCheck\Repair\UninstallDropTables;
use OCP\App\IAppManager;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use Test\TestCase;

/**
 * HomeCheck owns no DB tables; the disable-preserves-data contract covers app
 * config + user preferences (UninstallCleanup wipes them on real removal).
 * Verifies disable keeps them and re-enable via installApp keeps data intact.
 */
final class DisablePreserveDataIntegrationTest extends TestCase
{
	private const MARKER_KEY = 'disable_preserve_marker';

	protected function setUp(): void
	{
		parent::setUp();

		/** @var IAppManager $appManager */
		$appManager = \OC::$server->get(IAppManager::class);
		if (!$appManager->isEnabledForUser(UninstallDropTables::APP_ID)) {
			$installer = \OC::$server->get(\OC\Installer::class);
			$installer->installApp(UninstallDropTables::APP_ID);
			$appManager->enableApp(UninstallDropTables::APP_ID);
		}
	}

	public function testDisableThenReEnablePreservesCoreTable(): void
	{
		/** @var IConfig $config */
		$config = \OC::$server->get(IConfig::class);
		$config->setAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, 'kept');

		/** @var IAppManager $appManager */
		$appManager = \OC::$server->get(IAppManager::class);
		$appManager->disableApp(UninstallDropTables::APP_ID);

		self::assertSame(
			'kept',
			$config->getAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, ''),
			'disable must not delete app config (auto-disable / manual disable)',
		);

		$installer = \OC::$server->get(\OC\Installer::class);
		$installer->installApp(UninstallDropTables::APP_ID);
		$appManager->enableApp(UninstallDropTables::APP_ID);

		self::assertSame(
			'kept',
			$config->getAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, ''),
			're-enable after disable must keep existing config',
		);

		$config->deleteAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY);
	}

	public function testAutoDisablePreservesTables(): void
	{
		/** @var IConfig $config */
		$config = \OC::$server->get(IConfig::class);
		$config->setAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, 'kept');

		/** @var IAppManager $appManager */
		$appManager = \OC::$server->get(IAppManager::class);
		$appManager->disableApp(UninstallDropTables::APP_ID, true);
		self::assertSame(
			'kept',
			$config->getAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, ''),
			'auto-disable during server upgrade must preserve app config',
		);

		$installer = \OC::$server->get(\OC\Installer::class);
		$installer->installApp(UninstallDropTables::APP_ID);
		$appManager->enableApp(UninstallDropTables::APP_ID);

		$config->deleteAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY);
	}

	public function testDoubleDisablePreservesTables(): void
	{
		/** @var IConfig $config */
		$config = \OC::$server->get(IConfig::class);
		$config->setAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, 'kept');

		/** @var IAppManager $appManager */
		$appManager = \OC::$server->get(IAppManager::class);
		$appManager->disableApp(UninstallDropTables::APP_ID);

		// Nextcloud runs uninstall repair on every disableApp() call (no enabled guard).
		$appManager->disableApp(UninstallDropTables::APP_ID);
		self::assertSame(
			'kept',
			$config->getAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY, ''),
			'second disable must not wipe config (upgrade / repeated disable scenario)',
		);

		$installer = \OC::$server->get(\OC\Installer::class);
		$installer->installApp(UninstallDropTables::APP_ID);
		$appManager->enableApp(UninstallDropTables::APP_ID);

		$config->deleteAppValue(UninstallDropTables::APP_ID, self::MARKER_KEY);
	}

	public function testUninstallRepairStepResolvesFromContainer(): void
	{
		/** @var UninstallDropTables $step */
		$step = \OC::$server->get(UninstallDropTables::class);
		self::assertInstanceOf(UninstallDropTables::class, $step);

		$output = $this->createMock(IOutput::class);
		$output->method('info');
		$step->run($output);
		$this->addToAssertionCount(1);
	}

	protected function tearDown(): void
	{
		/** @var IAppManager $appManager */
		$appManager = \OC::$server->get(IAppManager::class);
		if (!$appManager->isEnabledForUser(UninstallDropTables::APP_ID)) {
			$installer = \OC::$server->get(\OC\Installer::class);
			$installer->installApp(UninstallDropTables::APP_ID);
			$appManager->enableApp(UninstallDropTables::APP_ID);
		}
		parent::tearDown();
	}
}
