<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

use OCA\HomeCheck\Exception\DomainException;

/**
 * Pure layout schema validation (no I/O).
 */
final class LayoutValidator
{
	public const MAX_ITEMS = 100;
	public const MAX_CHILDREN = 40;
	public const MAX_HIDDEN = 200;
	public const MAX_HIDDEN_FOLDERS = 50;
	public const MAX_NAME_LEN = 40;
	public const MAX_JSON_BYTES = 32768;
	public const FOLDER_ID_PATTERN = '/^fld_[A-Za-z0-9]{8,64}$/';
	public const NAME_PATTERN = '/^[\p{L}\p{N} _\-\.\/\(\)]+$/u';

	/**
	 * @param mixed $layout
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>,hidden:list<string>,hiddenFolders:list<array<string,mixed>>}
	 */
	public function validate(mixed $layout, bool $requireRevision = true): array
	{
		if (!is_array($layout)) {
			throw new DomainException('layout_version', 'Layout must be an object', 400);
		}

		$encoded = json_encode($layout, JSON_THROW_ON_ERROR);
		if (strlen($encoded) > self::MAX_JSON_BYTES) {
			throw new DomainException('layout_limit', 'Layout exceeds size limit', 400);
		}

		$version = $layout['version'] ?? null;
		if ($version !== 1 && $version !== '1') {
			throw new DomainException('layout_version', 'Unsupported layout version', 400);
		}

		$revision = $layout['revision'] ?? 0;
		if (!is_int($revision) && !(is_string($revision) && ctype_digit($revision))) {
			throw new DomainException('layout_revision', 'Invalid revision', 400);
		}
		$revision = (int)$revision;
		if ($revision < 0) {
			throw new DomainException('layout_revision', 'Invalid revision', 400);
		}
		if ($requireRevision === false) {
			$revision = 0;
		}

		$items = $layout['items'] ?? null;
		if (!is_array($items)) {
			throw new DomainException('layout_limit', 'items must be an array', 400);
		}
		if (count($items) > self::MAX_ITEMS) {
			throw new DomainException('layout_limit', 'Too many items', 400);
		}

		$seenAppIds = [];
		$folderIds = [];
		$normalized = [];

		foreach ($items as $item) {
			if (!is_array($item)) {
				throw new DomainException('layout_limit', 'Invalid item', 400);
			}
			$type = $item['type'] ?? '';
			if ($type === 'app') {
				$id = $this->requireNavId($item['id'] ?? null);
				if (isset($seenAppIds[$id])) {
					throw new DomainException('duplicate_entry', 'Duplicate app entry: ' . $id, 400);
				}
				$seenAppIds[$id] = true;
				$normalized[] = ['type' => 'app', 'id' => $id];
				continue;
			}
			if ($type === 'folder') {
				$fid = $item['id'] ?? '';
				if (!is_string($fid) || preg_match(self::FOLDER_ID_PATTERN, $fid) !== 1) {
					throw new DomainException('folder_id', 'Invalid folder id', 400);
				}
				if (isset($folderIds[$fid])) {
					throw new DomainException('folder_id', 'Duplicate folder id', 400);
				}
				$folderIds[$fid] = true;
				$name = $this->validateFolderName($item['name'] ?? null);
				$children = $item['children'] ?? null;
				if (!is_array($children)) {
					throw new DomainException('folder_children', 'Folder children must be an array', 400);
				}
				if (count($children) > self::MAX_CHILDREN) {
					throw new DomainException('folder_children', 'Too many apps in folder', 400);
				}
				$childIds = [];
				foreach ($children as $child) {
					$cid = $this->requireNavId($child);
					if (isset($seenAppIds[$cid]) || isset($childIds[$cid])) {
						throw new DomainException('duplicate_entry', 'Duplicate app entry: ' . $cid, 400);
					}
					// Nested folders forbidden: child must look like nav id, not folder id
					if (preg_match(self::FOLDER_ID_PATTERN, $cid) === 1) {
						throw new DomainException('folder_children', 'Nested folders are not allowed', 400);
					}
					$childIds[$cid] = true;
					$seenAppIds[$cid] = true;
				}
				$normalized[] = [
					'type' => 'folder',
					'id' => $fid,
					'name' => $name,
					'children' => array_keys($childIds),
				];
				continue;
			}
			throw new DomainException('layout_limit', 'Unknown item type', 400);
		}

		$hiddenRaw = $layout['hidden'] ?? [];
		if ($hiddenRaw === null) {
			$hiddenRaw = [];
		}
		if (!is_array($hiddenRaw)) {
			throw new DomainException('layout_limit', 'hidden must be an array', 400);
		}
		if (count($hiddenRaw) > self::MAX_HIDDEN) {
			throw new DomainException('layout_limit', 'Too many hidden apps', 400);
		}
		$hidden = [];
		foreach ($hiddenRaw as $hid) {
			$id = $this->requireNavId($hid);
			if (isset($hidden[$id])) {
				continue;
			}
			if (isset($seenAppIds[$id])) {
				throw new DomainException('duplicate_entry', 'Hidden app also on home screen: ' . $id, 400);
			}
			$hidden[$id] = true;
		}

		$hiddenFoldersRaw = $layout['hiddenFolders'] ?? [];
		if ($hiddenFoldersRaw === null) {
			$hiddenFoldersRaw = [];
		}
		if (!is_array($hiddenFoldersRaw)) {
			throw new DomainException('layout_limit', 'hiddenFolders must be an array', 400);
		}
		if (count($hiddenFoldersRaw) > self::MAX_HIDDEN_FOLDERS) {
			throw new DomainException('layout_limit', 'Too many hidden folders', 400);
		}
		$hiddenFolders = [];
		foreach ($hiddenFoldersRaw as $folder) {
			if (!is_array($folder)) {
				throw new DomainException('layout_limit', 'Invalid hidden folder', 400);
			}
			$fid = $folder['id'] ?? '';
			if (!is_string($fid) || preg_match(self::FOLDER_ID_PATTERN, $fid) !== 1) {
				throw new DomainException('folder_id', 'Invalid folder id', 400);
			}
			if (isset($folderIds[$fid])) {
				throw new DomainException('folder_id', 'Duplicate folder id', 400);
			}
			$folderIds[$fid] = true;
			$name = $this->validateFolderName($folder['name'] ?? null);
			$children = $folder['children'] ?? null;
			if (!is_array($children)) {
				throw new DomainException('folder_children', 'Folder children must be an array', 400);
			}
			if (count($children) > self::MAX_CHILDREN) {
				throw new DomainException('folder_children', 'Too many apps in folder', 400);
			}
			$childIds = [];
			foreach ($children as $child) {
				$cid = $this->requireNavId($child);
				if (isset($seenAppIds[$cid]) || isset($childIds[$cid]) || isset($hidden[$cid])) {
					throw new DomainException('duplicate_entry', 'Duplicate app entry: ' . $cid, 400);
				}
				if (preg_match(self::FOLDER_ID_PATTERN, $cid) === 1) {
					throw new DomainException('folder_children', 'Nested folders are not allowed', 400);
				}
				$childIds[$cid] = true;
				$seenAppIds[$cid] = true;
			}
			$hiddenFolders[] = [
				'type' => 'folder',
				'id' => $fid,
				'name' => $name,
				'children' => array_keys($childIds),
			];
		}

		return [
			'version' => 1,
			'revision' => $revision,
			'items' => $normalized,
			'hidden' => array_keys($hidden),
			'hiddenFolders' => $hiddenFolders,
		];
	}

	public function validateFolderName(mixed $name): string
	{
		if (!is_string($name)) {
			throw new DomainException('folder_name', 'Folder name required', 400);
		}
		$trimmed = trim($name);
		$len = mb_strlen($trimmed);
		if ($len < 1 || $len > self::MAX_NAME_LEN) {
			throw new DomainException('folder_name', 'Folder name length invalid', 400);
		}
		if (preg_match(self::NAME_PATTERN, $trimmed) !== 1) {
			throw new DomainException('folder_name', 'Folder name has invalid characters', 400);
		}
		if (str_contains($trimmed, '<') || str_contains($trimmed, '>')) {
			throw new DomainException('folder_name', 'Folder name has invalid characters', 400);
		}
		return $trimmed;
	}

	private function requireNavId(mixed $id): string
	{
		if (!is_string($id) || $id === '' || strlen($id) > 128) {
			throw new DomainException('layout_limit', 'Invalid navigation id', 400);
		}
		if (preg_match('/^[A-Za-z0-9_.:\-]+$/', $id) !== 1) {
			throw new DomainException('layout_limit', 'Invalid navigation id', 400);
		}
		return $id;
	}
}
