<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Controller;

use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Util;

class PageController extends Controller
{
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IUserSession $userSession,
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
			'layout' => ['version' => 1, 'revision' => 0, 'items' => []],
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
		Util::addStyle('homecheck', 'app');

		return new TemplateResponse('homecheck', 'main', [
			'initialState' => $payload,
		]);
	}
}
