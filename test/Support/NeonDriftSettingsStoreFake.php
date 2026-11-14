<?php declare(strict_types=1);

/***********************************************************************
 * This file is part of NeonDrift for BASE3 Framework.
 *
 * NeonDrift is a reaction and dexterity arcade game for BASE3.
 * It provides level-based gameplay and optional player profiles.
 * Its display and settings use the existing BASE3 services.
 *
 * Developed by Daniel Dahme
 * Licensed under GPL-3.0-or-later
 * https://www.gnu.org/licenses/gpl-3.0.en.html
 *
 * https://base3.de
 ***********************************************************************/


namespace Base3\NeonDrift\Test\Support;

use Base3\CoreFoundation\Settings\Api\ISettingsStore;
use RuntimeException;

/** In-memory contract fake; only used by NeonDrift unit tests. */
final class NeonDriftSettingsStoreFake implements ISettingsStore {

	/** @var array<string,array<string,array<string,mixed>>> */
	public array $records = [];
	public int $reads = 0;
	public int $writes = 0;
	public int $deletions = 0;
	public int $saves = 0;
	public bool $ignoreWrites = false;
	public bool $ignoreDeletions = false;
	public bool $failReads = false;
	public bool $failWrites = false;
	public bool $failDeletions = false;
	public bool $failSaves = false;

	public function get(string $group, string $name, array $default = []): array {
		$this->reads++;
		if($this->failReads) {
			throw new RuntimeException('Simulated read failure.');
		}
		return $this->records[$group][$name] ?? $default;
	}

	public function set(string $group, string $name, array $settings): void {
		$this->writes++;
		if($this->failWrites) {
			throw new RuntimeException('Simulated write failure.');
		}
		if(!$this->ignoreWrites) {
			$this->records[$group][$name] = $settings;
		}
	}

	public function has(string $group, string $name): bool {
		return isset($this->records[$group][$name]);
	}

	public function remove(string $group, string $name): void {
		$this->deletions++;
		if($this->failDeletions) {
			throw new RuntimeException('Simulated deletion failure.');
		}
		if(!$this->ignoreDeletions) {
			unset($this->records[$group][$name]);
		}
	}

	public function getGroup(string $group): array {
		return $this->records[$group] ?? [];
	}

	public function save(): void {
		$this->saves++;
		if($this->failSaves) {
			throw new RuntimeException('Simulated persistence failure.');
		}
	}

	public function reload(): void {
	}
}
