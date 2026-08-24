<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Dashboard;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\Service\AppIconService;
use OCA\HomeCheck\Service\LayoutService;
use OCP\Dashboard\IAPIWidgetV2;
use OCP\Dashboard\IButtonWidget;
use OCP\Dashboard\IIconWidget;
use OCP\Dashboard\IReloadableWidget;
use OCP\Dashboard\Model\WidgetButton;
use OCP\Dashboard\Model\WidgetItem;
use OCP\Dashboard\Model\WidgetItems;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * HomeCheck status desklet — compact launcher summary on the NC Dashboard.
 *
 * Red-team:
 * - Desklet loads must stay read-only: call summarizeForUser() only (never the
 *   layout getter that persists on first visit + syncs apporder).
 * - Absolute URLs only for WidgetItem / WidgetButton links.
 * - Hard-limit items; fail closed with empty message on any throwable.
 * - WidgetButton arg order: type, link, text — never swap with l10n.
 */
class LauncherWidget implements IAPIWidgetV2, IButtonWidget, IIconWidget, IReloadableWidget
{
	use RegistersDeskletStylesTrait;

	public function __construct(
		private readonly IL10N $l10n,
		private readonly IURLGenerator $urlGenerator,
		private readonly IUserSession $userSession,
		private readonly LayoutService $layoutService,
		private readonly AppIconService $appIcons,
		private readonly LoggerInterface $logger,
	) {
	}

	public function getId(): string
	{
		return Application::APP_ID . '-launcher';
	}

	public function getTitle(): string
	{
		return $this->l10n->t('Your apps');
	}

	public function getOrder(): int
	{
		return 5;
	}

	public function getIconClass(): string
	{
		return 'icon-home';
	}

	public function getIconUrl(): string
	{
		return $this->appIcons->absoluteSurfaceIconUrl();
	}

	public function getUrl(): ?string
	{
		return $this->launcherUrl();
	}

	public function getReloadInterval(): int
	{
		return 300;
	}

	public function load(): void
	{
		$this->registerDeskletStylesForWidget();
	}

	public function getItemsV2(string $userId, ?string $since = null, int $limit = 7): WidgetItems
	{
		$limit = max(1, min(7, $limit));
		$icon = $this->getIconUrl();
		$url = $this->launcherUrl();

		try {
			$summary = $this->layoutService->summarizeForUser($userId);
		} catch (\Throwable $e) {
			$this->logger->error('HomeCheck dashboard desklet failed', [
				'app' => Application::APP_ID,
				'userId' => $userId,
				'exception' => $e,
			]);
			return new WidgetItems([], $this->l10n->t('Could not load HomeCheck status.'));
		}

		$appCount = (int)$summary['appCount'];
		$folderCount = (int)$summary['folderCount'];
		$items = [];

		if ($appCount < 1) {
			return new WidgetItems([], $this->l10n->t('No apps available for you yet.'));
		}

		$items[] = new WidgetItem(
			$this->l10n->t('HomeCheck'),
			$this->l10n->t('%1$s apps · %2$s folders on your home', [
				(string)$appCount,
				(string)$folderCount,
			]),
			$url,
			$icon,
			'hmk-summary',
		);

		if ($summary['isDefaultLanding']) {
			$items[] = new WidgetItem(
				$this->l10n->t('Start page after login'),
				$this->l10n->t('HomeCheck opens after you sign in'),
				$url,
				$icon,
				'hmk-landing-on',
			);
		} else {
			$items[] = new WidgetItem(
				$this->l10n->t('Start page after login'),
				$this->l10n->t('Not set — open HomeCheck to choose'),
				$url,
				$icon,
				'hmk-landing-off',
			);
		}

		if (count($items) > $limit) {
			$items = array_slice($items, 0, $limit);
		}

		return new WidgetItems($items, '');
	}

	/** @return list<WidgetButton> */
	public function getWidgetButtons(string $userId): array
	{
		$sessionUser = $this->userSession->getUser();
		if ($sessionUser === null || $sessionUser->getUID() !== $userId) {
			return [];
		}

		return [
			new WidgetButton(
				WidgetButton::TYPE_MORE,
				$this->launcherUrl(),
				$this->l10n->t('Open launcher'),
			),
		];
	}

	private function launcherUrl(): string
	{
		return $this->urlGenerator->linkToRouteAbsolute('homecheck.page.index');
	}
}
