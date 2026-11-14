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


namespace Base3\NeonDrift;

use Base3\CoreFoundation\Api\IContainer;
use Base3\CoreFoundation\Api\IPlugin;
use Base3\CoreFoundation\Settings\Api\ISettingsStore;
use Base3\NeonDrift\Service\NeonDriftProfileStore;

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
