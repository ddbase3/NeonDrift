<?php declare(strict_types=1);

namespace NeonDrift\Test;

use Base3\Api\IRequest;
use Base3\Session\Api\ISession;
use Base3\Settings\Api\ISettingsStore;
use Base3\Usermanager\Api\IUsermanager;
use NeonDrift\Output\NeonDriftProfileOutput;
use NeonDrift\Service\NeonDriftProfileStore;
use PHPUnit\Framework\TestCase;

final class NeonDriftProfileOutputTest extends TestCase {

	public function testUnauthenticatedRequestsCannotReadGameProfiles(): void {
		$request = $this->createMock(IRequest::class);
		$session = $this->createMock(ISession::class);
		$usermanager = $this->createMock(IUsermanager::class);
		$usermanager->method('getUser')->willReturn(null);
		$settings = $this->createMock(ISettingsStore::class);
		$settings->expects(self::never())->method('get');
		$output = new NeonDriftProfileOutput($request, $session, $usermanager, new NeonDriftProfileStore($settings));
		$result = json_decode($output->getOutput('json'), true, 512, JSON_THROW_ON_ERROR);
		self::assertSame('unavailable', $result['error']);
	}

	public function testGetReturnsOnlyOwnDataAndSessionToken(): void {
		$request = $this->createMock(IRequest::class);
		$request->method('server')->willReturnCallback(static fn(string $key, mixed $default) => $key === 'REQUEST_METHOD' ? 'GET' : $default);
		$session = $this->createMock(ISession::class);
		$session->method('started')->willReturn(true);
		$session->method('get')->willReturn('a' . str_repeat('b', 63));
		$usermanager = $this->createMock(IUsermanager::class);
		$usermanager->method('getUser')->willReturn((object)['id' => 42]);
		$settings = $this->createMock(ISettingsStore::class);
		$settings->expects(self::once())->method('get')
			->with('neondrift_player_profiles', 'user_' . hash('sha256', '42'), [])
			->willReturn(['version' => 1, 'best' => 250]);
		$output = new NeonDriftProfileOutput($request, $session, $usermanager, new NeonDriftProfileStore($settings));
		$result = json_decode($output->getOutput('json'), true, 512, JSON_THROW_ON_ERROR);
		self::assertTrue($result['ok']);
		self::assertSame(250, $result['profile']['best']);
		self::assertSame('a' . str_repeat('b', 63), $result['token']);
	}

	public function testPostRequiresValidCsrfToken(): void {
		$request = $this->createMock(IRequest::class);
		$request->method('server')->willReturnCallback(static fn(string $key, mixed $default) => match($key) {
			'REQUEST_METHOD' => 'POST', 'CONTENT_TYPE' => 'application/json', default => $default
		});
		$request->method('getJsonBody')->willReturn(['operation' => 'delete', 'token' => 'wrong']);
		$session = $this->createMock(ISession::class);
		$session->method('started')->willReturn(true);
		$session->method('get')->willReturn(str_repeat('a', 64));
		$usermanager = $this->createMock(IUsermanager::class);
		$usermanager->method('getUser')->willReturn((object)['id' => 42]);
		$settings = $this->createMock(ISettingsStore::class);
		$settings->expects(self::never())->method('remove');
		$output = new NeonDriftProfileOutput($request, $session, $usermanager, new NeonDriftProfileStore($settings));
		$result = json_decode($output->getOutput('json'), true, 512, JSON_THROW_ON_ERROR);
		self::assertSame('invalid_token', $result['error']);
	}

	protected function tearDown(): void {
		http_response_code(200);
		parent::tearDown();
	}
}
