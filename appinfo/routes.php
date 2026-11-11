<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'api#getLayout', 'url' => '/api/layout', 'verb' => 'GET'],
		['name' => 'api#putLayout', 'url' => '/api/layout', 'verb' => 'PUT'],
		['name' => 'api#syncAppOrder', 'url' => '/api/sync-apporder', 'verb' => 'POST'],
		['name' => 'api#defaultLanding', 'url' => '/api/default-landing', 'verb' => 'POST'],
		['name' => 'api#getAdminTemplate', 'url' => '/api/admin/template', 'verb' => 'GET'],
		['name' => 'api#putAdminTemplate', 'url' => '/api/admin/template', 'verb' => 'PUT'],
		// Dedicated transfer settings page (admins only, gated in controller)
		['name' => 'page#settings', 'url' => '/settings/{section}', 'verb' => 'GET', 'requirements' => ['section' => '[a-z-]*'], 'defaults' => ['section' => '']],
		// ── Config & data transfer (test → production) ──────────────────
		['name' => 'transfer_api#status', 'url' => '/api/admin/transfer/status', 'verb' => 'GET'],
		['name' => 'transfer_api#export', 'url' => '/api/admin/transfer/export', 'verb' => 'POST'],
		['name' => 'transfer_api#preview', 'url' => '/api/admin/transfer/preview', 'verb' => 'POST'],
		['name' => 'transfer_api#apply', 'url' => '/api/admin/transfer/apply', 'verb' => 'POST'],
		['name' => 'transfer_api#reconcile', 'url' => '/api/admin/transfer/reconcile', 'verb' => 'POST'],
	],
];
