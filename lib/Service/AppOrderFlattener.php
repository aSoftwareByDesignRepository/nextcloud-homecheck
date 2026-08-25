<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

/**
 * Flatten AppHome layout into Nextcloud core `apporder` keyed object.
 *
 * Shape (NavigationManager + theming preference listener):
 * { "<navId>": { "order": int, "app": "<appId>" }, ... }
 */
final class AppOrderFlattener
{
	/**
	 * @param array{items?:list<array<string,mixed>>} $layout
	 * @param array<string, array{id:string,app?:string}> $entriesById
	 * @return array<string, array{order:int, app:string}>
	 */
	public function flatten(array $layout, array $entriesById): array
	{
		$out = [];
		$order = 1;
		$items = $layout['items'] ?? [];
		if (!is_array($items)) {
			return $out;
		}

		foreach ($items as $item) {
			if (!is_array($item)) {
				continue;
			}
			$type = $item['type'] ?? '';
			if ($type === 'app') {
				$id = (string)($item['id'] ?? '');
				$this->append($out, $order, $id, $entriesById);
				continue;
			}
			if ($type === 'folder') {
				$children = $item['children'] ?? [];
				if (!is_array($children)) {
					continue;
				}
				foreach ($children as $cid) {
					$this->append($out, $order, (string)$cid, $entriesById);
				}
			}
		}

		return $out;
	}

	/**
	 * @param array<string, array{order:int, app:string}> $out
	 * @param array<string, array{id:string,app?:string}> $entriesById
	 */
	private function append(array &$out, int &$order, string $navId, array $entriesById): void
	{
		if ($navId === '' || isset($out[$navId]) || !isset($entriesById[$navId])) {
			return;
		}
		$app = $entriesById[$navId]['app'] ?? $navId;
		if (!is_string($app) || $app === '') {
			$app = $navId;
		}
		$out[$navId] = [
			'order' => $order,
			'app' => $app,
		];
		$order++;
	}
}
