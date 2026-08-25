<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Repair;

use OCA\HomeCheck\AppInfo\Application;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * Remove AppHome preferences and app config on uninstall.
 * Strips `homecheck` from core/defaultapp so login is not broken.
 * Does not wipe core/apporder (last synced top-bar order stays).
 */
class UninstallCleanup implements IRepairStep
{
	public function __construct(
		private readonly IDBConnection $db,
		private readonly IConfig $config,
	) {
	}

	public function getName(): string
	{
		return 'Remove AppHome preferences and app config';
	}

	public function run(IOutput $output): void
	{
		$this->config->deleteAppValues(Application::APP_ID);

		$qb = $this->db->getQueryBuilder();
		$qb->delete('preferences')
			->where($qb->expr()->eq('appid', $qb->createNamedParameter(Application::APP_ID)));
		$deleted = $qb->executeStatement();

		$stripped = $this->stripFromDefaultApp();
		$output->info('AppHome: removed app config, ' . $deleted . ' preference row(s), stripped defaultapp for ' . $stripped . ' user(s)');
	}

	/**
	 * @return int Number of users whose defaultapp was updated
	 */
	public function stripFromDefaultApp(): int
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('userid', 'configvalue')
			->from('preferences')
			->where($qb->expr()->eq('appid', $qb->createNamedParameter('core')))
			->andWhere($qb->expr()->eq('configkey', $qb->createNamedParameter('defaultapp')));
		$result = $qb->executeQuery();
		$updated = 0;
		try {
			while ($row = $result->fetch()) {
				$uid = (string)($row['userid'] ?? '');
				$raw = (string)($row['configvalue'] ?? '');
				if ($uid === '' || $raw === '') {
					continue;
				}
				$parts = array_values(array_filter(array_map('trim', explode(',', $raw)), static fn (string $p): bool => $p !== ''));
				if (!in_array(Application::APP_ID, $parts, true)) {
					continue;
				}
				$next = array_values(array_filter($parts, static fn (string $p): bool => $p !== Application::APP_ID));
				$this->config->setUserValue($uid, 'core', 'defaultapp', implode(',', $next));
				$updated++;
			}
		} finally {
			$result->closeCursor();
		}
		return $updated;
	}
}
