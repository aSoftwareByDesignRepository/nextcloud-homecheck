<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

/**
 * Merge stored layout with live navigation entry ids (pure).
 * Caps top-level items at LayoutValidator::MAX_ITEMS so appends cannot grow past the limit.
 * Apps in `hidden` and children of `hiddenFolders` stay off the home screen.
 */
final class LayoutMerger
{
	/**
	 * @param array{version?:int,revision?:int,items?:list<array<string,mixed>>,hidden?:list<string>,hiddenFolders?:list<array<string,mixed>>}|null $stored
	 * @param list<array{id:string,order?:int}> $liveEntries
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>,hidden:list<string>,hiddenFolders:list<array<string,mixed>>,changed:bool}
	 */
	public function merge(?array $stored, array $liveEntries, int $maxItems = LayoutValidator::MAX_ITEMS): array
	{
		if ($maxItems < 1) {
			$maxItems = LayoutValidator::MAX_ITEMS;
		}

		$liveIds = [];
		$liveOrder = [];
		foreach ($liveEntries as $entry) {
			$id = $entry['id'];
			$liveIds[$id] = true;
			$liveOrder[$id] = (int)($entry['order'] ?? 100);
		}

		$revision = is_array($stored) ? (int)($stored['revision'] ?? 0) : 0;
		$itemsIn = is_array($stored) && isset($stored['items']) && is_array($stored['items'])
			? $stored['items']
			: [];

		$placed = [];
		$out = [];
		$changed = false;
		$hiddenOut = [];
		$hiddenFoldersOut = [];
		$hiddenFolderIds = [];

		// Hidden folders first — their children count as placed.
		$foldersIn = [];
		if (is_array($stored) && isset($stored['hiddenFolders']) && is_array($stored['hiddenFolders'])) {
			$foldersIn = $stored['hiddenFolders'];
		}
		foreach ($foldersIn as $folder) {
			if (!is_array($folder)) {
				$changed = true;
				continue;
			}
			$fid = (string)($folder['id'] ?? '');
			if ($fid === '' || preg_match(LayoutValidator::FOLDER_ID_PATTERN, $fid) !== 1 || isset($hiddenFolderIds[$fid])) {
				$changed = true;
				continue;
			}
			if (count($hiddenFoldersOut) >= LayoutValidator::MAX_HIDDEN_FOLDERS) {
				$changed = true;
				continue;
			}
			$rawName = $folder['name'] ?? null;
			$name = $this->safeFolderName($rawName);
			if (!is_string($rawName) || $name !== trim((string)$rawName)) {
				$changed = true;
			}
			$childrenIn = is_array($folder['children'] ?? null) ? $folder['children'] : [];
			$children = [];
			foreach ($childrenIn as $cid) {
				$cid = (string)$cid;
				if ($cid === '' || !isset($liveIds[$cid]) || isset($placed[$cid])) {
					$changed = true;
					continue;
				}
				$placed[$cid] = true;
				$children[] = $cid;
			}
			$hiddenFolderIds[$fid] = true;
			$hiddenFoldersOut[] = [
				'type' => 'folder',
				'id' => $fid,
				'name' => $name,
				'children' => $children,
			];
		}

		$hiddenIn = [];
		if (is_array($stored) && isset($stored['hidden']) && is_array($stored['hidden'])) {
			foreach ($stored['hidden'] as $hid) {
				if (!is_string($hid) || $hid === '') {
					continue;
				}
				$hiddenIn[$hid] = true;
			}
		}
		foreach (array_keys($hiddenIn) as $hid) {
			if (!isset($liveIds[$hid])) {
				$changed = true;
				continue;
			}
			if (isset($placed[$hid])) {
				// Already covered by a hidden folder — drop from flat hidden list.
				$changed = true;
				continue;
			}
			$hiddenOut[$hid] = true;
			$placed[$hid] = true;
		}
		if (count($hiddenOut) > LayoutValidator::MAX_HIDDEN) {
			$changed = true;
			$keys = array_keys($hiddenOut);
			sort($keys, SORT_STRING);
			$keys = array_slice($keys, 0, LayoutValidator::MAX_HIDDEN);
			foreach (array_keys($hiddenOut) as $hid) {
				if (!in_array($hid, $keys, true)) {
					unset($placed[$hid]);
				}
			}
			$hiddenOut = [];
			foreach ($keys as $hid) {
				$hiddenOut[$hid] = true;
				$placed[$hid] = true;
			}
		}

		foreach ($itemsIn as $item) {
			if (!is_array($item)) {
				$changed = true;
				continue;
			}
			$type = $item['type'] ?? '';
			if ($type === 'app') {
				$id = (string)($item['id'] ?? '');
				if ($id === '' || !isset($liveIds[$id]) || isset($placed[$id])) {
					$changed = true;
					continue;
				}
				if (count($out) >= $maxItems) {
					$changed = true;
					continue;
				}
				$placed[$id] = true;
				$out[] = ['type' => 'app', 'id' => $id];
				continue;
			}
			if ($type === 'folder') {
				$fid = (string)($item['id'] ?? '');
				$rawName = $item['name'] ?? null;
				$name = $this->safeFolderName($rawName);
				if (!is_string($rawName) || $name !== trim((string)$rawName)) {
					$changed = true;
				}
				if (isset($hiddenFolderIds[$fid])) {
					$changed = true;
					continue;
				}
				$childrenIn = is_array($item['children'] ?? null) ? $item['children'] : [];
				$children = [];
				foreach ($childrenIn as $cid) {
					$cid = (string)$cid;
					if ($cid === '' || !isset($liveIds[$cid]) || isset($placed[$cid])) {
						$changed = true;
						continue;
					}
					$placed[$cid] = true;
					$children[] = $cid;
				}
				if ($fid === '' || preg_match(LayoutValidator::FOLDER_ID_PATTERN, $fid) !== 1) {
					$changed = true;
					foreach ($children as $cid) {
						unset($placed[$cid]);
					}
					continue;
				}
				if (count($out) >= $maxItems) {
					$changed = true;
					foreach ($children as $cid) {
						unset($placed[$cid]);
					}
					continue;
				}
				$out[] = [
					'type' => 'folder',
					'id' => $fid,
					'name' => $name,
					'children' => $children,
				];
				continue;
			}
			$changed = true;
		}

		$missing = [];
		foreach (array_keys($liveIds) as $id) {
			if (!isset($placed[$id])) {
				$missing[] = $id;
			}
		}
		usort($missing, static function (string $a, string $b) use ($liveOrder): int {
			return ($liveOrder[$a] <=> $liveOrder[$b]) ?: strcmp($a, $b);
		});
		foreach ($missing as $id) {
			if (count($out) >= $maxItems) {
				$changed = true;
				break;
			}
			$changed = true;
			$placed[$id] = true;
			$out[] = ['type' => 'app', 'id' => $id];
		}

		$hiddenList = array_keys($hiddenOut);
		sort($hiddenList, SORT_STRING);

		return [
			'version' => 1,
			'revision' => $revision,
			'items' => $out,
			'hidden' => $hiddenList,
			'hiddenFolders' => $hiddenFoldersOut,
			'changed' => $changed,
		];
	}

	/**
	 * Defense-in-depth: never emit folder labels that would fail LayoutValidator
	 * (e.g. legacy/corrupt preference rows that skipped validate()).
	 */
	private function safeFolderName(mixed $name): string
	{
		if (!is_string($name)) {
			return 'Folder';
		}
		$trimmed = trim($name);
		$len = mb_strlen($trimmed);
		if ($len < 1 || $len > LayoutValidator::MAX_NAME_LEN) {
			return 'Folder';
		}
		if (preg_match(LayoutValidator::NAME_PATTERN, $trimmed) !== 1) {
			return 'Folder';
		}
		if (str_contains($trimmed, '<') || str_contains($trimmed, '>')) {
			return 'Folder';
		}
		return $trimmed;
	}
}
