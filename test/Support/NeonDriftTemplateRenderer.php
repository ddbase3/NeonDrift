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
