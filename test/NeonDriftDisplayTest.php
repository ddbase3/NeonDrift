<?php declare(strict_types=1);

namespace NeonDrift\Test;

use Base3\Api\IAssetResolver;
use Base3\Api\IMvcView;
use Base3\Language\Api\ILanguage;
use Base3\LinkTarget\Api\ILinkTargetService;
use NeonDrift\Display\NeonDriftDisplay;
use PHPUnit\Framework\TestCase;

final class NeonDriftDisplayTest extends TestCase {

	public function testTechnicalNameMatchesClassMapConvention(): void {
		self::assertSame('neondriftdisplay', NeonDriftDisplay::getName());
	}

	public function testHtmlOutputUsesMvcViewLanguageBricksAndResolvedAssets(): void {
		$view = $this->createMock(IMvcView::class);
		$assetResolver = $this->createMock(IAssetResolver::class);
		$language = $this->createMock(ILanguage::class);
		$linkTargetService = $this->createMock(ILinkTargetService::class);
		$language->method('getLanguage')->willReturn('de');
		$view->expects(self::once())->method('setPath')->with(dirname(__DIR__));
		$view->expects(self::once())->method('setTemplate')->with('Display/NeonDriftDisplay.php');
		$view->expects(self::once())->method('loadBricks')->with('Game', 'de');
		$view->method('getBricks')->with('game')->willReturn(['start' => 'Spiel starten']);
		$assetResolver->expects(self::exactly(2))->method('resolve')->willReturnCallback(
			static fn(string $path): string => '/public/' . $path
		);
		$linkTargetService->expects(self::once())->method('getLink')
			->with(['name' => 'neondriftprofileoutput', 'out' => 'json'])
			->willReturn('/?name=neondriftprofileoutput&out=json');
		$view->expects(self::exactly(4))->method('assign');
		$view->method('loadTemplate')->willReturn('rendered game');

		$display = new NeonDriftDisplay($view, $assetResolver, $language, $linkTargetService);
		$display->setData(['ignored' => true]);
		self::assertSame('rendered game', $display->getOutput());
	}

	public function testUnsupportedOutputFormatDoesNotRenderGame(): void {
		$view = $this->createMock(IMvcView::class);
		$view->expects(self::never())->method('loadTemplate');
		$assetResolver = $this->createMock(IAssetResolver::class);
		$language = $this->createMock(ILanguage::class);
		$linkTargetService = $this->createMock(ILinkTargetService::class);

		$display = new NeonDriftDisplay($view, $assetResolver, $language, $linkTargetService);
		self::assertSame('', $display->getOutput('json'));
	}
}
