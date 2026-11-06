<?php declare(strict_types=1);

namespace NeonDrift\Test\Support;

/** Renders the actual plugin template with the same variable scope as IMvcView. */
final class NeonDriftTemplateRenderer {

	/** @var array<string,mixed> */
	public array $_ = [];

	/** @param array<string,mixed> $values */
	public function render(array $values): string {
		$this->_ = $values;
		ob_start();
		try {
			include dirname(__DIR__, 2) . '/tpl/Display/NeonDriftDisplay.php';
			return (string)ob_get_clean();
		} catch(\Throwable $exception) {
			ob_end_clean();
			throw $exception;
		}
	}
}
