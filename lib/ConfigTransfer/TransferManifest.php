<?php

declare(strict_types=1);

/**
 * HomeCheck transfer manifest — every appconfig key classified exactly once
 * (gate: scripts/check-config-transfer-manifest.py).
 *
 * HomeCheck owns NO app tables: per-user layouts live in the NC `preferences`
 * store (LayoutWriteGuard) — platform per-user state, excluded by spec AS-05.
 * The admin-facing surface is the NC settings 'additional' section plus the
 * dedicated /settings/transfer page (PageController::settings).
 */

namespace OCA\HomeCheck\ConfigTransfer;

final class TransferManifest extends AbstractTransferManifest
{
	private const SCHEMA_VERSION = 1;

	public function schemaVersion(): int
	{
		return self::SCHEMA_VERSION;
	}

	/** @return array<string,array> */
	public function keys(): array
	{
		return self::normaliseKeys([
			// ── admin seed layout (Settings → Administration → Additional) ──
			// JSON document {version:1,items:[app|folder…]} — nav entry ids
			// only, no uid/gid/file-id references → plain transferable config.
			'seed_template_v1' => ['class' => 'plain', 'section' => 'additional'],
			// ── internal bookkeeping — never transferred ──
			'uninstall_repair_pass' => 'internal',
			'transfer_receipts' => 'internal',
			'transfer_job_state' => 'internal',
			'transfer_last_import_at' => 'internal',
			// Per-user keys (layout_v1, default_cta_dismissed) live in
			// oc_preferences — AS-05 platform per-user state, not appconfig.
		]);
	}

	/** @return array<string,array> */
	public function tables(): array
	{
		return self::normaliseTables([
			// HomeCheck owns no DB tables (UninstallDropTables::TABLES is
			// empty by design). Nothing to declare.
		]);
	}
}
