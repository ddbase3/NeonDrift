<?php declare(strict_types=1);

namespace NeonDrift\Test\SettingsTab;

use Base3\Authorization\Api\IAuthorizationService;
use Base3\Authorization\Dto\AuthorizationDecision;
use Base3\Authorization\Dto\AuthorizationRequest;
use Base3\Translation\Api\ITranslation;
use NeonDrift\SettingsTab\NeondriftSettingsTab;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use UiFoundation\Api\ISettingsTab;

final class NeondriftSettingsTabTest extends TestCase {

	public function testTabMetadataTranslationAndFeaturePermission(): void {
		$translation = $this->createMock(ITranslation::class);
		$translation->expects(self::exactly(2))->method('translate')->willReturnCallback(
			static function(string $set, string $section, string $key): string {
				self::assertSame('Settings', $set);
				self::assertSame('neondriftsettingstab', $section);
				return match($key) {
					'label' => 'Neon Drift',
					'description' => 'Arcade reaction game'
				};
			}
		);
		$tab = new NeondriftSettingsTab($translation, $this->createMock(IAuthorizationService::class));
		self::assertInstanceOf(ISettingsTab::class, $tab);
		self::assertSame('neondriftsettingstab', NeondriftSettingsTab::getName());
		self::assertSame('gamessettingstab', $tab->getParentTabName());
		self::assertSame('neondriftdisplay', $tab->getDisplayName());
		self::assertNull($tab->getDisplayData());
		self::assertSame(20, $tab->getOrder());
		self::assertSame('Neon Drift', $tab->getLabel());
		self::assertSame('Arcade reaction game', $tab->getDescription());
		self::assertSame(['group' => 'administration'], $tab->getDefaultAudience());
		$permissions = $tab->getPermissions();
		self::assertCount(1, $permissions);
		self::assertSame('feature', $permissions[0]->scope);
		self::assertSame('neondriftsettingstab', $permissions[0]->permission);
	}

	public function testVisibilityDelegatesExactFeatureDecisionToAuthorizationService(): void {
		foreach([
			['allow', AuthorizationDecision::allow(), true],
			['deny', AuthorizationDecision::deny(), false],
			['indeterminate', AuthorizationDecision::indeterminate(), false]
		] as [$label, $decision, $expected]) {
			$authorization = $this->createMock(IAuthorizationService::class);
			$authorization->expects(self::once())->method('getDefaultAuthority')->willReturn('ilias');
			$authorization->expects(self::once())->method('decide')->willReturnCallback(
				static function(AuthorizationRequest $request) use ($decision): AuthorizationDecision {
					self::assertSame('ilias', $request->authority);
					self::assertSame('feature', $request->permission->scope);
					self::assertSame('neondriftsettingstab', $request->permission->permission);
					self::assertNull($request->subject);
					return $decision;
				}
			);
			$tab = new NeondriftSettingsTab($this->createMock(ITranslation::class), $authorization);
			self::assertSame($expected, $tab->isVisible(), $label);
		}
	}

	public function testAuthorizationFailureFailsClosed(): void {
		$authorization = $this->createMock(IAuthorizationService::class);
		$authorization->method('getDefaultAuthority')->willReturn('ilias');
		$authorization->method('decide')->willThrowException(new RuntimeException('Native permission backend unavailable.'));
		$tab = new NeondriftSettingsTab($this->createMock(ITranslation::class), $authorization);
		self::assertFalse($tab->isVisible());
	}

	public function testMissingAuthorizationAuthorityFailsClosed(): void {
		$authorization = $this->createMock(IAuthorizationService::class);
		$authorization->method('getDefaultAuthority')->willThrowException(new RuntimeException('Missing authority.'));
		$authorization->expects(self::never())->method('decide');
		$tab = new NeondriftSettingsTab($this->createMock(ITranslation::class), $authorization);
		self::assertFalse($tab->isVisible());
	}
}
