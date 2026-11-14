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


namespace Base3\NeonDrift\Display;

use Base3\CoreFoundation\Api\IAssetResolver;
use Base3\CoreFoundation\Api\IDisplay;
use Base3\CoreFoundation\Api\IMvcView;
use Base3\CoreFoundation\Language\Api\ILanguage;
use Base3\CoreFoundation\LinkTarget\Api\ILinkTargetService;

/**
 * Renders the self-contained Neon Drift browser game.
 *
 * Each rendering receives its own DOM id and is initialized once when its
 * resolved JavaScript asset has loaded. The display performs no data writes; profile access uses a separate IOutput.
 */
final class NeonDriftDisplay implements IDisplay {

	public function __construct(
		private readonly IMvcView $view,
		private readonly IAssetResolver $assetResolver,
		private readonly ILanguage $language,
		private readonly ILinkTargetService $linkTargetService
	) {}

	public static function getName(): string {
		return 'neondriftdisplay';
	}

	/**
	 * Neon Drift does not accept caller-defined display data.
	 *
	 * @param mixed $data Ignored; gameplay has no server-side configuration.
	 * @return void
	 */
	public function setData($data): void {
	}

	public function getOutput(string $out = 'html', bool $final = false): string {
		if($out !== 'html') {
			return '';
		}

		$this->view->setPath(dirname(__DIR__, 2));
		$this->view->setTemplate('Display/NeonDriftDisplay.php');
		$this->view->loadBricks('Game', $this->language->getLanguage() === 'de' ? 'de' : 'en');
		$this->view->assign('labels', $this->view->getBricks('game') ?? []);
		$this->view->assign('cssUrl', $this->assetResolver->resolve('plugin/NeonDrift/assets/css/neondrift.css'));
		$this->view->assign('scriptUrl', $this->assetResolver->resolve('plugin/NeonDrift/assets/js/neondrift.js'));
		$this->view->assign('profileUrl', $this->linkTargetService->getLink([
			'name' => 'neondriftprofileoutput',
			'out' => 'json'
		]));

		return $this->view->loadTemplate();
	}
}
