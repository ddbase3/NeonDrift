<?php declare(strict_types=1);

namespace NeonDrift\Test;

use Base3\Settings\Api\ISettingsStore;
use InvalidArgumentException;
use NeonDrift\Service\NeonDriftProfileStore;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class NeonDriftProfileStoreTest extends TestCase {

	public function testCheckpointAdvancesWithoutRegressingDuringEarlierRuns(): void {
		$records = [];
		$settings = $this->createMock(ISettingsStore::class);
		$settings->method('get')->willReturnCallback(
			static function(string $group, string $key, array $default) use (&$records): array {
				return $records[$key] ?? $default;
			}
		);
		$settings->method('set')->willReturnCallback(
			static function(string $group, string $key, array $profile) use (&$records): void {
				self::assertSame('neondrift_player_profiles', $group);
				$records[$key] = $profile;
			}
		);
		$settings->method('has')->willReturnCallback(
			static function(string $group, string $key) use (&$records): bool {
				return isset($records[$key]);
			}
		);
		$settings->method('remove')->willReturnCallback(
			static function(string $group, string $key) use (&$records): void {
				unset($records[$key]);
			}
		);
		$store = new NeonDriftProfileStore($settings);

		$first = $store->write('user_abc', 'save', ['score' => 2000, 'level' => 10, 'elapsed' => 200, 'energy' => 3]);
		self::assertSame(10, $first['checkpoint']['level']);
		$early = $store->write('user_abc', 'advance', ['score' => 350, 'level' => 2, 'elapsed' => 12, 'energy' => 2]);
		self::assertSame(10, $early['checkpoint']['level'], 'Earlier runs cannot erase a better checkpoint');
		self::assertSame(2000, $early['best']);
		$advanced = $store->write('user_abc', 'advance', ['score' => 2700, 'level' => 11, 'elapsed' => 230, 'energy' => 4]);
		self::assertSame(11, $advanced['checkpoint']['level']);
		$recorded = $store->write('user_abc', 'record', ['score' => 3000, 'level' => 11, 'elapsed' => 241]);
		self::assertSame(11, $recorded['checkpoint']['level']);
		self::assertSame(3000, $recorded['best']);
		$manual = $store->write('user_abc', 'save', ['score' => 800, 'level' => 3, 'elapsed' => 41, 'energy' => 2]);
		self::assertSame(3, $manual['checkpoint']['level'], 'Explicit saves can replace a checkpoint');
		self::assertSame(11, $manual['best_level']);

		$store->remove('user_abc');
		self::assertSame([], $store->get('user_abc'));
	}

	public function testRejectsOutOfRangeUntrustedValues(): void {
		$settings = $this->createMock(ISettingsStore::class);
		$store = new NeonDriftProfileStore($settings);
		$this->expectException(InvalidArgumentException::class);
		$store->write('user_abc', 'save', ['score' => '9000', 'level' => 2, 'elapsed' => 60, 'energy' => 3]);
	}


	public function testDeletionRejectsNonDeletingSettingsBackend(): void {
		$settings = $this->createMock(ISettingsStore::class);
		$settings->method('has')->willReturn(true);
		$settings->expects(self::once())->method('remove')
			->with('neondrift_player_profiles', 'user_abc');
		$settings->expects(self::once())->method('save');
		$store = new NeonDriftProfileStore($settings);
		$this->expectException(RuntimeException::class);
		$store->remove('user_abc');
	}

	public function testRejectsNoOpSettingsBackend(): void {
		$settings = $this->createMock(ISettingsStore::class);
		$settings->method('get')->willReturn([]);
		$settings->method('has')->willReturn(false);
		$store = new NeonDriftProfileStore($settings);
		$this->expectException(RuntimeException::class);
		$store->write('user_abc', 'save', ['score' => 20, 'level' => 1, 'elapsed' => 2, 'energy' => 3]);
	}
}
