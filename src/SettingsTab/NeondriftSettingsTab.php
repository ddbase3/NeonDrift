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


namespace Base3\NeonDrift\SettingsTab;

use Base3\UiFoundation\Settings\AbstractFeatureSettingsTab;

/** Feature-controlled game entry; gameplay keeps its existing authorization rules. */
final class NeondriftSettingsTab extends AbstractFeatureSettingsTab {

	public function getParentTabName(): ?string {
		return 'gamessettingstab';
	}

	public function getDisplayName(): ?string {
		return 'neondriftdisplay';
	}

	public function getOrder(): int {
		return 20;
	}
}
