<?php declare(strict_types=1);

namespace NeonDrift\Test;

use InvalidArgumentException;
use NeonDrift\Service\NeonDriftProfileStore;
use NeonDrift\Test\Support\NeonDriftSettingsStoreFake;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class NeonDriftProfileStoreTest extends TestCase {

	private const GROUP = 'neondrift_player_profiles';
	private const PLAYER = 'user_abc';

	public function testMissingAndPresentProfilesUseTheExactSettingsKey(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		self::assertSame([], $store->get(self::PLAYER));
		$settings->records[self::GROUP][self::PLAYER] = ['best' => 71];
		self::assertSame(['best' => 71], $store->get(self::PLAYER));
		self::assertSame([], $store->get('user_other'));
		self::assertSame(3, $settings->reads);
	}

	public function testSavingCheckpointTracksBestsAndPersistsTimestamps(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		$first = $store->write(self::PLAYER, 'save', [
			'score' => 2000, 'level' => 10, 'elapsed' => 200, 'energy' => 3
		]);
		self::assertSame(1, $first['version']);
		self::assertSame(2000, $first['best']);
		self::assertSame(10, $first['best_level']);
		self::assertSame(['level' => 10, 'score' => 2000, 'energy' => 3, 'elapsed' => 200],
			array_intersect_key($first['checkpoint'], array_flip(['level', 'score', 'energy', 'elapsed'])));
		self::assertNotFalse(\DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $first['checkpoint']['saved_at']));
		self::assertNotFalse(\DateTimeImmutable::createFromFormat(\DateTimeInterface::ATOM, $first['updated_at']));
		self::assertSame($first, $settings->records[self::GROUP][self::PLAYER]);
		self::assertSame(1, $settings->writes);
		self::assertSame(1, $settings->saves);
	}

	public function testAdvanceRetainsDeeperCheckpointButUpdatesHighScores(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		$store->write(self::PLAYER, 'save', ['score' => 1000, 'level' => 10, 'elapsed' => 200, 'energy' => 3]);
		$early = $store->write(self::PLAYER, 'advance', ['score' => 2500, 'level' => 2, 'elapsed' => 12, 'energy' => 2]);
		self::assertSame(10, $early['checkpoint']['level']);
		self::assertSame(1000, $early['checkpoint']['score']);
		self::assertSame(2500, $early['best']);
		self::assertSame(10, $early['best_level']);

		$sameLevel = $store->write(self::PLAYER, 'advance', ['score' => 2600, 'level' => 10, 'elapsed' => 220, 'energy' => 4]);
		self::assertSame(2600, $sameLevel['checkpoint']['score']);
		$deeper = $store->write(self::PLAYER, 'advance', ['score' => 2700, 'level' => 11, 'elapsed' => 230, 'energy' => 4]);
		self::assertSame(11, $deeper['checkpoint']['level']);
		self::assertSame(11, $deeper['best_level']);
		self::assertSame(4, $settings->saves);
	}

	public function testAdvanceCreatesCheckpointWhenNoneExistsAndAllowsLimits(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		$minimum = $store->write(self::PLAYER, 'advance', ['score' => 0, 'level' => 1, 'elapsed' => 0, 'energy' => 1]);
		self::assertSame(0, $minimum['best']);
		self::assertSame(1, $minimum['checkpoint']['energy']);
		$maximum = $store->write(self::PLAYER, 'save', [
			'score' => 2000000000, 'level' => 999, 'elapsed' => 604800, 'energy' => 4
		]);
		self::assertSame(2000000000, $maximum['best']);
		self::assertSame(999, $maximum['best_level']);
		self::assertSame(604800, $maximum['checkpoint']['elapsed']);
	}

	public function testRecordUpdatesBestsButNeverReplacesCheckpoint(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		$record = $store->write(self::PLAYER, 'record', ['score' => 3000, 'level' => 11, 'elapsed' => 241]);
		self::assertNull($record['checkpoint']);
		self::assertSame(3000, $record['best']);
		$store->write(self::PLAYER, 'save', ['score' => 80, 'level' => 3, 'elapsed' => 45, 'energy' => 2]);
		$again = $store->write(self::PLAYER, 'record', ['score' => 700, 'level' => 2, 'elapsed' => 70]);
		self::assertSame(3, $again['checkpoint']['level']);
		self::assertSame(3000, $again['best']);
		self::assertSame(11, $again['best_level']);
	}

	public function testExplicitSaveCanReplaceCheckpointWithLowerLevel(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		$store->write(self::PLAYER, 'advance', ['score' => 800, 'level' => 9, 'elapsed' => 90, 'energy' => 2]);
		$manual = $store->write(self::PLAYER, 'save', ['score' => 2, 'level' => 1, 'elapsed' => 1, 'energy' => 1]);
		self::assertSame(1, $manual['checkpoint']['level']);
		self::assertSame(800, $manual['best']);
		self::assertSame(9, $manual['best_level']);
	}

	/** @return array<string,array{string,array<string,mixed>,string}> */
	public static function invalidPayloads(): array {
		$valid = ['score' => 20, 'level' => 2, 'elapsed' => 60, 'energy' => 3];
		$cases = [
			'unknown operation' => ['delete', $valid, 'Unsupported game profile operation.'],
			'empty operation' => ['', $valid, 'Unsupported game profile operation.']
		];
		foreach([
			'score' => [-1, 2000000001, '20', 1.5, true, null, []],
			'level' => [0, 1000, '2', 1.5, false, null, []],
			'elapsed' => [-1, 604801, '60', 1.5, false, null, []],
			'energy' => [0, 5, '3', 1.5, false, null, []]
		] as $field => $values) {
			foreach($values as $index => $value) {
				$payload = $valid;
				$payload[$field] = $value;
				$cases[$field . ' ' . $index] = ['save', $payload, 'Invalid game profile field: ' . $field];
			}
		}
		foreach(['score', 'level', 'elapsed', 'energy'] as $field) {
			$payload = $valid;
			unset($payload[$field]);
			$cases['missing ' . $field] = ['save', $payload, 'Invalid game profile field: ' . $field];
		}
		return $cases;
	}

	#[DataProvider('invalidPayloads')]
	public function testInvalidInputsRejectBeforeWriting(string $operation, array $payload, string $error): void {
		$settings = new NeonDriftSettingsStoreFake();
		$store = new NeonDriftProfileStore($settings);
		try {
			$store->write(self::PLAYER, $operation, $payload);
			self::fail('Invalid gameplay data must be rejected.');
		} catch(InvalidArgumentException $exception) {
			self::assertSame($error, $exception->getMessage());
		}
		self::assertSame(0, $settings->writes);
		self::assertSame(0, $settings->saves);
	}

	public function testRecordDoesNotRequireEnergy(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$profile = (new NeonDriftProfileStore($settings))->write(self::PLAYER, 'record', [
			'score' => 12, 'level' => 1, 'elapsed' => 0
		]);
		self::assertSame(12, $profile['best']);
	}

	public function testNonPersistingBackendDoesNotReportSuccessfulSave(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->ignoreWrites = true;
		$store = new NeonDriftProfileStore($settings);
		$this->expectException(RuntimeException::class);
		$this->expectExceptionMessage('A persistent settings backend is required.');
		$store->write(self::PLAYER, 'save', ['score' => 20, 'level' => 1, 'elapsed' => 2, 'energy' => 3]);
	}

	public function testBackendSaveFailureIsPropagated(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->failSaves = true;
		$this->expectException(RuntimeException::class);
		$this->expectExceptionMessage('Simulated persistence failure.');
		(new NeonDriftProfileStore($settings))->write(self::PLAYER, 'record', ['score' => 1, 'level' => 1, 'elapsed' => 0]);
	}

	public function testRemovePersistsDeletionWithoutTouchingOtherUsers(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP] = [self::PLAYER => ['best' => 2], 'user_other' => ['best' => 99]];
		$store = new NeonDriftProfileStore($settings);
		$store->remove(self::PLAYER);
		self::assertSame([], $store->get(self::PLAYER));
		self::assertSame(['best' => 99], $store->get('user_other'));
		self::assertSame(1, $settings->deletions);
		self::assertSame(1, $settings->saves);
	}

	public function testRemoveNoOpBackendThrows(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->records[self::GROUP][self::PLAYER] = ['best' => 10];
		$settings->ignoreDeletions = true;
		$this->expectException(RuntimeException::class);
		$this->expectExceptionMessage('Unable to remove persistent game profile.');
		(new NeonDriftProfileStore($settings))->remove(self::PLAYER);
	}

	public function testRemovePropagatesBackendFailure(): void {
		$settings = new NeonDriftSettingsStoreFake();
		$settings->failDeletions = true;
		$this->expectException(RuntimeException::class);
		$this->expectExceptionMessage('Simulated deletion failure.');
		(new NeonDriftProfileStore($settings))->remove(self::PLAYER);
	}
}
