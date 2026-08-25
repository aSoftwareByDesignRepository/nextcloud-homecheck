<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Service;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Exception\DomainException;
use OCP\IConfig;
use OCP\INavigationManager;
use Psr\Log\LoggerInterface;

class LayoutService
{
	public const USER_LAYOUT_KEY = 'layout_v1';
	public const USER_CTA_DISMISS_KEY = 'default_cta_dismissed';
	public const APP_SEED_KEY = 'seed_template_v1';

	public function __construct(
		private readonly IConfig $config,
		private readonly INavigationManager $navigationManager,
		private readonly LayoutValidator $validator,
		private readonly LayoutMerger $merger,
		private readonly AppOrderFlattener $flattener,
		private readonly NavigationHrefGuard $hrefGuard,
		private readonly ILayoutWriteGuard $writeGuard,
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * @return array{layout: array{version:int,revision:int,items:list<array<string,mixed>>}, entries: list<array<string,mixed>>, ctaDismissed: bool, isDefaultLanding: bool, apporderSynced: bool}
	 */
	public function getForUser(string $uid): array
	{
		$entries = $this->liveEntries();
		$raw = $this->readPersonalRaw($uid);
		$corrupt = false;
		$stored = null;
		$apporderSynced = true;

		if ($raw !== null) {
			try {
				$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
				$stored = $this->validator->validate($decoded, true);
			} catch (\Throwable) {
				$corrupt = true;
				$stored = null;
				$this->logger->warning('AppHome corrupt personal layout; regenerating', [
					'app' => Application::APP_ID,
				]);
			}
		}

		if ($stored === null) {
			$stored = $this->readSeedTemplate();
		}

		$merged = $this->merger->merge($stored, $entries);

		// First visit or corrupt storage: persist so seed edits cannot stomp (US-009) / AC-G-08
		if ($raw === null || $corrupt) {
			$toStore = $this->layoutFromMerged($merged, 1);
			$encoded = json_encode($toStore, JSON_THROW_ON_ERROR);
			if (!$this->writeGuard->compareAndSwap($uid, $raw, $encoded)) {
				// Lost first-write / regenerate race — return whatever won
				return $this->getForUserAfterLostRace($uid, $entries);
			}
			$merged['revision'] = 1;
			$apporderSynced = $this->syncAppOrder($uid, $toStore, $entries);
		}

		return [
			'layout' => $this->layoutFromMerged($merged),
			'entries' => $this->mapEntries($entries),
			'ctaDismissed' => $this->config->getUserValue($uid, Application::APP_ID, self::USER_CTA_DISMISS_KEY, '0') === '1',
			'isDefaultLanding' => $this->isDefaultLanding($uid),
			'apporderSynced' => $apporderSynced,
		];
	}

	/**
	 * @param array<string,mixed> $incoming
	 * @return array{layout: array{version:int,revision:int,items:list<array<string,mixed>>}, entries: list<array<string,mixed>>, apporderSynced: bool}
	 */
	public function saveForUser(string $uid, array $incoming): array
	{
		$validated = $this->validator->validate($incoming, true);
		$rawBefore = $this->readPersonalRaw($uid);
		$current = null;
		if ($rawBefore !== null) {
			try {
				$current = $this->validator->validate(
					json_decode($rawBefore, true, 512, JSON_THROW_ON_ERROR),
					true,
				);
			} catch (\Throwable) {
				$current = null;
			}
		}
		$currentRev = is_array($current) ? (int)($current['revision'] ?? 0) : 0;
		$clientRev = (int)$validated['revision'];

		if ($current !== null && $clientRev !== $currentRev) {
			throw $this->conflictException($uid, $current);
		}

		$entries = $this->liveEntries();
		$merged = $this->merger->merge($validated, $entries);
		$next = $this->layoutFromMerged($merged, $currentRev + 1);
		$encoded = json_encode($next, JSON_THROW_ON_ERROR);

		if (!$this->writeGuard->compareAndSwap($uid, $rawBefore, $encoded)) {
			$again = $this->readPersonalLayout($uid);
			throw $this->conflictException($uid, $again);
		}

		$synced = $this->syncAppOrder($uid, $next, $entries);
		$this->logger->info('AppHome layout saved', [
			'app' => Application::APP_ID,
			'revision' => $next['revision'],
			'items' => count($next['items']),
			'hidden' => count($next['hidden']),
			'apporderSynced' => $synced,
		]);

		return [
			'layout' => $next,
			'entries' => $this->mapEntries($entries),
			'apporderSynced' => $synced,
		];
	}

	/**
	 * Re-push flattened top-bar order from the stored personal layout (no revision bump).
	 * Used after a partial failure where layout persisted but core/apporder did not.
	 *
	 * @return array{apporderSynced: bool, layout: array{version:int,revision:int,items:list<array<string,mixed>>}}
	 */
	public function resyncAppOrderForUser(string $uid): array
	{
		$stored = $this->readPersonalLayout($uid);
		$entries = $this->liveEntries();
		$merged = $this->merger->merge($stored, $entries);
		$layout = $this->layoutFromMerged($merged);
		$synced = $this->syncAppOrder($uid, $layout, $entries);
		if (!$synced) {
			$this->logger->warning('AppHome apporder resync failed', [
				'app' => Application::APP_ID,
			]);
		}
		return [
			'apporderSynced' => $synced,
			'layout' => $layout,
		];
	}

	public function setDefaultLanding(string $uid, bool $enable, bool $dismissCta): void
	{
		if ($dismissCta) {
			$this->config->setUserValue($uid, Application::APP_ID, self::USER_CTA_DISMISS_KEY, '1');
		}
		$parts = $this->defaultAppParts($uid);
		$parts = array_values(array_filter($parts, static fn (string $p): bool => $p !== Application::APP_ID));
		if ($enable) {
			array_unshift($parts, Application::APP_ID);
		}
		$this->config->setUserValue($uid, 'core', 'defaultapp', implode(',', $parts));
	}

	public function dismissCta(string $uid): void
	{
		$this->config->setUserValue($uid, Application::APP_ID, self::USER_CTA_DISMISS_KEY, '1');
	}

	public function isDefaultLanding(string $uid): bool
	{
		$parts = $this->defaultAppParts($uid);
		return isset($parts[0]) && $parts[0] === Application::APP_ID;
	}

	/**
	 * Read-only layout summary for the Dashboard desklet.
	 * Must never persist layout or touch core/apporder (unlike getForUser).
	 *
	 * @return array{appCount:int,folderCount:int,tileCount:int,isDefaultLanding:bool,hasPersonalLayout:bool}
	 */
	public function summarizeForUser(string $uid): array
	{
		$entries = $this->liveEntries();
		$raw = $this->readPersonalRaw($uid);
		$stored = null;
		if ($raw !== null && $raw !== '') {
			try {
				$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
				$stored = $this->validator->validate($decoded, true);
			} catch (\Throwable) {
				$stored = null;
			}
		}
		if ($stored === null) {
			$stored = $this->readSeedTemplate();
		}
		$merged = $this->merger->merge($stored, $entries);

		$appCount = 0;
		$folderCount = 0;
		foreach ($merged['items'] as $item) {
			$type = (string)($item['type'] ?? '');
			if ($type === 'folder') {
				$folderCount++;
				$appCount += count($item['children'] ?? []);
			} elseif ($type === 'app') {
				$appCount++;
			}
		}

		return [
			'appCount' => $appCount,
			'folderCount' => $folderCount,
			'tileCount' => count($merged['items']),
			'isDefaultLanding' => $this->isDefaultLanding($uid),
			'hasPersonalLayout' => $raw !== null && $raw !== '',
		];
	}

	/**
	 * @return list<string>
	 */
	public function defaultAppParts(string $uid): array
	{
		$raw = $this->config->getUserValue($uid, 'core', 'defaultapp', '');
		return array_values(array_filter(array_map('trim', explode(',', $raw)), static fn (string $p): bool => $p !== ''));
	}

	/**
	 * @param array{version?:int,revision?:int,items?:list<array<string,mixed>>}|null $serverLayout
	 */
	private function conflictException(string $uid, ?array $serverLayout): DomainException
	{
		$entries = $this->liveEntries();
		$merged = $this->merger->merge($serverLayout, $entries);
		return new DomainException(
			'layout_revision',
			'Layout was updated elsewhere — reload and try again',
			409,
			[
				'layout' => $this->layoutFromMerged($merged),
				'entries' => $this->mapEntries($entries),
			],
		);
	}

	/**
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>}|null
	 */
	public function getAdminTemplate(): ?array
	{
		return $this->readSeedTemplate();
	}

	/**
	 * @param array<string,mixed>|null $template null clears
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>}|null
	 */
	public function saveAdminTemplate(?array $template): ?array
	{
		if ($template === null) {
			$this->config->deleteAppValue(Application::APP_ID, self::APP_SEED_KEY);
			return null;
		}
		$validated = $this->validator->validate($template, false);
		$validated['revision'] = 0;
		$this->config->setAppValue(Application::APP_ID, self::APP_SEED_KEY, json_encode($validated, JSON_THROW_ON_ERROR));
		return $validated;
	}

	/**
	 * @return list<array{id:string,name:string,href:string,icon?:string,order?:int,app?:string}>
	 */
	public function liveEntries(): array
	{
		$all = $this->navigationManager->getAll(INavigationManager::TYPE_APPS);
		$out = [];
		foreach ($all as $entry) {
			if (!is_array($entry) || !isset($entry['id'], $entry['name'], $entry['href'])) {
				continue;
			}
			$href = $this->hrefGuard->filter((string)$entry['href']);
			if ($href === null) {
				continue;
			}
			$icon = isset($entry['icon']) ? (string)$entry['icon'] : '';
			if ($icon !== '' && $this->hrefGuard->filter($icon) === null) {
				$icon = '';
			}
			$out[] = [
				'id' => (string)$entry['id'],
				'name' => (string)$entry['name'],
				'href' => $href,
				'icon' => $icon,
				'order' => (int)($entry['order'] ?? 100),
				'app' => isset($entry['app']) ? (string)$entry['app'] : (string)$entry['id'],
			];
		}
		return $out;
	}

	/**
	 * @param array{items:list<array<string,mixed>>} $layout
	 * @param list<array{id:string,app?:string}> $entries
	 */
	public function syncAppOrder(string $uid, array $layout, array $entries): bool
	{
		$byId = [];
		foreach ($entries as $e) {
			$byId[$e['id']] = $e;
		}
		$flat = $this->flattener->flatten($layout, $byId);
		try {
			$this->config->setUserValue($uid, 'core', 'apporder', json_encode($flat, JSON_THROW_ON_ERROR));
			return true;
		} catch (\Throwable $e) {
			$this->logger->error('AppHome apporder sync failed', [
				'app' => Application::APP_ID,
				'exception' => $e,
			]);
			return false;
		}
	}

	/**
	 * @param list<array{id:string,name:string,href:string,icon?:string,order?:int,app?:string}> $entries
	 * @return array{layout: array{version:int,revision:int,items:list<array<string,mixed>>}, entries: list<array<string,mixed>>, ctaDismissed: bool, isDefaultLanding: bool, apporderSynced: bool}
	 */
	private function getForUserAfterLostRace(string $uid, array $entries): array
	{
		$stored = $this->readPersonalLayout($uid);
		$merged = $this->merger->merge($stored, $entries);
		$layout = $this->layoutFromMerged($merged);
		// Winner persisted layout; loser must still push apporder (winner may have failed sync).
		$apporderSynced = $this->syncAppOrder($uid, $layout, $entries);
		return [
			'layout' => $layout,
			'entries' => $this->mapEntries($entries),
			'ctaDismissed' => $this->config->getUserValue($uid, Application::APP_ID, self::USER_CTA_DISMISS_KEY, '0') === '1',
			'isDefaultLanding' => $this->isDefaultLanding($uid),
			'apporderSynced' => $apporderSynced,
		];
	}

	/**
	 * @param list<array{id:string,name:string,href:string,icon?:string,order?:int,app?:string}> $entries
	 * @return list<array<string,mixed>>
	 */
	private function mapEntries(array $entries): array
	{
		return array_values(array_map(static fn (array $e): array => [
			'id' => $e['id'],
			'name' => $e['name'],
			'href' => $e['href'],
			'icon' => $e['icon'] ?? '',
			'order' => (int)($e['order'] ?? 100),
			'app' => $e['app'] ?? $e['id'],
		], $entries));
	}

	/**
	 * @param array{revision?:int,items?:list<array<string,mixed>>,hidden?:list<string>,hiddenFolders?:list<array<string,mixed>>} $merged
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>,hidden:list<string>,hiddenFolders:list<array<string,mixed>>}
	 */
	private function layoutFromMerged(array $merged, ?int $revisionOverride = null): array
	{
		$hidden = $merged['hidden'] ?? [];
		if (!is_array($hidden)) {
			$hidden = [];
		}
		$hiddenFolders = $merged['hiddenFolders'] ?? [];
		if (!is_array($hiddenFolders)) {
			$hiddenFolders = [];
		}
		return [
			'version' => 1,
			'revision' => $revisionOverride ?? (int)($merged['revision'] ?? 0),
			'items' => is_array($merged['items'] ?? null) ? $merged['items'] : [],
			'hidden' => array_values(array_filter($hidden, static fn ($id): bool => is_string($id) && $id !== '')),
			'hiddenFolders' => array_values($hiddenFolders),
		];
	}

	/**
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>,hidden?:list<string>}|null
	 */
	private function readPersonalLayout(string $uid): ?array
	{
		$raw = $this->readPersonalRaw($uid);
		if ($raw === null || $raw === '') {
			return null;
		}
		try {
			$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
			return $this->validator->validate($decoded, true);
		} catch (\Throwable) {
			return null;
		}
	}

	private function readPersonalRaw(string $uid): ?string
	{
		return $this->writeGuard->readRaw($uid);
	}

	/**
	 * @return array{version:int,revision:int,items:list<array<string,mixed>>}|null
	 */
	private function readSeedTemplate(): ?array
	{
		$raw = $this->config->getAppValue(Application::APP_ID, self::APP_SEED_KEY, '');
		if ($raw === '') {
			return null;
		}
		try {
			$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
			return $this->validator->validate($decoded, false);
		} catch (\Throwable) {
			$this->logger->warning('AppHome corrupt seed template ignored', [
				'app' => Application::APP_ID,
			]);
			return null;
		}
	}
}
