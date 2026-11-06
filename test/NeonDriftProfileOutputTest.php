<?php declare(strict_types=1);

namespace NeonDrift\Test;

use Base3\Api\IRequest;
use Base3\Session\Api\ISession;
use Base3\Usermanager\Api\IUsermanager;
use Base3\Usermanager\User;
use NeonDrift\Output\NeonDriftProfileOutput;
use NeonDrift\Service\NeonDriftProfileStore;
use NeonDrift\Test\Support\NeonDriftSettingsStoreFake;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NeonDriftProfileOutputTest extends TestCase {

	private const GROUP = 'neondrift_player_profiles';
	private const TOKEN = 'aabb' . '000000000000000000000000000000000000000000000000000000000000';

	public function testNameAndUnsupportedOutputFormatNeverAccessSessionOrProfile(): void {
		$request = $this->createMock(IRequest::class);
		$request->expects(self::never())->method('server');
		$session = $this->createMock(ISession::class);
		$session->expects(self::never())->method('started');
		$user = $this->createMock(IUsermanager::class);
		$user->expects(self::never())->method('getUser');
		$endpoint = new NeonDriftProfileOutput($request, $session, $user, new NeonDriftProfileStore(new NeonDriftSettingsStoreFake()));
		self::assertSame('neondriftprofileoutput', NeonDriftProfileOutput::getName());
		self::assertSame('', $endpoint->getOutput('html'));
	}

	/** @return array<string,array{mixed}> */
	public static function invalidIdentities(): array {
		return [
			'anonymous' => [null],
			'missing id' => [null],
			'empty id' => [''],
			'zero integer' => [0],
			'zero string' => ['0'],
			'array id' => [[]],
			'floating id' => [2.5]
		];
	}

	#[DataProvider('invalidIdentities')]
	public function testUnauthenticatedAndInvalidIdentitiesCannotReadOrWriteProfiles(mixed $id): void {
		$settings = new NeonDriftSettingsStoreFake();
		$user = $this->createMock(IUsermanager::class);
		$user->method('getUser')->willReturn($id === null ? null : User::fromArray(['id' => $id]));
		$session = $this->createMock(ISession::class);
		$session->expects(self::never())->method('get');
		$request = $this->createMock(IRequest::class);
		$request->expects(self::never())->method('getJsonBody');
		$endpoint = new NeonDriftProfileOutput($request, $session, $user, new NeonDriftProfileStore($settings));
		self::assertSame(['ok' => false, 'error' => 'unavailable'], $this->body($endpoint));
		self::assertSame(0, $settings->reads);
		self::assertSame(0, $settings->writes);
	}

	public function testKnownUserWithoutActiveSessionIsRejected(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$session = $this->createMock(ISession::class);
		$session->expects(self::once())->method('started')->willReturn(false);
		$user = $this->authenticatedUser(42);
		$request = $this->request('GET');
		$endpoint = new NeonDriftProfileOutput($request, $session, $user, new NeonDriftProfileStore($settings));
		self::assertSame('unavailable', $this->body($endpoint)['error']);
		self::assertSame(0, $settings->reads);
	}

	public function testGetReturnsOnlyCurrentUsersProfileAndReusesValidToken(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP]['user_' . hash('sha256', '42')] = ['best' => 10];
		$settings->records[self::GROUP]['user_' . hash('sha256', '43')] = ['best' => 999];
		$session = $this->session(self::TOKEN);
		$session->expects(self::never())->method('set');
		$endpoint = new NeonDriftProfileOutput(
			$this->request('GET'), $session, $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		self::assertSame([
			'ok' => true,
			'token' => self::TOKEN,
			'profile' => ['best' => 10]
		], $this->body($endpoint));
		self::assertSame(1, $settings->reads);
		self::assertSame(0, $settings->writes);
	}

	public function testStringIdUsesExactIdentityAndDoesNotNormalizeLeadingZeros(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP]['user_' . hash('sha256', '0042')] = ['best' => 81];
		$endpoint = new NeonDriftProfileOutput(
			$this->request('GET'), $this->session(self::TOKEN),
			$this->authenticatedUser('0042'), new NeonDriftProfileStore($settings)
		);
		self::assertSame(81, $this->body($endpoint)['profile']['best']);
	}

	public function testGetCreatesAndPersistsSessionTokenWhenMissingOrInvalid(): void {
		foreach([null, false, '', 'short', str_repeat('a', 63), str_repeat('b', 65)] as $storedToken) {
			$sessionToken = $storedToken;
			$session = $this->createMock(ISession::class);
			$session->method('started')->willReturn(true);
			$session->method('get')->willReturnCallback(static function(string $key, mixed $default) use (&$sessionToken): mixed {
				self::assertSame('neondrift.profile.csrf', $key);
				return $sessionToken;
			});
			$session->expects(self::once())->method('set')->willReturnCallback(
				static function(string $key, mixed $value) use (&$sessionToken): void {
					self::assertSame('neondrift.profile.csrf', $key);
					self::assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $value);
					$sessionToken = $value;
				}
			);
			$endpoint = new NeonDriftProfileOutput(
				$this->request('GET'), $session, $this->authenticatedUser(42),
				new NeonDriftProfileStore(new NeonDriftSettingsStoreFake())
			);
			$first = $this->body($endpoint);
			$second = $this->body($endpoint);
			self::assertSame($first['token'], $second['token']);
			self::assertSame([], $first['profile']);
		}
	}

	public function testGetStorageFailureIsReportedWithoutLeakingDetails(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->failReads = true;
		$endpoint = new NeonDriftProfileOutput(
			$this->request('GET'), $this->session(self::TOKEN), $this->authenticatedUser(42),
			new NeonDriftProfileStore($settings)
		);
		self::assertSame(['ok' => false, 'error' => 'storage_unavailable'], $this->body($endpoint));
	}

	/** @return array<string,array{string}> */
	public static function unsupportedMethods(): array {
		return ['put' => ['PUT'], 'patch' => ['PATCH'], 'delete' => ['DELETE'], 'options' => ['OPTIONS']];
	}

	#[DataProvider('unsupportedMethods')]
	public function testOnlyGetAndPostAreSupported(string $method): void {
		$request = $this->request($method);
		$endpoint = new NeonDriftProfileOutput($request, $this->session(self::TOKEN),
			$this->authenticatedUser(42), new NeonDriftProfileStore(new NeonDriftSettingsStoreFake()));
		self::assertSame('method_not_allowed', $this->body($endpoint)['error']);
	}

	/** @return array<string,array{string}> */
	public static function invalidContentTypes(): array {
		return ['missing' => [''], 'form' => ['application/x-www-form-urlencoded'], 'text' => ['text/plain']];
	}

	#[DataProvider('invalidContentTypes')]
	public function testPostRequiresJsonContentType(string $contentType): void {
		$request = $this->request('POST', $contentType);
		$endpoint = new NeonDriftProfileOutput($request, $this->session(self::TOKEN),
			$this->authenticatedUser(42), new NeonDriftProfileStore(new NeonDriftSettingsStoreFake()));
		self::assertSame('invalid_content_type', $this->body($endpoint)['error']);
	}

	/** @return array<string,array{mixed,mixed}> */
	public static function invalidTokens(): array {
		return [
			'no saved token' => ['', self::TOKEN],
			'wrong saved type' => [false, self::TOKEN],
			'too short saved token' => [str_repeat('a', 63), self::TOKEN],
			'absent submitted token' => [self::TOKEN, null],
			'wrong submitted type' => [self::TOKEN, ['token']],
			'bad submitted token' => [self::TOKEN, str_repeat('b', 64)],
			'too short submitted token' => [self::TOKEN, 'a']
		];
	}

	#[DataProvider('invalidTokens')]
	public function testPostRejectsInvalidCsrfTokensWithoutAnyWrite(mixed $stored, mixed $submitted): void {
		$settings = new NeonDriftSettingsStoreFake();
		$endpoint = new NeonDriftProfileOutput(
			$this->request('POST', 'application/json', ['operation' => 'delete', 'token' => $submitted]),
			$this->session($stored), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		self::assertSame('invalid_token', $this->body($endpoint)['error']);
		self::assertSame(0, $settings->deletions);
		self::assertSame(0, $settings->writes);
	}

	public function testPostAcceptsCaseInsensitiveJsonContentTypeWithCharset(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$payload = $this->writePayload('save');
		$endpoint = new NeonDriftProfileOutput(
			$this->request('post', 'Application/JSON; charset=utf-8', $payload),
			$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		self::assertTrue($this->body($endpoint)['ok']);
		self::assertSame(1, $settings->writes);
	}

	/** @return array<string,array{mixed}> */
	public static function invalidOperations(): array {
		return ['missing' => [null], 'integer' => [42], 'boolean' => [true], 'array' => [[]]];
	}

	#[DataProvider('invalidOperations')]
	public function testPostRejectsNonStringOperation(mixed $operation): void {
		$settings = new NeonDriftSettingsStoreFake();
		$endpoint = new NeonDriftProfileOutput(
			$this->request('POST', 'application/json', ['operation' => $operation, 'token' => self::TOKEN]),
			$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		self::assertSame('invalid_operation', $this->body($endpoint)['error']);
		self::assertSame(0, $settings->writes);
	}

	public function testUnknownOperationAndInvalidGameplayAreControlledErrors(): void {
		foreach([
			['operation' => 'unsupported', 'token' => self::TOKEN],
			['operation' => 'save', 'token' => self::TOKEN, 'score' => '100', 'level' => 1, 'elapsed' => 1, 'energy' => 2]
		] as $payload) {
			$settings = new NeonDriftSettingsStoreFake();
			$endpoint = new NeonDriftProfileOutput(
				$this->request('POST', 'application/json', $payload),
				$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
			);
			self::assertSame(['ok' => false, 'error' => 'invalid_data'], $this->body($endpoint));
			self::assertSame(0, $settings->writes);
		}
	}

	/** @return array<string,array{string}> */
	public static function supportedWrites(): array {
		return ['save' => ['save'], 'advance' => ['advance'], 'record' => ['record']];
	}

	#[DataProvider('supportedWrites')]
	public function testAuthenticatedWritesPersistOnlyTheirOwnProfile(string $operation): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP]['user_' . hash('sha256', '73')] = ['best' => 888];
		$endpoint = new NeonDriftProfileOutput(
			$this->request('POST', 'application/json', $this->writePayload($operation)),
			$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		$result = $this->body($endpoint);
		self::assertTrue($result['ok']);
		self::assertSame(350, $result['profile']['best']);
		self::assertSame(350, $settings->records[self::GROUP]['user_' . hash('sha256', '42')]['best']);
		self::assertSame(['best' => 888], $settings->records[self::GROUP]['user_' . hash('sha256', '73')]);
		self::assertSame(1, $settings->saves);
	}

	public function testDeleteOnlyRemovesActiveUsersProfile(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP] = [
			'user_' . hash('sha256', '42') => ['best' => 200],
			'user_' . hash('sha256', '43') => ['best' => 400]
		];
		$endpoint = new NeonDriftProfileOutput(
			$this->request('POST', 'application/json', ['token' => self::TOKEN, 'operation' => 'delete']),
			$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
		);
		self::assertSame(['ok' => true, 'profile' => []], $this->body($endpoint));
		self::assertFalse(isset($settings->records[self::GROUP]['user_' . hash('sha256', '42')]));
		self::assertSame(['best' => 400], $settings->records[self::GROUP]['user_' . hash('sha256', '43')]);
		self::assertSame(1, $settings->deletions);
	}

	public function testStorageReadWriteAndDeleteFailuresHaveSameSafeError(): void {
		foreach(['ignoreWrites', 'failWrites', 'failSaves', 'ignoreDeletions', 'failDeletions'] as $flag) {
			$settings = new NeonDriftSettingsStoreFake();
			$settings->records[self::GROUP]['user_' . hash('sha256', '42')] = ['best' => 4];
			$settings->$flag = true;
			$delete = str_contains($flag, 'Deletions');
			$payload = $delete ? ['token' => self::TOKEN, 'operation' => 'delete'] : $this->writePayload('save');
			$endpoint = new NeonDriftProfileOutput(
				$this->request('POST', 'application/json', $payload),
				$this->session(self::TOKEN), $this->authenticatedUser(42), new NeonDriftProfileStore($settings)
			);
			// An ignored write is only a failure if this user's record does not already exist.
			if($flag === 'ignoreWrites') {
				unset($settings->records[self::GROUP]['user_' . hash('sha256', '42')]);
			}
			self::assertSame(['ok' => false, 'error' => 'storage_unavailable'], $this->body($endpoint), $flag);
		}
	}

	/** @param array<string,mixed> $payload */
	private function request(string $method, string $contentType = '', array $payload = []): IRequest {
		$request = $this->createMock(IRequest::class);
		$request->method('server')->willReturnCallback(
			static fn(string $key, mixed $default = null): mixed => match($key) {
				'REQUEST_METHOD' => $method,
				'CONTENT_TYPE' => $contentType,
				default => $default
			}
		);
		$request->method('getJsonBody')->willReturn($payload);
		return $request;
	}

	private function session(mixed $token): ISession {
		$session = $this->createMock(ISession::class);
		$session->method('started')->willReturn(true);
		$session->method('get')->willReturn($token);
		return $session;
	}

	private function authenticatedUser(int|string $id): IUsermanager {
		$usermanager = $this->createMock(IUsermanager::class);
		$usermanager->method('getUser')->willReturn(User::fromArray(['id' => $id]));
		return $usermanager;
	}

	/** @return array<string,mixed> */
	private function writePayload(string $operation): array {
		return ['token' => self::TOKEN, 'operation' => $operation,
			'score' => 350, 'level' => 3, 'elapsed' => 48, 'energy' => 2];
	}

	/** @return array<string,mixed> */
	private function body(NeonDriftProfileOutput $endpoint): array {
		return json_decode($endpoint->getOutput('json'), true, 512, JSON_THROW_ON_ERROR);
	}

	protected function tearDown(): void {
		http_response_code(200);
		parent::tearDown();
	}
}
