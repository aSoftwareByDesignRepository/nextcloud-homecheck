<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Controller;

use OCA\HomeCheck\AppInfo\Application;
use OCA\HomeCheck\ConfigTransfer\TransferReceiptStore;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Util;

class PageController extends Controller
{
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IUserSession $userSession,
		private readonly IGroupManager $groupManager,
		private readonly IURLGenerator $urlGenerator,
		private readonly TransferReceiptStore $transferReceipts,
		private readonly LayoutService $layouts,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse
	{
		$user = $this->userSession->getUser();
		$uid = $user !== null ? $user->getUID() : '';
		$payload = $uid !== '' ? $this->layouts->getForUser($uid) : [
			'layout' => ['version' => 1, 'revision' => 0, 'items' => [], 'hidden' => [], 'hiddenFolders' => []],
			'entries' => [],
			'ctaDismissed' => true,
			'isDefaultLanding' => false,
			'apporderSynced' => true,
		];

		// Display name for dashboard-style greeting only — never used in hrefs/IDs.
		$displayName = '';
		if ($user !== null) {
			$raw = trim((string)$user->getDisplayName());
			// Strip control chars; keep printable Unicode for greetings.
			$displayName = preg_replace('/[\x00-\x1F\x7F]/u', '', $raw) ?? '';
			if (mb_strlen($displayName) > 80) {
				$displayName = mb_substr($displayName, 0, 80);
			}
		}
		$payload['displayName'] = $displayName;

		Util::addInitScript('homecheck', 'shell-init');
		Util::addScript('homecheck', 'app');
		Util::addScript('homecheck', 'common/app-feedback');
		Util::addStyle('homecheck', 'app');

		return new TemplateResponse('homecheck', 'main', [
			'initialState' => $payload,
		]);
	}

	/**
	 * Dedicated transfer settings page (/settings/transfer) — the only
	 * in-app settings surface HomeCheck ships; NC-system-admin gated
	 * (door-admin == sysadmin here, same bar as TransferHooks). Any other
	 * section — and non-admins — redirect to the app index: the page does
	 * not exist for them.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function settings(string $section = ''): TemplateResponse|RedirectResponse
	{
		$uid = (string)($this->userSession->getUser()?->getUID() ?? '');
		if ($section === 'transfer' && $uid !== '' && $this->groupManager->isAdmin($uid)) {
			Util::addTranslations(Application::APP_ID);
			return new TemplateResponse(Application::APP_ID, 'transfer', [
				'isSystemAdmin' => true,
				'transferLastReceipt' => $this->transferReceipts->lastReceipt(),
			]);
		}
		return new RedirectResponse($this->urlGenerator->linkToRoute('homecheck.page.index'));
	}
}
