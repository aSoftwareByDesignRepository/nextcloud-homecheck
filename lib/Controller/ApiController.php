<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\HomeCheck\Controller;

use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\LayoutService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserSession;

class ApiController extends Controller
{
	use ApiJsonTrait;

	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IUserSession $userSession,
		private readonly IGroupManager $groupManager,
		private readonly LayoutService $layouts,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	public function getLayout(): JSONResponse
	{
		try {
			$uid = $this->requireUid();
			return $this->ok($this->layouts->getForUser($uid));
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	#[NoAdminRequired]
	public function putLayout(): JSONResponse
	{
		try {
			$uid = $this->requireUid();
			$layout = $this->request->getParam('layout');
			if (!is_array($layout)) {
				$raw = file_get_contents('php://input');
				if (is_string($raw) && $raw !== '') {
					try {
						$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
						if (is_array($decoded) && isset($decoded['layout']) && is_array($decoded['layout'])) {
							$layout = $decoded['layout'];
						}
					} catch (\JsonException) {
						$layout = null;
					}
				}
			}
			if (!is_array($layout) || !isset($layout['items'])) {
				return $this->fail('layout_version', Http::STATUS_BAD_REQUEST, 'Missing layout');
			}
			$result = $this->layouts->saveForUser($uid, $layout);
			if (!$result['apporderSynced']) {
				$result['warning'] = 'apporder_sync_failed';
				return $this->ok($result, Http::STATUS_BAD_GATEWAY);
			}
			return $this->ok($result);
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	#[NoAdminRequired]
	public function syncAppOrder(): JSONResponse
	{
		try {
			$uid = $this->requireUid();
			$result = $this->layouts->resyncAppOrderForUser($uid);
			if (!$result['apporderSynced']) {
				$result['warning'] = 'apporder_sync_failed';
				return $this->ok($result, Http::STATUS_BAD_GATEWAY);
			}
			return $this->ok($result);
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	#[NoAdminRequired]
	public function defaultLanding(): JSONResponse
	{
		try {
			$uid = $this->requireUid();
			$params = $this->request->getParams();
			$raw = file_get_contents('php://input');
			if (is_string($raw) && $raw !== '') {
				try {
					$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
					if (is_array($decoded)) {
						$params = array_merge($params, $decoded);
					}
				} catch (\JsonException) {
					// keep query/body params
				}
			}
			$hasEnable = array_key_exists('enable', $params);
			$hasDismiss = array_key_exists('dismiss', $params);
			if (!$hasEnable && !$hasDismiss) {
				return $this->fail('validation_failed', Http::STATUS_BAD_REQUEST, 'enable or dismiss required');
			}
			$enable = $hasEnable && filter_var($params['enable'], FILTER_VALIDATE_BOOLEAN);
			$dismiss = $hasDismiss && filter_var($params['dismiss'], FILTER_VALIDATE_BOOLEAN);
			if ($dismiss && !$enable) {
				$this->layouts->dismissCta($uid);
				return $this->ok(['dismissed' => true, 'isDefaultLanding' => $this->layouts->isDefaultLanding($uid)]);
			}
			$this->layouts->setDefaultLanding($uid, $enable, $dismiss || $enable);
			return $this->ok([
				'isDefaultLanding' => $this->layouts->isDefaultLanding($uid),
				'ctaDismissed' => true,
			]);
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	public function getAdminTemplate(): JSONResponse
	{
		try {
			$this->requireAdmin();
			return $this->ok(['template' => $this->layouts->getAdminTemplate()]);
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	public function putAdminTemplate(): JSONResponse
	{
		try {
			$this->requireAdmin();
			$params = $this->request->getParams();
			$template = $this->request->getParam('template');
			$hasTemplateKey = array_key_exists('template', $params);
			if (!$hasTemplateKey) {
				$raw = file_get_contents('php://input');
				if (is_string($raw) && $raw !== '') {
					try {
						$decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
						if (is_array($decoded) && array_key_exists('template', $decoded)) {
							$template = $decoded['template'];
							$hasTemplateKey = true;
						}
					} catch (\JsonException) {
						// fall through
					}
				}
			}
			if ($hasTemplateKey && $template === null) {
				$saved = $this->layouts->saveAdminTemplate(null);
				return $this->ok(['template' => $saved]);
			}
			if (!is_array($template)) {
				return $this->fail('layout_version', Http::STATUS_BAD_REQUEST, 'Missing template');
			}
			$saved = $this->layouts->saveAdminTemplate($template);
			return $this->ok(['template' => $saved]);
		} catch (DomainException $e) {
			return $this->fromDomain($e);
		}
	}

	private function fromDomain(DomainException $e): JSONResponse
	{
		return $this->fail($e->errorCode, $e->httpStatus, $e->getMessage(), $e->payload);
	}

	private function requireUid(): string
	{
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new DomainException('unauthorized', 'Login required', 401);
		}
		return $user->getUID();
	}

	private function requireAdmin(): void
	{
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new DomainException('unauthorized', 'Login required', 401);
		}
		if (!$this->groupManager->isAdmin($user->getUID())) {
			throw new DomainException('forbidden', 'Admin required', 403);
		}
	}
}
