<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Repair\UninstallCleanup;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

final class UninstallCleanupTest extends TestCase
{
	public function testRunDeletesPrefsAndStripsDefaultApp(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->expects($this->once())->method('deleteAppValues')->with(Application::APP_ID);
		$config->expects($this->once())->method('setUserValue')
			->with('alice', 'core', 'defaultapp', 'files');

		$deleteQb = $this->createMock(IQueryBuilder::class);
		$deleteQb->method('delete')->willReturnSelf();
		$deleteQb->method('where')->willReturnSelf();
		$deleteQb->method('expr')->willReturn(new class {
			public function eq($a, $b) { return 'eq'; }
		});
		$deleteQb->method('createNamedParameter')->willReturnArgument(0);
		$deleteQb->expects($this->once())->method('executeStatement')->willReturn(3);

		$selectQb = $this->createMock(IQueryBuilder::class);
		$selectQb->method('select')->willReturnSelf();
		$selectQb->method('from')->willReturnSelf();
		$selectQb->method('where')->willReturnSelf();
		$selectQb->method('andWhere')->willReturnSelf();
		$selectQb->method('expr')->willReturn(new class {
			public function eq($a, $b) { return 'eq'; }
		});
		$selectQb->method('createNamedParameter')->willReturnArgument(0);
		$result = $this->createMock(IResult::class);
		$result->method('fetch')->willReturnOnConsecutiveCalls(
			['userid' => 'alice', 'configvalue' => 'homecheck,files'],
			['userid' => 'bob', 'configvalue' => 'files'],
			false,
		);
		$result->expects($this->once())->method('closeCursor');
		$selectQb->method('executeQuery')->willReturn($result);

		$db = $this->createMock(IDBConnection::class);
		$db->method('getQueryBuilder')->willReturnOnConsecutiveCalls($deleteQb, $selectQb);

		$output = $this->createMock(IOutput::class);
		$output->expects($this->once())->method('info');

		$step = new UninstallCleanup($db, $config);
		$step->run($output);
	}
}
