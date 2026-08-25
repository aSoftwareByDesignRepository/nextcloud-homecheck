<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Tests\Unit;

use OCA\HomeCheck\Service\LayoutMerger;
use PHPUnit\Framework\TestCase;

final class LayoutMergerTest extends TestCase
{
	private LayoutMerger $m;

	protected function setUp(): void
	{
		$this->m = new LayoutMerger();
	}

	public function testAppendsMissingLiveAppsSortedByOrder(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 2,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
		], [
			['id' => 'files', 'order' => 1],
			['id' => 'calendar', 'order' => 5],
			['id' => 'dashboard', 'order' => 2],
		]);

		$ids = array_map(static fn (array $i) => $i['type'] === 'app' ? $i['id'] : null, $merged['items']);
		$this->assertSame(['files', 'dashboard', 'calendar'], array_values(array_filter($ids)));
		$this->assertTrue($merged['changed']);
		$this->assertSame(2, $merged['revision']);
	}

	public function testDropsDisabledAppsKeepsEmptyFolder(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Gone', 'children' => ['oldapp']],
				['type' => 'app', 'id' => 'files'],
			],
		], [
			['id' => 'files', 'order' => 1],
		]);

		$this->assertCount(2, $merged['items']);
		$this->assertSame('folder', $merged['items'][0]['type']);
		$this->assertSame([], $merged['items'][0]['children']);
		$this->assertTrue($merged['changed']);
	}

	public function testNullStoredBuildsFromLive(): void
	{
		$merged = $this->m->merge(null, [
			['id' => 'b', 'order' => 2],
			['id' => 'a', 'order' => 1],
		]);
		$this->assertSame(['a', 'b'], array_column($merged['items'], 'id'));
		$this->assertTrue($merged['changed']);
	}

	public function testNoChangeWhenStable(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 4,
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'app', 'id' => 'calendar'],
			],
			'hidden' => [],
		], [
			['id' => 'files', 'order' => 1],
			['id' => 'calendar', 'order' => 2],
		]);
		$this->assertFalse($merged['changed']);
		$this->assertSame([], $merged['hidden']);
	}

	public function testHiddenAppsAreNotReAppended(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 2,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
			'hidden' => ['calendar', 'dashboard'],
		], [
			['id' => 'files', 'order' => 1],
			['id' => 'calendar', 'order' => 5],
			['id' => 'dashboard', 'order' => 2],
		]);

		$this->assertCount(1, $merged['items']);
		$this->assertSame('files', $merged['items'][0]['id']);
		$this->assertSame(['calendar', 'dashboard'], $merged['hidden']);
		$this->assertFalse($merged['changed']);
	}

	public function testHiddenDropsUninstalledAndStripsFromItems(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'app', 'id' => 'files'],
				['type' => 'app', 'id' => 'calendar'],
			],
			'hidden' => ['calendar', 'gone'],
		], [
			['id' => 'files', 'order' => 1],
			['id' => 'calendar', 'order' => 2],
		]);

		$this->assertCount(1, $merged['items']);
		$this->assertSame('files', $merged['items'][0]['id']);
		$this->assertSame(['calendar'], $merged['hidden']);
		$this->assertTrue($merged['changed']);
	}

	public function testHiddenFoldersKeepChildrenOffHome(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 3,
			'items' => [
				['type' => 'app', 'id' => 'files'],
			],
			'hidden' => [],
			'hiddenFolders' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => 'Work', 'children' => ['calendar', 'mail']],
			],
		], [
			['id' => 'files', 'order' => 1],
			['id' => 'calendar', 'order' => 2],
			['id' => 'mail', 'order' => 3],
		]);

		$this->assertCount(1, $merged['items']);
		$this->assertSame('files', $merged['items'][0]['id']);
		$this->assertCount(1, $merged['hiddenFolders']);
		$this->assertSame(['calendar', 'mail'], $merged['hiddenFolders'][0]['children']);
		$this->assertFalse($merged['changed']);
	}

	public function testInvalidFolderIdDropsFolderAndRequeuesChildren(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'folder', 'id' => '', 'name' => 'Broken', 'children' => ['files']],
			],
		], [
			['id' => 'files', 'order' => 1],
		]);
		$this->assertTrue($merged['changed']);
		$this->assertCount(1, $merged['items']);
		$this->assertSame('app', $merged['items'][0]['type']);
		$this->assertSame('files', $merged['items'][0]['id']);
	}

	public function testCapsAppendedMissingAtMaxItems(): void
	{
		$storedItems = [];
		for ($i = 0; $i < 98; $i++) {
			$storedItems[] = [
				'type' => 'folder',
				'id' => 'fld_' . str_pad((string)$i, 8, '0', STR_PAD_LEFT),
				'name' => 'F' . $i,
				'children' => [],
			];
		}
		$storedItems[] = ['type' => 'app', 'id' => 'files'];
		$live = [['id' => 'files', 'order' => 1]];
		for ($i = 0; $i < 10; $i++) {
			$live[] = ['id' => 'extra' . $i, 'order' => 10 + $i];
		}
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 1,
			'items' => $storedItems,
		], $live, 100);
		$this->assertCount(100, $merged['items']);
		$this->assertTrue($merged['changed']);
		$appIds = [];
		foreach ($merged['items'] as $item) {
			if (($item['type'] ?? '') === 'app') {
				$appIds[] = $item['id'];
			}
		}
		$this->assertContains('files', $appIds);
		$this->assertContains('extra0', $appIds);
		$this->assertNotContains('extra9', $appIds);
	}

	public function testReplacesHostileFolderNames(): void
	{
		$merged = $this->m->merge([
			'version' => 1,
			'revision' => 1,
			'items' => [
				['type' => 'folder', 'id' => 'fld_abcdefgh', 'name' => '<script>x</script>', 'children' => []],
			],
		], [
			['id' => 'files', 'order' => 1],
		]);
		$this->assertSame('folder', $merged['items'][0]['type']);
		$this->assertSame('Folder', $merged['items'][0]['name']);
		$this->assertTrue($merged['changed']);
		$this->assertStringNotContainsString('<', $merged['items'][0]['name']);
	}
}
