<?php

declare(strict_types=1);

/**
 * HomeCheck wiring for the shared transfer engine.
 *
 *  - requireTransferAdmin gates on the app's real door-admin role — the
 *    only admin surface HomeCheck has is the NC admin settings page, so
 *    door-admin == Nextcloud system admin (same check ApiController uses).
 *  - validateValue/normalizeValue run the SAME validator the admin write
 *    path applies — LayoutService::saveAdminTemplate delegates to
 *    LayoutValidator::validate($tpl, false) and stores revision 0; the
 *    normaliser reproduces that byte-for-byte (validator parity, NN-08).
 *  - No access door / platform restriction mirror exists → no mirrored
 *    keys; writeMirrored stays a NO_MIRRORED_KEYS guard.
 *  - createSafetySnapshot returns null: HomeCheck has no snapshot facility
 *    — the Service\UpgradeBackupService stub only carries the shared
 *    LOCK_KEY constant the engine locks against.
 */

namespace OCA\HomeCheck\ConfigTransfer;

use OCA\HomeCheck\Exception\DomainException;
use OCA\HomeCheck\Service\LayoutService;
use OCA\HomeCheck\Service\LayoutValidator;
use OCP\IGroupManager;
use Psr\Log\LoggerInterface;

final class TransferHooks implements ConfigTransferHooks
{
	public function __construct(
		private readonly LayoutValidator $validator,
		private readonly IGroupManager $groupManager,
		private readonly LoggerInterface $logger,
	) {
	}

	public function requireTransferAdmin(string $uid): void
	{
		if ($uid === '' || !$this->groupManager->isAdmin($uid)) {
			throw new DomainException('forbidden', 'Admin required', 403);
		}
	}

	public function validateValue(string $key, string $value): ?string
	{
		try {
			$this->normalize($key, $value);
			return null;
		} catch (DomainException $e) {
			return $e->errorCode !== '' ? $e->errorCode : 'INVALID_VALUE';
		} catch (\InvalidArgumentException $e) {
			return $e->getMessage() !== '' ? $e->getMessage() : 'INVALID_VALUE';
		} catch (\JsonException) {
			return 'INVALID_JSON';
		} catch (\Throwable) {
			return 'INVALID_VALUE';
		}
	}

	public function normalizeValue(string $key, string $value): string
	{
		try {
			return $this->normalize($key, $value);
		} catch (\Throwable) {
			return $value; // validateValue already rejected bad input
		}
	}

	private function normalize(string $key, string $value): string
	{
		if ($key === LayoutService::APP_SEED_KEY) {
			// Same path as LayoutService::saveAdminTemplate: decode → admin
			// validation → revision pinned to 0 → canonical JSON storage form.
			$decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
			$validated = $this->validator->validate($decoded, false);
			$validated['revision'] = 0;
			return json_encode($validated, JSON_THROW_ON_ERROR);
		}
		// Not a settings-surface key — size guard only.
		return strlen($value) <= 65536
			? $value
			: throw new \InvalidArgumentException('TOO_LONG');
	}

	public function validateMirrored(array $keyValues): ?string
	{
		return $keyValues === [] ? null : 'NO_MIRRORED_KEYS';
	}

	public function writeMirrored(array $keyValues): void
	{
		if ($keyValues !== []) {
			throw new \InvalidArgumentException('NO_MIRRORED_KEYS');
		}
	}

	public function securityRelevantKeys(): array
	{
		// No access door, allowlists, or credential surfaces exist — the only
		// transferable key is the admin seed layout (UX template, not access
		// control).
		return [];
	}

	public function createSafetySnapshot(string $reason): ?string
	{
		// No snapshot facility exists in HomeCheck (UpgradeBackupService stub
		// carries only the shared LOCK_KEY) — nothing to delegate to.
		return null;
	}

	public function settingsSectionForKey(string $key): ?string
	{
		// The seed template lives on the NC admin settings 'additional'
		// section; internal bookkeeping keys get no "set it here" link.
		return $key === LayoutService::APP_SEED_KEY ? 'additional' : null;
	}

	public function auditEvent(string $action, string $actor, array $details): void
	{
		// HomeCheck has no audit store — the contract allows delegating to
		// the logger; never silent (MH-08).
		$this->logger->info('homecheck: config transfer ' . $action, [
			'app' => 'homecheck',
			'actor' => $actor === '' ? 'cli' : $actor,
			'details' => $details,
		]);
	}
}
