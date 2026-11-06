<?php declare(strict_types=1);

namespace NeonDrift\Test;

use Base3\Api\IAssetResolver;
use Base3\Api\IMvcView;
use Base3\Language\Api\ILanguage;
use Base3\LinkTarget\Api\ILinkTargetService;
use NeonDrift\Display\NeonDriftDisplay;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NeonDriftDisplayTest extends TestCase {

	public function testTechnicalNameMatchesClassMapConvention(): void {
		self::assertSame('neondriftdisplay', NeonDriftDisplay::getName());
	}

	/** @return array<string,array{string,string}> */
	public static function languages(): array {
		return ['german' => ['de', 'de'], 'english' => ['en', 'en'], 'other locale' => ['fr', 'en']];
	}

	#[DataProvider('languages')]
	public function testHtmlRendersTheOriginalMvcViewWithResolvedAssetsAndLink(string $locale, string $expected): void {
		$assigned = [];
		$view = $this->createMock(IMvcView::class);
		$assetResolver = $this->createMock(IAssetResolver::class);
		$language = $this->createMock(ILanguage::class);
		$linkTarget = $this->createMock(ILinkTargetService::class);
		$language->method('getLanguage')->willReturn($locale);
		$view->expects(self::once())->method('setPath')->with(dirname(__DIR__));
		$view->expects(self::once())->method('setTemplate')->with('Display/NeonDriftDisplay.php');
		$view->expects(self::once())->method('loadBricks')->with('Game', $expected);
		$view->expects(self::once())->method('getBricks')->with('game')->willReturn(['start' => 'Start']);
		$assetResolver->expects(self::exactly(2))->method('resolve')->willReturnCallback(
			static fn(string $path): string => '/public/' . $path
		);
		$linkTarget->expects(self::once())->method('getLink')
			->with(['name' => 'neondriftprofileoutput', 'out' => 'json'])
			->willReturn('/?name=neondriftprofileoutput&out=json');
		$view->expects(self::exactly(4))->method('assign')->willReturnCallback(
			static function(string $key, mixed $value) use (&$assigned): void {
				$assigned[$key] = $value;
			}
		);
		$view->expects(self::once())->method('loadTemplate')->willReturn('rendered game');

		$display = new NeonDriftDisplay($view, $assetResolver, $language, $linkTarget);
		$display->setData(['caller' => 'ignored']);
		self::assertSame('rendered game', $display->getOutput('html', true));
		self::assertSame([
			'labels' => ['start' => 'Start'],
			'cssUrl' => '/public/plugin/NeonDrift/assets/css/neondrift.css',
			'scriptUrl' => '/public/plugin/NeonDrift/assets/js/neondrift.js',
			'profileUrl' => '/?name=neondriftprofileoutput&out=json'
		], $assigned);
	}

	public function testMissingLanguageBrickSetYieldsEmptyLabels(): void {
		$assigned = [];
		$view = $this->createMock(IMvcView::class);
		$view->method('getBricks')->willReturn(null);
		$view->method('assign')->willReturnCallback(static function(string $key, mixed $value) use (&$assigned): void {
			$assigned[$key] = $value;
		});
		$view->method('loadTemplate')->willReturn('html');
		$asset = $this->createMock(IAssetResolver::class);
		$asset->method('resolve')->willReturn('resolved');
		$language = $this->createMock(ILanguage::class);
		$language->method('getLanguage')->willReturn('en');
		$linkTarget = $this->createMock(ILinkTargetService::class);
		$linkTarget->method('getLink')->willReturn('endpoint');
		$display = new NeonDriftDisplay($view, $asset, $language, $linkTarget);
		self::assertSame('html', $display->getOutput());
		self::assertSame([], $assigned['labels']);
	}

	public function testUnsupportedOutputFormatDoesNotAccessAnyRenderingDependency(): void {
		$view = $this->createMock(IMvcView::class);
		$view->expects(self::never())->method('loadTemplate');
		$view->expects(self::never())->method('assign');
		$asset = $this->createMock(IAssetResolver::class);
		$asset->expects(self::never())->method('resolve');
		$language = $this->createMock(ILanguage::class);
		$language->expects(self::never())->method('getLanguage');
		$linkTarget = $this->createMock(ILinkTargetService::class);
		$linkTarget->expects(self::never())->method('getLink');
		$display = new NeonDriftDisplay($view, $asset, $language, $linkTarget);
		self::assertSame('', $display->getOutput('json'));
		self::assertSame('', $display->getOutput('xml', true));
	}
}
