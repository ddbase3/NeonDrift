<?php declare(strict_types=1);

namespace NeonDrift\Test;

use NeonDrift\Test\Support\NeonDriftTemplateRenderer;
use PHPUnit\Framework\TestCase;

final class NeonDriftTemplateTest extends TestCase {

	public function testTemplateUsesAllLocalizedKeysAndProducesAccessibleMarkup(): void {
		foreach(['en', 'de'] as $locale) {
			$labels = parse_ini_file(dirname(__DIR__) . '/lang/Game/' . $locale . '.ini', true, INI_SCANNER_RAW)['game'];
			$html = (new NeonDriftTemplateRenderer())->render([
				'labels' => $labels,
				'cssUrl' => '/assets/neondrift.css',
				'scriptUrl' => '/assets/neondrift.js',
				'profileUrl' => '/?name=neondriftprofileoutput&out=json'
			]);
			self::assertStringContainsString('href="/assets/neondrift.css"', $html);
			self::assertStringContainsString('role="progressbar"', $html);
			self::assertStringContainsString('aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"', $html);
			self::assertStringContainsString('aria-live="polite"', $html);
			self::assertStringContainsString('tabindex="0"', $html);
			self::assertStringContainsString('type="button"', $html);
			self::assertStringContainsString('window.NeonDrift.mount(root, labels', $html);
			self::assertStringContainsString('/?name=neondriftprofileoutput\\u0026out=json', $html);
			self::assertMatchesRegularExpression('/<section[^>]*id="neondrift-[^\"]+"[^>]*data-state="idle"/', $html);
		}
	}

	public function testTemplateEscapesUntrustedUrlsAndTranslationsInHtmlAndJavaScript(): void {
		$labels = parse_ini_file(dirname(__DIR__) . '/lang/Game/en.ini', true, INI_SCANNER_RAW)['game'];
		$labels['subtitle'] = '<img src=x onerror=alert(1)>"&';
		$labels['load_error'] = '</script><script>alert(2)</script>';
		$markup = (new NeonDriftTemplateRenderer())->render([
			'labels' => $labels,
			'cssUrl' => '" onclick="alert(3)',
			'scriptUrl' => '</script><script>alert(4)</script>',
			'profileUrl' => '<script>alert(5)</script>'
		]);
		self::assertStringNotContainsString('<img src=x onerror=alert(1)>', $markup);
		self::assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;&quot;&amp;', $markup);
		self::assertStringContainsString('href="&quot; onclick=&quot;alert(3)"', $markup);
		self::assertStringNotContainsString('</script><script>alert(', $markup);
		self::assertStringContainsString('\\u003C/script\\u003E', $markup);
	}

	public function testEveryInstanceGetsUniqueIdAndMatchingAccessibleHeading(): void {
		$labels = parse_ini_file(dirname(__DIR__) . '/lang/Game/en.ini', true, INI_SCANNER_RAW)['game'];
		$renderer = new NeonDriftTemplateRenderer();
		$values = ['labels' => $labels, 'cssUrl' => 'css', 'scriptUrl' => 'js', 'profileUrl' => 'profile'];
		$first = $renderer->render($values);
		$second = $renderer->render($values);
		preg_match('/id="(neondrift-[^"]+)" data-state="idle"/', $first, $firstId);
		preg_match('/id="(neondrift-[^"]+)" data-state="idle"/', $second, $secondId);
		self::assertNotEmpty($firstId[1] ?? null);
		self::assertNotSame($firstId[1], $secondId[1]);
		self::assertStringContainsString('aria-labelledby="' . $firstId[1] . '-heading"', $first);
	}
}
