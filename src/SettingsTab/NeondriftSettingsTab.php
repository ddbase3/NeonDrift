<?php declare(strict_types=1);

namespace NeonDrift\SettingsTab;

use UiFoundation\Settings\AbstractFeatureSettingsTab;

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
