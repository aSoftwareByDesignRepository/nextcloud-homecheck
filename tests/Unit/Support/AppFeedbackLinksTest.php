<?php

declare(strict_types=1);

namespace OCA\HomeCheck\Tests\Unit\Support;

use OCA\HomeCheck\Support\AppFeedbackLinks;
use PHPUnit\Framework\TestCase;

final class AppFeedbackLinksTest extends TestCase
{
	public function testProblemMailtoUsesDevInboxAndEncodedSubject(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck', '1.2.3');
		$en = $links->problemMailto(['pageUrl' => '/apps/homecheck/today'], 'en');
		$de = $links->problemMailto(['pageUrl' => '/apps/homecheck/today'], 'de');
		self::assertStringStartsWith('mailto:dev@software-by-design.de?subject=', $en);
		self::assertStringContainsString(rawurlencode('HomeCheck: Problem report'), $en);
		self::assertStringContainsString(rawurlencode('HomeCheck: Fehlermeldung'), $de);
		self::assertStringContainsString('body=', $en);
		self::assertStringNotContainsString("\n", $en);
		self::assertStringNotContainsString('info@software-by-design.de', $en);
	}

	public function testIdeaMailtoUsesFeedbackSubject(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck');
		$href = $links->ideaMailto([], 'de');
		self::assertStringContainsString(rawurlencode('HomeCheck: Feedback'), $href);
	}

	public function testGithubIssuesUrlIsPublicVendorRepo(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck');
		self::assertSame(
			'https://github.com/aSoftwareByDesignRepository/nextcloud-homecheck/issues',
			$links->githubIssuesUrl()
		);
	}

	public function testSanitizePageUrlStripsCredentialQueryKeys(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck');
		$clean = $links->sanitizePageUrl('https://cloud.example/apps/homecheck/x?token=abc&keep=1&password=no');
		self::assertStringContainsString('keep=1', $clean);
		self::assertStringNotContainsString('token=', $clean);
		self::assertStringNotContainsString('password=', $clean);
		self::assertSame('', $links->sanitizePageUrl('javascript:alert(1)'));
		self::assertSame('', $links->sanitizePageUrl('data:text/html,<script>alert(1)</script>'));
		self::assertSame('', $links->sanitizePageUrl('vbscript:msgbox(1)'));
		self::assertSame('', $links->sanitizePageUrl("https://x.example/\r\nBcc:evil@example.com"));
		$keep = $links->sanitizePageUrl('https://cloud.example/apps/homecheck/list?keep=1&token=abc');
		self::assertStringContainsString('keep=1', $keep);
		self::assertStringNotContainsString('token=', $keep);
	}

	public function testSanitizePageUrlStripsNextcloudUpgradeAckQueryKey(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck');
		$noisy = '/apps/homecheck/?IKnowThatThisIsABigInstanceAndTheUpdateRequestCouldRunIntoATimeoutAndHowToRestoreABackup=IAmSuperSureToDoThis';
		self::assertSame('/apps/homecheck/', $links->sanitizePageUrl($noisy));
	}

	public function testMailtoBodyOmitsIdentityAndRejectsUnsafeErrorCodes(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck', '9.9.9');
		$href = $links->problemMailto([
			'errorCode' => 'CONFLICT',
			'pageUrl' => '/apps/homecheck/',
		], 'en');
		$body = urldecode((string)(parse_url($href, PHP_URL_QUERY) ? explode('body=', (string)parse_url($href, PHP_URL_QUERY), 2)[1] ?? '' : ''));
		self::assertStringContainsString('Error code: CONFLICT', $body);
		self::assertStringContainsString('App id: homecheck', $body);
		self::assertStringNotContainsString('uid=', $body);
		self::assertStringNotContainsString('@', explode('--- Auto-filled', $body)[1] ?? $body);

		$bad = $links->problemMailto(['errorCode' => 'x <script>'], 'en');
		$badBody = urldecode((string)(parse_url($bad, PHP_URL_QUERY) ? explode('body=', (string)parse_url($bad, PHP_URL_QUERY), 2)[1] ?? '' : ''));
		self::assertStringNotContainsString('Error code:', $badBody);
	}

	public function testRejectsUnsafeDisplayName(): void
	{
		$this->expectException(\InvalidArgumentException::class);
		new AppFeedbackLinks('homecheck', "Evil\r\nBcc: attacker@example.com");
	}

	public function testForLocalePayload(): void
	{
		$links = new AppFeedbackLinks('homecheck', 'HomeCheck', '1.0.0');
		$payload = $links->forLocale('de', ['pageUrl' => '/apps/homecheck/']);
		self::assertSame('dev@software-by-design.de', $payload['feedbackEmail']);
		self::assertStringStartsWith('mailto:dev@software-by-design.de', $payload['problemMailto']);
		self::assertStringStartsWith('mailto:dev@software-by-design.de', $payload['ideaMailto']);
		self::assertStringStartsWith('https://github.com/aSoftwareByDesignRepository/', $payload['githubIssuesUrl']);
		self::assertSame('homecheck', $payload['appId']);
	}
}
