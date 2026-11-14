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


namespace Base3\NeonDrift\Test;

use Base3\CoreFoundation\Api\IContainer;
use Base3\CoreFoundation\Settings\Api\ISettingsStore;
use Base3\NeonDrift\NeonDriftPlugin;
use Base3\NeonDrift\Service\NeonDriftProfileStore;
use PHPUnit\Framework\TestCase;

final class NeonDriftPluginTest extends TestCase {

	public function testTechnicalNameAndLazyServiceComposition(): void {
		$bindings = [];
		$settings = $this->createMock(ISettingsStore::class);
		$container = $this->createMock(IContainer::class);
		$container->expects(self::exactly(2))->method('set')->willReturnCallback(
			static function(string $name, mixed $definition, int $flags) use (&$bindings, $container): IContainer {
				$bindings[$name] = [$definition, $flags];
				return $container;
			}
		);
		$container->expects(self::once())->method('get')
			->with(ISettingsStore::class)->willReturn($settings);

		$plugin = new NeonDriftPlugin($container);
		self::assertSame('neondriftplugin', NeonDriftPlugin::getName());
		$plugin->init();

		self::assertSame([$plugin, IContainer::SHARED], $bindings['neondriftplugin']);
		self::assertSame(IContainer::SHARED, $bindings[NeonDriftProfileStore::class][1]);
		self::assertInstanceOf(\Closure::class, $bindings[NeonDriftProfileStore::class][0]);

		// The dependency is resolved only when the registered factory is invoked.
		$service = $bindings[NeonDriftProfileStore::class][0]($container);
		self::assertInstanceOf(NeonDriftProfileStore::class, $service);
		self::assertSame([], $service->get('missing'));
	}
}
