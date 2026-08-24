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
	],
];
