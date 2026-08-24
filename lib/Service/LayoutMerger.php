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
 */
final class LayoutMerger
{
	/**
	 * @param array{version?:int,revision?:int,items?:list<array<string,mixed>>}|null $stored
	 * @param list<array{id:string,order?:int}> $liveEntries
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>,changed:bool}
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
				$name = (string)($item['name'] ?? 'Folder');
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
				// Keep empty folders (Q8b / AS-08); drop folders with empty/invalid ids (no random ids)
				if ($fid === '' || preg_match(LayoutValidator::FOLDER_ID_PATTERN, $fid) !== 1) {
					$changed = true;
					foreach ($children as $cid) {
						unset($placed[$cid]);
					}
					// Re-queue children as missing by unplacing — append later
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

		return [
			'version' => 1,
			'revision' => $revision,
			'items' => $out,
			'changed' => $changed,
		];
	}
}
