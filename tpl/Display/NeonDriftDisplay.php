<?php declare(strict_types=1);

$labels = $this->_['labels'];
$id = uniqid('neondrift-', false);
$esc = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$javascriptOptions = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
?>
<link rel="stylesheet" href="<?php echo $esc($this->_['cssUrl']); ?>" />
<section class="nd-root" id="<?php echo $esc($id); ?>" data-state="idle" aria-labelledby="<?php echo $esc($id); ?>-heading">
	<div class="nd-background" aria-hidden="true"></div>

	<header class="nd-header">
		<div class="nd-brand">
			<div class="nd-mark" aria-hidden="true"><span></span><span></span><span></span></div>
			<div>
				<div class="nd-eyebrow"><?php echo $esc($labels['eyebrow']); ?></div>
				<h2 class="nd-heading" id="<?php echo $esc($id); ?>-heading">NEON <span>DRIFT</span><small>02</small></h2>
				<p class="nd-subtitle"><?php echo $esc($labels['subtitle']); ?></p>
			</div>
		</div>
		<div class="nd-header-actions">
			<div class="nd-mode"><span class="nd-mode-light" aria-hidden="true"></span><?php echo $esc($labels['mode']); ?></div>
			<button type="button" class="nd-sound" data-action="sound" aria-label="<?php echo $esc($labels['sound_control']); ?>" aria-pressed="false" title="<?php echo $esc($labels['sound_enable']); ?>">
				<span class="nd-sound-icon" aria-hidden="true">♫</span>
				<span data-role="sound-label"><?php echo $esc($labels['sound_enable']); ?></span>
			</button>
			<button type="button" class="nd-fullscreen" data-action="fullscreen" aria-label="<?php echo $esc($labels['fullscreen_enter']); ?>" title="<?php echo $esc($labels['fullscreen_enter']); ?>">
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
					<path class="nd-fullscreen-expand" d="M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5" />
					<path class="nd-fullscreen-collapse" d="M3 8h5V3 M21 8h-5V3 M3 16h5v5 M21 16h-5v5" />
				</svg>
				<span data-role="fullscreen-label"><?php echo $esc($labels['fullscreen_enter']); ?></span>
			</button>
		</div>
	</header>

	<div class="nd-hud">
		<div class="nd-stat nd-stat-score">
			<span class="nd-stat-label"><?php echo $esc($labels['score']); ?></span>
			<strong data-role="score">000000</strong>
		</div>
		<div class="nd-stat">
			<span class="nd-stat-label"><?php echo $esc($labels['best']); ?></span>
			<strong data-role="best">000000</strong>
		</div>
		<div class="nd-stat">
			<span class="nd-stat-label"><?php echo $esc($labels['level']); ?></span>
			<strong data-role="level">01</strong>
		</div>
		<div class="nd-stat nd-stat-combo">
			<span class="nd-stat-label"><?php echo $esc($labels['combo']); ?></span>
			<strong data-role="combo">×1</strong>
		</div>
		<div class="nd-stat nd-stat-energy">
			<span class="nd-stat-label"><?php echo $esc($labels['energy']); ?></span>
			<strong data-role="energy">3 ◆ ◆ ◆</strong>
		</div>
		<div class="nd-stat nd-stat-time">
			<span class="nd-stat-label"><?php echo $esc($labels['time']); ?></span>
			<strong data-role="time">00:00</strong>
		</div>
	</div>

	<div class="nd-mission" aria-label="<?php echo $esc($labels['mission']); ?>">
		<span class="nd-mission-label" data-role="mission-label"><?php echo $esc($labels['mission']); ?></span>
		<span class="nd-mission-count" data-role="mission-count">0 / 4</span>
		<div class="nd-mission-track" data-role="mission-track" role="progressbar" aria-label="<?php echo $esc($labels['mission']); ?>" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"><span data-role="mission-fill"></span></div>
		<span class="nd-mission-phase" data-role="mission-phase"><?php echo $esc($labels['phase_1']); ?></span>
	</div>

	<div class="nd-arena-shell">
		<div class="nd-arena-bezel" aria-hidden="true"><span>ND-01</span><span>LIVE SIMULATION</span><span>960 : 540</span></div>
		<div class="nd-stage">
			<canvas class="nd-canvas" width="960" height="540" tabindex="0" aria-label="<?php echo $esc($labels['canvas']); ?>" data-role="canvas"><?php echo $esc($labels['canvas_fallback']); ?></canvas>
			<div class="nd-overlay" data-role="overlay" aria-hidden="true">
				<div class="nd-overlay-emblem"><span></span></div>
				<p class="nd-overlay-index">// NEON DRIFT</p>
				<h3 data-role="overlay-title"><?php echo $esc($labels['intro_title']); ?></h3>
				<p data-role="overlay-description"><?php echo $esc($labels['intro_text']); ?></p>
				<div class="nd-overlay-chevron" aria-hidden="true">⌄</div>
			</div>
			<div class="nd-corner nd-corner-tl" aria-hidden="true"></div>
			<div class="nd-corner nd-corner-tr" aria-hidden="true"></div>
			<div class="nd-corner nd-corner-bl" aria-hidden="true"></div>
			<div class="nd-corner nd-corner-br" aria-hidden="true"></div>
		</div>
		<div class="nd-arena-bottom" aria-hidden="true"><span>► FIELD ACTIVE</span><span>◈ ◈ ◈</span><span>BASE3 / ARCADE DIVISION</span></div>
	</div>

	<div class="nd-toolbar">
		<div class="nd-actions">
			<button type="button" class="nd-button nd-primary" data-action="start"><span class="nd-play-icon" aria-hidden="true">▶</span><span data-role="start-label"><?php echo $esc($labels['start']); ?></span></button>
			<button type="button" class="nd-button nd-secondary" data-action="pause" disabled><span aria-hidden="true">Ⅱ</span> <span data-role="pause-label"><?php echo $esc($labels['pause']); ?></span></button>
			<button type="button" class="nd-button nd-dash" data-action="dash" disabled aria-keyshortcuts="Shift"><span aria-hidden="true">⚡</span> <span data-role="dash-label"><?php echo $esc($labels['dash']); ?></span></button>
			<button type="button" class="nd-button nd-quiet" data-action="restart" disabled><span aria-hidden="true">↻</span> <?php echo $esc($labels['restart']); ?></button>
		</div>
		<div class="nd-controls" aria-label="<?php echo $esc($labels['hint_keyboard']); ?>">
			<span><?php echo $esc($labels['hint_keyboard']); ?></span>
			<span><?php echo $esc($labels['hint_pointer']); ?></span>
			<span><?php echo $esc($labels['hint_pause']); ?></span>
			<span><?php echo $esc($labels['hint_dash']); ?></span>
		</div>
	</div>
	<div class="nd-profile">
		<div class="nd-profile-text">
			<strong><?php echo $esc($labels['profile_title']); ?></strong>
			<span data-role="profile-status"><?php echo $esc($labels['profile_loading']); ?></span>
		</div>
		<div class="nd-profile-actions">
			<button type="button" class="nd-button nd-secondary" data-action="save" disabled><?php echo $esc($labels['profile_save']); ?></button>
			<button type="button" class="nd-button nd-secondary" data-action="load" disabled><?php echo $esc($labels['profile_load']); ?></button>
			<button type="button" class="nd-button nd-quiet" data-action="delete" disabled><?php echo $esc($labels['profile_delete']); ?></button>
		</div>
	</div>
	<p class="nd-announcer" data-role="announcement" role="status" aria-live="polite" aria-atomic="true"></p>
</section>
<script>
(function() {
	'use strict';
	const root = document.getElementById(<?php echo json_encode($id, $javascriptOptions); ?>);
	const labels = <?php echo json_encode($labels, $javascriptOptions); ?>;
	const script = document.createElement('script');
	script.src = <?php echo json_encode($this->_['scriptUrl'], $javascriptOptions); ?>;
	script.onload = function() {
		if(root.isConnected) {
			window.NeonDrift.mount(root, labels, {profileUrl: <?php echo json_encode($this->_['profileUrl'], $javascriptOptions); ?>});
		}
		script.remove();
	};
	script.onerror = function() {
		if(root.isConnected) {
			root.querySelector('[data-role="announcement"]').textContent = labels.load_error;
			root.querySelector('[data-role="overlay-description"]').textContent = labels.load_error;
		}
		script.remove();
	};
	document.head.appendChild(script);
})();
</script>
