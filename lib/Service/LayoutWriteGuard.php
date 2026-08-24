<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

use OCA\HomeCheck\AppInfo\Application;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;

/**
 * Atomic compare-and-swap for personal layout JSON in `preferences`.
 *
 * Optimistic revision checks alone are TOCTOU under concurrent PHP workers;
 * this guard serialises the RMW with SELECT … FOR UPDATE + conditional UPDATE/INSERT.
 * Reads also go through the DB so IConfig preference caches cannot stale the CAS expected value.
 */
final class LayoutWriteGuard implements ILayoutWriteGuard
{
	public function __construct(
		private readonly IDBConnection $db,
	) {
	}

	public function readRaw(string $uid): ?string
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('configvalue')
			->from('preferences')
			->where($qb->expr()->eq('userid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('appid', $qb->createNamedParameter(Application::APP_ID)))
			->andWhere($qb->expr()->eq('configkey', $qb->createNamedParameter(LayoutService::USER_LAYOUT_KEY)));
		$result = $qb->executeQuery();
		try {
			$row = $result->fetch();
			if ($row === false) {
				return null;
			}
			$val = (string)($row['configvalue'] ?? '');
			return $val === '' ? null : $val;
		} finally {
			$result->closeCursor();
		}
	}

	/**
	 * Replace layout raw JSON only if the locked row still matches $expectedRaw.
	 * Pass null/'' expected when the preference must be absent or empty.
	 */
	public function compareAndSwap(string $uid, ?string $expectedRaw, string $newRaw): bool
	{
		$expected = $this->normalize($expectedRaw);
		$this->db->beginTransaction();
		try {
			$current = $this->normalize($this->fetchForUpdate($uid));
			if ($current !== $expected) {
				$this->db->rollBack();
				return false;
			}

			if ($current === null) {
				if (!$this->insertPreference($uid, $newRaw)) {
					$this->db->rollBack();
					return false;
				}
			} elseif (!$this->updatePreference($uid, $current, $newRaw)) {
				$this->db->rollBack();
				return false;
			}

			$this->db->commit();
			return true;
		} catch (\Throwable $e) {
			if ($this->db->inTransaction()) {
				$this->db->rollBack();
			}
			if ($this->isUniqueViolation($e)) {
				return false;
			}
			throw $e;
		}
	}

	private function normalize(?string $raw): ?string
	{
		if ($raw === null || $raw === '') {
			return null;
		}
		return $raw;
	}

	private function fetchForUpdate(string $uid): ?string
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('configvalue')
			->from('preferences')
			->where($qb->expr()->eq('userid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('appid', $qb->createNamedParameter(Application::APP_ID)))
			->andWhere($qb->expr()->eq('configkey', $qb->createNamedParameter(LayoutService::USER_LAYOUT_KEY)));
		$sql = $qb->getSQL() . ' FOR UPDATE';
		$result = $this->db->executeQuery($sql, $qb->getParameters(), $qb->getParameterTypes());
		try {
			$row = $result->fetch();
			if ($row === false) {
				return null;
			}
			$val = (string)($row['configvalue'] ?? '');
			return $val === '' ? null : $val;
		} finally {
			$result->closeCursor();
		}
	}

	private function insertPreference(string $uid, string $newRaw): bool
	{
		try {
			$qb = $this->db->getQueryBuilder();
			$qb->insert('preferences')
				->values([
					'userid' => $qb->createNamedParameter($uid),
					'appid' => $qb->createNamedParameter(Application::APP_ID),
					'configkey' => $qb->createNamedParameter(LayoutService::USER_LAYOUT_KEY),
					'configvalue' => $qb->createNamedParameter($newRaw),
				]);
			return $qb->executeStatement() === 1;
		} catch (\Throwable $e) {
			if ($this->isUniqueViolation($e)) {
				return false;
			}
			throw $e;
		}
	}

	private function updatePreference(string $uid, string $expected, string $newRaw): bool
	{
		$qb = $this->db->getQueryBuilder();
		$qb->update('preferences')
			->set('configvalue', $qb->createNamedParameter($newRaw))
			->where($qb->expr()->eq('userid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->eq('appid', $qb->createNamedParameter(Application::APP_ID)))
			->andWhere($qb->expr()->eq('configkey', $qb->createNamedParameter(LayoutService::USER_LAYOUT_KEY)))
			->andWhere($qb->expr()->eq('configvalue', $qb->createNamedParameter($expected)));
		return $qb->executeStatement() === 1;
	}

	private function isUniqueViolation(\Throwable $e): bool
	{
		if ($e instanceof DbException && $e->getReason() === DbException::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
			return true;
		}
		$msg = strtolower($e->getMessage());
		return str_contains($msg, 'unique') || str_contains($msg, 'duplicate');
	}
}
