<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\LayoutValidator;
use PHPUnit\Framework\TestCase;

final class LayoutValidatorTest extends TestCase
{
	private LayoutValidator $v;

	protected function setUp(): void
	{
		$this->v = new LayoutValidator();
	}

	public function testValidAppAndFolder(): void
	{
		$out = $this->v->validate([
			'version' => 1,
			'revision' => 3,
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['calendar']],
			],
		]);
		$this->assertSame(1, $out['version']);
		$this->assertSame(3, $out['revision']);
		$this->assertCount(2, $out['items']);
		$this->assertSame(['calendar'], $out['items'][1]['children']);
		$this->assertSame([], $out['hidden']);
		$this->assertSame([], $out['hiddenFolders']);
	}

	public function testAcceptsHiddenApps(): void
	{
		$out = $this->v->validate([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
			'hidden' => ['calendar', 'dashboard'],
		]);
		$this->assertSame(['calendar', 'dashboard'], $out['hidden']);
		$this->assertSame([], $out['hiddenFolders']);
	}

	public function testAcceptsHiddenFolders(): void
	{
		$out = $this->v->validate([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
			'hiddenFolders' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['calendar']],
			],
		]);
		$this->assertCount(1, $out['hiddenFolders']);
		$this->assertSame(['calendar'], $out['hiddenFolders'][0]['children']);
	}

	public function testRejectsHiddenAlsoOnHome(): void
	{
		$this->expectException(DomainException::class);
		$this->expectExceptionMessageMatches('/Hidden app also on home/i');
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
			'hidden' => ['files'],
		]);
	}

	public function testRejectsDuplicateApp(): void
	{
		$this->expectException(DomainException::class);
		$this->expectExceptionMessageMatches('/duplicate/i');
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'app', 'id' => 'files'],
			],
		]);
	}

	public function testRejectsAppAlsoInFolder(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'X', 'children' => ['files']],
			],
		]);
	}

	public function testRejectsNestedFolderIdAsChild(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'X', 'children' => ['fld_12345678']],
			],
		]);
	}

	public function testRejectsBadFolderNameHtml(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validateFolderName('<script>x</script>');
	}

	public function testRejectsEmptyFolderName(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validateFolderName('   ');
	}

	public function testRejectsTooLongName(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validateFolderName(str_repeat('a', 41));
	}

	public function testAcceptsBoundaryNameLength(): void
	{
		$name = str_repeat('ä', 40);
		$this->assertSame($name, $this->v->validateFolderName($name));
	}

	public function testRejectsBadFolderId(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [
				['type' => 'folder', 'id' => 'bad', 'name' => 'X', 'children' => []],
			],
		]);
	}

	public function testRejectsWrongVersion(): void
	{
		$this->expectException(DomainException::class);
		$this->v->validate(['version' => 2, 'revision' => 0, 'items' => []]);
	}

	public function testRejectsTooManyItems(): void
	{
		$items = [];
		for ($i = 0; $i < LayoutValidator::MAX_ITEMS + 1; $i++) {
			$items[] = ['type' => 'app', 'id' => 'app' . $i];
		}
		$this->expectException(DomainException::class);
		$this->v->validate(['version' => 1, 'revision' => 0, 'items' => $items]);
	}

	public function testSeedModeZerosRevision(): void
	{
		$out = $this->v->validate([
			'version' => 1,
			'revision' => 99,
			'items' => [],
		], false);
		$this->assertSame(0, $out['revision']);
	}

	public function testRejectsOversizedJsonPayload(): void
	{
		$this->expectException(DomainException::class);
		$this->expectExceptionMessageMatches('/size limit/i');
		$this->v->validate([
			'version' => 1,
			'revision' => 0,
			'items' => [],
			'pad' => str_repeat('x', LayoutValidator::MAX_JSON_BYTES),
		]);
	}
}
