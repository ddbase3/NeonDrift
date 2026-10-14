<?php declare(strict_types=1);

namespace NeonDrift;

use Base3\Api\IContainer;
use Base3\Api\IPlugin;
use Base3\Settings\Api\ISettingsStore;
use NeonDrift\Service\NeonDriftProfileStore;

/**
 * Registers the Neon Drift BASE3 plugin.
 *
 * The game display and profile output are discovered through IClassMap.
 * The optional player profile uses the existing ISettingsStore backend.
 */
final class NeonDriftPlugin implements IPlugin {

	public function __construct(private readonly IContainer $container) {}

	public static function getName(): string {
		return 'neondriftplugin';
	}

	public function init(): void {
		$this->container
			->set(self::getName(), $this, IContainer::SHARED)
			->set(NeonDriftProfileStore::class, fn($c) => new NeonDriftProfileStore(
				$c->get(ISettingsStore::class)
			), IContainer::SHARED);
	}
}
