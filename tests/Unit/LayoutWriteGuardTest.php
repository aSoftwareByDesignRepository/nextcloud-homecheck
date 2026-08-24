<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Service\LayoutService;
use OCA\HomeCheck\Service\LayoutWriteGuard;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;

/**
 * Contract: CAS must lock preferences, compare expected raw, and refuse mismatched writes.
 */
final class LayoutWriteGuardTest extends TestCase
{
	public function testCompareAndSwapRejectsMismatchedExpected(): void
	{
		if (!interface_exists(IQueryBuilder::class)) {
			$this->markTestSkipped('OCP QueryBuilder stubs not on host classpath');
		}

		$result = $this->createMock(IResult::class);
		$result->method('fetch')->willReturn(['configvalue' => '{"version":1,"revision":3}']);
		$result->method('closeCursor');

		$expr = $this->createMock(IExpressionBuilder::class);
		$expr->method('eq')->willReturn('eq');

		$qb = $this->createMock(IQueryBuilder::class);
		$qb->method('select')->willReturnSelf();
		$qb->method('from')->willReturnSelf();
		$qb->method('where')->willReturnSelf();
		$qb->method('andWhere')->willReturnSelf();
		$qb->method('createNamedParameter')->willReturnArgument(0);
		$qb->method('expr')->willReturn($expr);
		$qb->method('getSQL')->willReturn('SELECT configvalue FROM preferences');
		$qb->method('getParameters')->willReturn([]);
		$qb->method('getParameterTypes')->willReturn([]);

		$db = $this->createMock(IDBConnection::class);
		$db->expects($this->once())->method('beginTransaction');
		$db->expects($this->once())->method('rollBack');
		$db->expects($this->never())->method('commit');
		$db->method('getQueryBuilder')->willReturn($qb);
		$db->method('executeQuery')->willReturn($result);
		$db->method('inTransaction')->willReturn(true);

		$guard = new LayoutWriteGuard($db);
		$ok = $guard->compareAndSwap(
			'alice',
			'{"version":1,"revision":2}',
			'{"version":1,"revision":3,"items":[]}',
		);
		$this->assertFalse($ok);
	}

	public function testCompareAndSwapInsertsWhenAbsent(): void
	{
		if (!interface_exists(IQueryBuilder::class)) {
			$this->markTestSkipped('OCP QueryBuilder stubs not on host classpath');
		}

		$result = $this->createMock(IResult::class);
		$result->method('fetch')->willReturn(false);
		$result->method('closeCursor');

		$expr = $this->createMock(IExpressionBuilder::class);
		$expr->method('eq')->willReturn('eq');

		$selectQb = $this->createMock(IQueryBuilder::class);
		$selectQb->method('select')->willReturnSelf();
		$selectQb->method('from')->willReturnSelf();
		$selectQb->method('where')->willReturnSelf();
		$selectQb->method('andWhere')->willReturnSelf();
		$selectQb->method('createNamedParameter')->willReturnArgument(0);
		$selectQb->method('expr')->willReturn($expr);
		$selectQb->method('getSQL')->willReturn('SELECT configvalue FROM preferences');
		$selectQb->method('getParameters')->willReturn([]);
		$selectQb->method('getParameterTypes')->willReturn([]);

		$insertQb = $this->createMock(IQueryBuilder::class);
		$insertQb->method('insert')->with('preferences')->willReturnSelf();
		$insertQb->method('values')->willReturnSelf();
		$insertQb->method('createNamedParameter')->willReturnArgument(0);
		$insertQb->method('executeStatement')->willReturn(1);

		$db = $this->createMock(IDBConnection::class);
		$db->expects($this->once())->method('beginTransaction');
		$db->expects($this->once())->method('commit');
		$db->expects($this->never())->method('rollBack');
		$db->method('getQueryBuilder')->willReturnOnConsecutiveCalls($selectQb, $insertQb);
		$db->method('executeQuery')->willReturn($result);

		$guard = new LayoutWriteGuard($db);
		$ok = $guard->compareAndSwap('bob', null, '{"version":1,"revision":1,"items":[]}');
		$this->assertTrue($ok);
		$this->assertSame('homecheck', Application::APP_ID);
		$this->assertSame('layout_v1', LayoutService::USER_LAYOUT_KEY);
	}
}
