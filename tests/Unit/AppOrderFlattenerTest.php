<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Service\AppOrderFlattener;
use PHPUnit\Framework\TestCase;

final class AppOrderFlattenerTest extends TestCase
{
	public function testFlattensFoldersInPlace(): void
	{
		$f = new AppOrderFlattener();
		$out = $f->flatten([
			'items' => [
				['type' => 'app', 'id' => 'dashboard'],
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['files', 'calendar']],
				['type' => 'app', 'id' => 'homecheck'],
			],
		], [
			'dashboard' => ['id' => 'dashboard', 'app' => 'dashboard'],
			'files' => ['id' => 'files', 'app' => 'files'],
			'calendar' => ['id' => 'calendar', 'app' => 'calendar'],
			'homecheck' => ['id' => 'homecheck', 'app' => 'homecheck'],
		]);

		$this->assertSame([
			'dashboard' => ['order' => 1, 'app' => 'dashboard'],
			'files' => ['order' => 2, 'app' => 'files'],
			'calendar' => ['order' => 3, 'app' => 'calendar'],
			'homecheck' => ['order' => 4, 'app' => 'homecheck'],
		], $out);
		$this->assertArrayNotHasKey('fld_abcdefgh', $out);
	}

	public function testSkipsUnknownAndDuplicates(): void
	{
		$f = new AppOrderFlattener();
		$out = $f->flatten([
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'app', 'id' => 'ghost'],
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'X', 'children' => ['files', 'calendar']],
			],
		], [
			'files' => ['id' => 'files', 'app' => 'files'],
			'calendar' => ['id' => 'calendar', 'app' => 'calendar'],
		]);
		$this->assertSame(1, $out['files']['order']);
		$this->assertSame(2, $out['calendar']['order']);
		$this->assertCount(2, $out);
	}
}
