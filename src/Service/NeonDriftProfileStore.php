<?php declare(strict_types=1);

namespace NeonDrift\Service;

use Base3\Settings\Api\ISettingsStore;
use InvalidArgumentException;

/**
 * Stores a single opt-in arcade profile per authenticated account.
 *
 * SettingsStore owns persistence and schema. Scores are client-reported and
 * deliberately private: they are not suitable for a competitive leaderboard.
 */
final class NeonDriftProfileStore {

	private const GROUP = 'neondrift_player_profiles';

	public function __construct(private readonly ISettingsStore $settingsStore) {}

	/**
	 * Read the player's own saved profile.
	 *
	 * @param string $playerKey Server-derived, pseudonymous settings-record key.
	 * @return array Player's profile, or an empty array when nothing is saved.
	 */
	public function get(string $playerKey): array {
		return $this->settingsStore->get(self::GROUP, $playerKey, []);
	}

	/**
	 * Persist a checkpoint or record a completed run.
	 *
	 * This method only accepts gameplay values within strict integer ranges.
	 * It never accepts a player identifier from the browser. A finished run
	 * updates the best score but retains the player's latest checkpoint.
	 *
	 * @param string $playerKey Server-derived account key.
	 * @param string $operation One of 'save', 'advance', or 'record'.
	 * @param array $payload JSON request data supplied by the player.
	 * @return array The complete updated profile.
	 * @throws InvalidArgumentException For unsupported actions or invalid input.
	 */
	public function write(string $playerKey, string $operation, array $payload): array {
		if(!in_array($operation, ['save', 'advance', 'record'], true)) {
			throw new InvalidArgumentException('Unsupported game profile operation.');
		}

		$score = $this->boundedInteger($payload['score'] ?? null, 0, 2000000000, 'score');
		$level = $this->boundedInteger($payload['level'] ?? null, 1, 999, 'level');
		$elapsed = $this->boundedInteger($payload['elapsed'] ?? null, 0, 604800, 'elapsed');
		$existing = $this->get($playerKey);
		$best = max((int)($existing['best'] ?? 0), $score);
		$bestLevel = max((int)($existing['best_level'] ?? 1), $level);
		$checkpoint = $existing['checkpoint'] ?? null;

		if($operation === 'save' || $operation === 'advance') {
			$energy = $this->boundedInteger($payload['energy'] ?? null, 1, 4, 'energy');
			// Automatic advances must not erase a checkpoint from a deeper run.
			if($operation === 'save' || !is_array($checkpoint) || $level >= (int)($checkpoint['level'] ?? 0)) {
				$checkpoint = [
					'level' => $level,
					'score' => $score,
					'energy' => $energy,
					'elapsed' => $elapsed,
					'saved_at' => gmdate('c')
				];
			}
		}

		$profile = [
			'version' => 1,
			'best' => $best,
			'best_level' => $bestLevel,
			'checkpoint' => $checkpoint,
			'updated_at' => gmdate('c')
		];
		$this->settingsStore->set(self::GROUP, $playerKey, $profile);
		$this->settingsStore->save();
		// NoSettingsStore implementations must not report a successful save.
		if(!$this->settingsStore->has(self::GROUP, $playerKey)) {
			throw new \RuntimeException('A persistent settings backend is required.');
		}
		return $profile;
	}

	/**
	 * Erase the player's profile and any saved checkpoint.
	 *
	 * @param string $playerKey Server-derived account key.
	 * @return void
	 */
	public function remove(string $playerKey): void {
		$this->settingsStore->remove(self::GROUP, $playerKey);
		$this->settingsStore->save();
		if($this->settingsStore->has(self::GROUP, $playerKey)) {
			throw new \RuntimeException('Unable to remove persistent game profile.');
		}
	}

	/**
	 * @param mixed $value Untrusted request value; booleans/floats are rejected.
	 * @param int $min Inclusive lower bound.
	 * @param int $max Inclusive upper bound.
	 * @param string $field Field name for a safe validation error.
	 * @return int A validated integer.
	 * @throws InvalidArgumentException If the value is not an integer in range.
	 */
	private function boundedInteger(mixed $value, int $min, int $max, string $field): int {
		if(!is_int($value) || $value < $min || $value > $max) {
			throw new InvalidArgumentException('Invalid game profile field: ' . $field);
		}
		return $value;
	}
}
