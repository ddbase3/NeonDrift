<?php declare(strict_types=1);

namespace NeonDrift\Output;

use Base3\Api\IOutput;
use Base3\Api\IRequest;
use Base3\Session\Api\ISession;
use Base3\Usermanager\Api\IUsermanager;
use InvalidArgumentException;
use NeonDrift\Service\NeonDriftProfileStore;
use Throwable;

/**
 * Same-origin, authenticated JSON endpoint for optional player profiles.
 *
 * GET returns a CSRF token and the account's own profile. Mutating requests
 * require POST with the session-bound token. No guest writes are allowed.
 */
final class NeonDriftProfileOutput implements IOutput {

	private const TOKEN_SESSION_KEY = 'neondrift.profile.csrf';

	public function __construct(
		private readonly IRequest $request,
		private readonly ISession $session,
		private readonly IUsermanager $usermanager,
		private readonly NeonDriftProfileStore $profiles
	) {}

	public static function getName(): string {
		return 'neondriftprofileoutput';
	}

	public function getOutput(string $out = 'html', bool $final = false): string {
		if($out !== 'json') {
			return '';
		}

		if(!headers_sent()) {
			header('Content-Type: application/json; charset=utf-8');
			header('Cache-Control: no-store');
		}

		$playerKey = $this->playerKey();
		if($playerKey === null || !$this->session->started()) {
			return $this->response(['ok' => false, 'error' => 'unavailable'], 403);
		}

		$method = strtoupper((string)$this->request->server('REQUEST_METHOD', 'GET'));
		if($method === 'GET') {
			try {
				return $this->response([
					'ok' => true,
					'token' => $this->getToken(),
					'profile' => $this->profiles->get($playerKey)
				]);
			} catch(Throwable $exception) {
				return $this->response(['ok' => false, 'error' => 'storage_unavailable'], 503);
			}
		}

		if($method !== 'POST') {
			return $this->response(['ok' => false, 'error' => 'method_not_allowed'], 405);
		}

		$contentType = strtolower((string)$this->request->server('CONTENT_TYPE', ''));
		if(!str_starts_with($contentType, 'application/json')) {
			return $this->response(['ok' => false, 'error' => 'invalid_content_type'], 415);
		}

		$payload = $this->request->getJsonBody();
		$token = $this->session->get(self::TOKEN_SESSION_KEY, '');
		$submitted = $payload['token'] ?? null;
		if(!is_string($token) || strlen($token) !== 64 || !is_string($submitted) || !hash_equals($token, $submitted)) {
			return $this->response(['ok' => false, 'error' => 'invalid_token'], 403);
		}

		$operation = $payload['operation'] ?? null;
		if(!is_string($operation)) {
			return $this->response(['ok' => false, 'error' => 'invalid_operation'], 400);
		}

		try {
			if($operation === 'delete') {
				$this->profiles->remove($playerKey);
				return $this->response(['ok' => true, 'profile' => []]);
			}
			$profile = $this->profiles->write($playerKey, $operation, $payload);
			return $this->response(['ok' => true, 'profile' => $profile]);
		} catch(InvalidArgumentException $exception) {
			return $this->response(['ok' => false, 'error' => 'invalid_data'], 400);
		} catch(Throwable $exception) {
			return $this->response(['ok' => false, 'error' => 'storage_unavailable'], 503);
		}
	}

	/**
	 * @return string|null Opaque record name derived from the authenticated account.
	 */
	private function playerKey(): ?string {
		$user = $this->usermanager->getUser();
		$id = $user?->id;
		if((!is_int($id) && !is_string($id)) || $id === '' || $id === 0 || $id === '0') {
			return null;
		}
		return 'user_' . hash('sha256', (string)$id);
	}

	/**
	 * @return string Cryptographically random, session-bound CSRF token.
	 */
	private function getToken(): string {
		$token = $this->session->get(self::TOKEN_SESSION_KEY, '');
		if(!is_string($token) || strlen($token) !== 64) {
			$token = bin2hex(random_bytes(32));
			$this->session->set(self::TOKEN_SESSION_KEY, $token);
		}
		return $token;
	}

	/**
	 * @param array $body JSON response payload.
	 * @param int $status HTTP status where the host permits sending it.
	 * @return string JSON response body.
	 */
	private function response(array $body, int $status = 200): string {
		if(!headers_sent()) {
			http_response_code($status);
		}
		return json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
	}
}
