<?php declare(strict_types=1);

namespace NeonDrift\Test;

use PHPUnit\Framework\TestCase;

final class NeonDriftLanguageCatalogTest extends TestCase {

	public function testGameAndSettingsCatalogsRemainCompleteInBothLanguages(): void {
		$gameEnglish = $this->catalog('Game', 'en')['game'];
		$gameGerman = $this->catalog('Game', 'de')['game'];
		self::assertSame(array_keys($gameEnglish), array_keys($gameGerman));
		foreach([$gameEnglish, $gameGerman] as $bricks) {
			foreach($bricks as $key => $text) {
				self::assertNotSame('', trim($text), $key);
			}
		}
		$settingsEnglish = $this->catalog('Settings', 'en')['neondriftsettingstab'];
		$settingsGerman = $this->catalog('Settings', 'de')['neondriftsettingstab'];
		self::assertSame(['label', 'description'], array_keys($settingsEnglish));
		self::assertSame(array_keys($settingsEnglish), array_keys($settingsGerman));
	}

	public function testAllDirectJavaScriptLabelReferencesHaveTranslations(): void {
		$source = (string)file_get_contents(dirname(__DIR__) . '/assets/js/neondrift.js');
		preg_match_all('/this\.labels\.([a-z_][a-z_0-9]*)/', $source, $matches);
		self::assertNotEmpty($matches[1]);
		foreach(['en', 'de'] as $language) {
			$bricks = $this->catalog('Game', $language)['game'];
			foreach(array_unique($matches[1]) as $name) {
				self::assertArrayHasKey($name, $bricks, $language . ': ' . $name);
			}
		}
	}

	public function testManifestKeepsNeonDriftIndependentOfOtherGames(): void {
		$manifest = json_decode((string)file_get_contents(dirname(__DIR__) . '/base3.json'), true, 512, JSON_THROW_ON_ERROR);
		self::assertSame('NeonDrift', $manifest['name']);
		self::assertSame('NeonDrift', $manifest['namespace']);
		self::assertArrayHasKey('Base3Framework', $manifest['dependencies']);
		self::assertArrayHasKey('UiFoundation', $manifest['dependencies']);
		self::assertArrayNotHasKey('PulseCore', $manifest['dependencies']);
	}

	/** @return array<string,array<string,string>> */
	private function catalog(string $set, string $language): array {
		$contents = parse_ini_file(dirname(__DIR__) . '/lang/' . $set . '/' . $language . '.ini', true, INI_SCANNER_RAW);
		self::assertIsArray($contents);
		return $contents;
	}
}
