'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const windowListeners = new Map();
const motionListeners = new Map();
const audioStats = {played: 0, closed: 0, oscillators: []};
let fillRects = 0;
let scheduledFrame;
let cancelledFrame;
const requests = [];
const token = 'f'.repeat(64);
let serverProfile = {};
const labels = {
	intro_title: 'Ready', intro_text: 'Start', paused_title: 'Paused', paused_text: 'Hold',
	between_title: 'Level {level}', between_text: 'Rest', over_title: 'Over', over_text: 'Score {score}',
	start: 'Start', pause: 'Pause', resume: 'Resume', dash: 'Dash', next_level: 'Next',
	phase_1: 'Shard', phase_2: 'Dart', phase_3: 'Beam', phase_4: 'Hunter', phase_5: 'Pulse',
	running_announcement: 'Run started', paused_announcement: 'Paused', ready_announcement: 'Ready',
	over_announcement: 'Over {score}', hit_announcement: 'Energy {energy}',
	collected_announcement: 'Collected {score}', level_complete: 'Level {level} complete',
	level_started: 'Level {level}', profile_loading: 'Loading', profile_opt_in: 'Opt in',
	profile_present: 'Profile', profile_saved: 'Saved', profile_recorded: 'Recorded',
	profile_deleted: 'Deleted', profile_resumed: 'Resumed', profile_unavailable: 'Unavailable',
	profile_error: 'Error', profile_confirm_delete: 'Delete?', load_error: 'Error',
	field_label: 'NEON / FIELD', threat_label: 'THREAT LEVEL',
	fullscreen_enter: 'Fullscreen', fullscreen_exit: 'Exit fullscreen', fullscreen_error: 'Error fullscreen',
	sound_control: 'Effects', sound_enable: 'Enable sound', sound_disable: 'Disable sound', sound_unavailable: 'Audio unavailable'
};

function element() {
	return {
		textContent: '', disabled: false, attributes: {}, handlers: {}, style: {},
		setAttribute(name, value) {this.attributes[name] = value;},
		addEventListener(event, handler) {this.handlers[event] = handler;},
		removeEventListener(event) {delete this.handlers[event];}
	};
}

const ui = new Map();
for(const selector of [
	'[data-role="overlay"]', '[data-role="announcement"]', '[data-role="score"]',
	'[data-role="best"]', '[data-role="energy"]', '[data-role="time"]',
	'[data-role="level"]', '[data-role="combo"]', '[data-role="mission-count"]',
	'[data-role="mission-fill"]', '[data-role="mission-phase"]', '[data-role="mission-track"]',
	'[data-role="overlay-title"]', '[data-role="overlay-description"]',
	'[data-role="start-label"]', '[data-role="pause-label"]', '[data-role="dash-label"]',
	'[data-role="fullscreen-label"]', '[data-role="sound-label"]',
	'[data-role="profile-status"]', '[data-action="start"]', '[data-action="pause"]',
	'[data-action="restart"]', '[data-action="dash"]', '[data-action="save"]',
	'[data-action="fullscreen"]', '[data-action="sound"]',
	'[data-action="load"]', '[data-action="delete"]'
]) ui.set(selector, element());

let canvasStateDepth = 0;
const context = new Proxy({
	save() {canvasStateDepth++;},
	restore() {canvasStateDepth--; assert.ok(canvasStateDepth >= 0, 'Canvas restore must have a matching save');}
}, {
	get(target, name) {
		if(name === 'createRadialGradient') return () => ({addColorStop() {}});
		if(name === 'fillRect') return () => {fillRects++;};
		return target[name] ?? (() => {});
	},
	set(target, name, value) {target[name] = value; return true;}
});
const canvas = element();
canvas.getContext = () => context;
canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: 960, height: 540});
canvas.setPointerCapture = () => {};
canvas.focus = () => {document.activeElement = canvas;};
ui.set('[data-role="canvas"]', canvas);
const root = {dataset: {}, isConnected: true, querySelector: selector => ui.get(selector),
	async requestFullscreen() {document.fullscreenElement = root; listeners.get('fullscreenchange')?.();}
};
const document = {
	activeElement: canvas, hidden: false, hasFocus: () => true,
	fullscreenElement: null, fullscreenEnabled: true,
	async exitFullscreen() {this.fullscreenElement = null; listeners.get('fullscreenchange')?.();},
	addEventListener: (event, handler) => listeners.set(event, handler),
	removeEventListener: event => listeners.delete(event)
};
class FakeAudioContext {
	constructor() {this.currentTime = 0; this.state = 'running'; this.destination = {};}
	createOscillator() {const oscillator = {frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}, start() {audioStats.played++;}, stop() {}}; audioStats.oscillators.push(oscillator); return oscillator;}
	createGain() {return {gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}};}
	close() {audioStats.closed++; return Promise.resolve();}
}
const window = {
	devicePixelRatio: 1.5, AudioContext: FakeAudioContext,
	matchMedia: () => ({matches: false, addEventListener: (event, listener) => motionListeners.set(event, listener),
		removeEventListener: event => motionListeners.delete(event)}),
	confirm: () => true,
	addEventListener: (event, handler) => windowListeners.set(event, handler),
	removeEventListener: event => windowListeners.delete(event),
	requestAnimationFrame: handler => {scheduledFrame = handler; return 1;},
	cancelAnimationFrame: id => {cancelledFrame = id;},
	async fetch(url, options) {
		assert.equal(url, '/?name=neondriftprofileoutput&out=json');
		requests.push({url, ...options});
		if(options.method === 'GET') return {ok: true, json: async () => ({ok: true, token, profile: serverProfile})};
		assert.equal(options.credentials, 'same-origin');
		const payload = JSON.parse(options.body);
		assert.equal(payload.token, token);
		if(payload.operation === 'delete') {
			serverProfile = {};
		} else {
			serverProfile = {
				version: 1, best: Math.max(serverProfile.best || 0, payload.score),
				best_level: Math.max(serverProfile.best_level || 1, payload.level),
				checkpoint: payload.operation === 'record' ? serverProfile.checkpoint : {
					level: payload.level, score: payload.score,
					energy: payload.energy, elapsed: payload.elapsed
				}
			};
		}
		return {ok: true, json: async () => ({ok: true, profile: serverProfile})};
	}
};

const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'neondrift.js'), 'utf8');
vm.runInNewContext(code, {window, document, Math, Set, Array, String, Number, Promise}, {
	filename: path.join(__dirname, '..', 'assets', 'js', 'neondrift.js')
});

async function main() {
	const game = window.NeonDrift.mount(root, labels, {profileUrl: '/?name=neondriftprofileoutput&out=json'});
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(game.profileAvailable, true);
	assert.equal(ui.get('[data-action="sound"]').disabled, false);
	assert.equal(ui.get('[data-action="fullscreen"]').disabled, false);
	assert.equal(audioStats.played, 0, 'Audio stays off until explicit opt-in');
	assert.equal(motionListeners.size, 1);
	await ui.get('[data-action="fullscreen"]').handlers.click();
	assert.equal(document.fullscreenElement, root);
	assert.equal(ui.get('[data-role="fullscreen-label"]').textContent, 'Exit fullscreen');
	assert.equal(ui.get('[data-action="fullscreen"]').attributes['aria-label'], 'Exit fullscreen');
	await ui.get('[data-action="fullscreen"]').handlers.click();
	assert.equal(document.fullscreenElement, null);
	assert.equal(ui.get('[data-role="fullscreen-label"]').textContent, 'Fullscreen');
	await ui.get('[data-action="sound"]').handlers.click();
	assert.equal(game.audioEnabled, true);
	assert.ok(audioStats.played > 0);
	assert.equal(ui.get('[data-action="sound"]').attributes['aria-pressed'], 'true');
	await ui.get('[data-action="sound"]').handlers.click();
	assert.equal(game.audioEnabled, false);
	assert.equal(ui.get('[data-role="profile-status"]').textContent, 'Opt in');
	assert.equal(game.state, 'idle');
	assert.equal(ui.get('[data-role="score"]').textContent, '000000');
	assert.equal(canvas.width, 1440);
	assert.equal(typeof scheduledFrame, 'function');

	// Long runs must not accumulate unbalanced Canvas drawing state.
	for(let frame = 0; frame < 300; frame++) game.draw(frame / 60);
	assert.equal(canvasStateDepth, 0, 'Canvas state stack must remain balanced');

	ui.get('[data-action="start"]').handlers.click();
	assert.equal(game.state, 'running');
	assert.equal(ui.get('[data-action="pause"]').disabled, false);
	const xBefore = game.player.x;
	let prevented = false;
	listeners.get('keydown')({key: 'ArrowRight', repeat: false, preventDefault() {prevented = true;}});
	game.update(.05);
	assert.ok(game.player.x > xBefore);
	assert.equal(prevented, true);
	assert.equal(ui.get('[data-role="mission-track"]').attributes['aria-valuemax'], '4');
	listeners.get('keyup')({key: 'ArrowRight'});

	// Native buttons must handle Space themselves rather than toggling the game twice.
	document.activeElement = ui.get('[data-action="pause"]');
	listeners.get('keydown')({key: ' ', repeat: false, preventDefault() {throw new Error('Space was consumed');}});
	assert.equal(game.state, 'running');
	document.activeElement = canvas;

	canvas.handlers.pointerdown({button: 0, pointerId: 5, clientX: 770, clientY: 180});
	assert.equal(game.pointer.x, 770);
	canvas.handlers.pointermove({pointerId: 5, clientX: 750, clientY: 200});
	assert.equal(game.pointer.x, 750);
	canvas.handlers.pointerup({pointerId: 5});
	assert.equal(game.pointerId, null);

	const beforePause = game.elapsed;
	ui.get('[data-action="pause"]').handlers.click();
	assert.equal(game.state, 'paused');
	game.frame(1000);
	assert.equal(game.elapsed, beforePause);
	ui.get('[data-action="pause"]').handlers.click();
	assert.equal(game.state, 'running');

	game.player.vx = 0;
	game.player.vy = 0;
	game.player.x = game.core.x;
	game.player.y = game.core.y;
	game.hazards = [];
	game.update(.016);
	assert.equal(game.score, 100);
	assert.equal(game.combo, 1);
	game.player.x = game.core.x;
	game.player.y = game.core.y;
	game.update(.016);
	assert.equal(game.score, 300);
	assert.equal(game.combo, 2);

	// Dash grants brief protection and allows deliberate destruction of hazards.
	document.activeElement = ui.get('[data-action="dash"]');
	ui.get('[data-action="dash"]').handlers.click();
	assert.equal(document.activeElement, canvas, 'Dash button restores movement focus');
	assert.ok(game.dashCooldown > 0);
	const energyBeforeDash = game.energy;
	const pointsBeforeDash = game.score;
	game.hazards = [{type: 'shard', x: game.player.x, y: game.player.y,
		vx: 0, vy: 0, angle: 0, spin: 0, age: 0, radius: 100}];
	game.update(.016);
	assert.equal(game.energy, energyBeforeDash);
	assert.equal(game.score, pointsBeforeDash + 75);
	assert.equal(game.hazards.length, 0);
	assert.equal(ui.get('[data-action="dash"]').disabled, true);
	game.dashTimer = 0;
	game.hitTimer = 0;
	game.shake = 8;
	motionListeners.get('change')({matches: true});
	assert.equal(game.reducedMotion, true);
	assert.equal(game.shake, 0, 'OS reduced motion must immediately remove shake');
	motionListeners.get('change')({matches: false});

	// The five sectors introduce hazards predictably before mixing their patterns.
	const originalRandom = Math.random;
	try {
		Math.random = () => .1;
		game.level = 1;
		game.spawnPattern();
		assert.equal(game.hazards.at(-1).type, 'shard');
		game.hazards = [];
		game.level = 2;
		game.spawnPattern();
		assert.equal(game.hazards.at(-1).type, 'dart');
		game.hazards = [];
		game.level = 3;
		game.spawnPattern();
		assert.equal(game.beams.length, 1);
		game.level = 4;
		game.spawnPattern();
		assert.equal(game.hazards.at(-1).type, 'hunter');
		game.hazards = [];
		game.level = 5;
		game.spawnPattern();
		assert.equal(game.pulses.length, 1);
	} finally {
		Math.random = originalRandom;
	}

	// Level clearing pauses progression and offers a rest before the next challenge.
	game.beams = [];
	game.pulses = [];
	game.hazards = [];
	game.level = 1;
	game.levelTime = 12;
	game.levelCores = game.targetCores();
	game.update(.016);
	assert.equal(game.state, 'between');
	assert.equal(game.level, 2);
	assert.equal(game.levelCores, 0);
	assert.equal(ui.get('[data-role="level"]').textContent, '02');

	ui.get('[data-action="save"]').handlers.click();
	await game.profileQueue;
	assert.equal(serverProfile.version, 1);
	assert.equal(serverProfile.checkpoint.level, 2);
	assert.equal(game.profileEnabled, true);
	assert.equal(ui.get('[data-role="profile-status"]').textContent, 'Saved');

	ui.get('[data-action="start"]').handlers.click();
	assert.equal(game.state, 'running');
	game.levelTime = 12;
	game.levelCores = game.targetCores();
	game.update(.016);
	assert.equal(game.state, 'between');
	assert.equal(game.level, 3);
	await game.profileQueue;
	assert.equal(requests.at(-1).method, 'POST');
	assert.equal(JSON.parse(requests.at(-1).body).operation, 'advance');
	assert.equal(serverProfile.checkpoint.level, 3);

	ui.get('[data-action="start"]').handlers.click();
	game.hitTimer = 0;
	game.takeHit();
	game.hitTimer = 0;
	game.takeHit();
	game.hitTimer = 0;
	game.takeHit();
	assert.equal(game.state, 'over');
	assert.ok(game.shake > 0, 'Last impact can have a brief hit effect');
	for(let i = 0; i < 65; i++) game.frame(3000 + i * (1000 / 60));
	assert.equal(game.gameOverFrozen, true, 'Game Over becomes fully still');
	assert.equal(game.shake, 0);
	assert.equal(game.particles.length, 0);
	assert.equal(game.rings.length, 0);
	const frozenDrawCalls = fillRects;
	for(let i = 0; i < 30; i++) game.frame(4100 + i * (1000 / 60));
	assert.equal(fillRects, frozenDrawCalls, 'No further canvas drawing after settle');
	await game.profileQueue;
	assert.equal(JSON.parse(requests.at(-1).body).operation, 'record');
	assert.equal(serverProfile.checkpoint.level, 3);

	ui.get('[data-action="load"]').handlers.click();
	assert.equal(game.state, 'running');
	assert.equal(game.level, 3);
	assert.equal(ui.get('[data-role="announcement"]').textContent, 'Resumed');
	ui.get('[data-action="pause"]').handlers.click();
	assert.equal(game.state, 'paused');
	ui.get('[data-action="delete"]').handlers.click();
	assert.equal(game.profileDeleting, true);
	assert.equal(ui.get('[data-action="save"]').disabled, true);
	const beforePendingDelete = requests.length;
	game.persistProfile('advance');
	await game.profileQueue;
	assert.equal(requests.length, beforePendingDelete + 1, 'Deleting blocks later automatic saves');
	assert.equal(game.profileDeleting, false);
	assert.equal(game.profileEnabled, false);
	assert.equal(serverProfile.version, undefined);
	assert.equal(ui.get('[data-role="profile-status"]').textContent, 'Deleted');

	// Explicitly exercise other input modes, lifecycle interruptions and browser failures.
	const blankCanvas = {getContext: () => null};
	const blankRoot = {querySelector: selector => selector === '[data-role="canvas"]' ? blankCanvas : ui.get(selector)};
	window.NeonDrift.mount(blankRoot, labels);
	assert.equal(ui.get('[data-role="announcement"]').textContent, 'Error');
	assert.ok(audioStats.oscillators.length > 0);
	for(const oscillator of audioStats.oscillators) oscillator.onended?.();

	const oldRequestFullscreen = root.requestFullscreen;
	root.requestFullscreen = async () => {throw Error('Fullscreen blocked');};
	await game.toggleFullscreen();
	assert.equal(ui.get('[data-role="announcement"]').textContent, labels.fullscreen_error);
	root.requestFullscreen = oldRequestFullscreen;

	const savedAudioContext = game.audioContext;
	game.audioContext = {state: 'suspended', async resume() {throw Error('Audio blocked');}};
	await game.toggleSound();
	assert.equal(game.audioEnabled, false);
	assert.equal(game.soundButton.disabled, true);
	game.audioContext = savedAudioContext;
	game.soundButton.disabled = false;
	game.audioEnabled = true;
	const createOscillator = savedAudioContext.createOscillator;
	savedAudioContext.createOscillator = () => {throw Error('Audio unavailable');};
	game.playSound('hit');
	assert.equal(game.audioEnabled, false);
	savedAudioContext.createOscillator = createOscillator;

	game.setState('idle');
	document.activeElement = canvas;
	listeners.get('keydown')({key: ' ', repeat: false, preventDefault() {}});
	assert.equal(game.state, 'running', 'Space starts a run when the Canvas is focused');
	listeners.get('keydown')({key: ' ', repeat: false, preventDefault() {}});
	assert.equal(game.state, 'paused');
	game.start();
	assert.equal(game.state, 'running', 'Start resumes a paused game');
	listeners.get('keydown')({key: 'Escape', repeat: false, preventDefault() {}});
	assert.equal(game.state, 'paused');
	game.start();
	listeners.get('keydown')({key: 'j', repeat: false, preventDefault() {}});
	assert.ok(game.dashTimer > 0);
	game.dashCooldown = 0;
	game.dashTimer = 0;
	listeners.get('keydown')({key: 'a', repeat: false, preventDefault() {}});
	listeners.get('keydown')({key: 'w', repeat: false, preventDefault() {}});
	const diagonal = game.movementVector();
	assert.ok(Math.hypot(diagonal.x, diagonal.y) <= 1.001);
	listeners.get('keyup')({key: 'a'});
	listeners.get('keyup')({key: 'w'});
	game.pointer = {x: game.player.x + 60, y: game.player.y + 60};
	assert.ok(game.movementVector().x > 0, 'Pointer steering works without keyboard input');
	game.pointer = {x: game.player.x + 1, y: game.player.y + 1};
	assert.equal(game.movementVector().x, 0, 'Dead zone ignores pointer jitter');
	game.pointer = null;
	canvas.handlers.pointerdown({button: 2, pointerId: 30, clientX: 10, clientY: 10});
	assert.equal(game.pointerId, null, 'Non-primary pointer is ignored');
	canvas.handlers.pointerdown({button: 0, pointerId: 31, clientX: -100, clientY: 9999});
	assert.equal(game.pointer.x, 0, 'Pointer x is clamped');
	assert.equal(game.pointer.y, 540, 'Pointer y is clamped');
	canvas.handlers.pointerdown({button: 0, pointerId: 32, clientX: 100, clientY: 100});
	assert.equal(game.pointerId, 31, 'Second pointer cannot steal steering');
	canvas.handlers.pointermove({pointerId: 32, clientX: 200, clientY: 200});
	assert.equal(game.pointer.x, 0);
	canvas.handlers.pointerup({pointerId: 32});
	assert.equal(game.pointerId, 31);
	canvas.handlers.pointerup({pointerId: 31});
	assert.equal(game.pointerId, null);

	// Visual variants, hit zones, moving threats and deterministic spawn patterns.
	const dummyHazard = type => ({type, x: 200, y: 200, vx: 0, vy: 100,
		speed: 100, angle: 0, spin: 0, age: 0, radius: 21});
	game.drawHazard(context, dummyHazard('shard'));
	game.drawHazard(context, dummyHazard('dart'));
	game.drawHazard(context, dummyHazard('hunter'));
	for(const vertical of [false, true]) {
		for(const age of [0, 2]) {
			game.drawBeam(context, {vertical, age, warning: 1, coordinate: 200, width: 20});
		}
	}
	for(const age of [0, 2]) game.drawPulse(context, {x: 300, y: 300, age, warning: 1, duration: 2});
	assert.equal(canvasStateDepth, 0);
	game.startNewRun();
	game.core = {x: 100, y: 100, radius: 12};
	game.spawnTimer = 2;
	game.hazards = [dummyHazard('hunter')];
	game.update(.016);
	assert.ok(game.hazards[0].vx !== 0, 'Hunter moves toward player');
	game.hazards = [dummyHazard('shard')];
	game.hazards[0].x = game.player.x;
	game.hazards[0].y = game.player.y;
	game.hitTimer = 0;
	game.update(.016);
	assert.equal(game.energy, 2, 'Physical hazard collision removes energy');
	game.hazards = [];
	game.hitTimer = 0;
	game.beams = [{vertical: true, coordinate: game.player.x, width: 30, age: 1, warning: 1, duration: .62}];
	game.update(.016);
	assert.equal(game.energy, 1, 'Active vertical beam collision removes energy');
	game.beams = [];
	game.hitTimer = 0;
	game.pulses = [{x: game.player.x + 108, y: game.player.y, age: .49, warning: 0, duration: 1}];
	game.update(.016);
	assert.equal(game.energy, 0, 'Expanding pulse collision removes energy');
	assert.equal(game.state, 'over');
	game.startNewRun();
	game.core = {x: 100, y: 100, radius: 12};
	game.beams = [{vertical: false, coordinate: game.player.y, width: 20, age: 1, warning: 1, duration: .62}];
	game.hitTimer = 0;
	game.update(.016);
	assert.equal(game.energy, 2, 'Horizontal beam collision uses vertical player coordinate');
	game.beams = [];
	game.pulses = [];
	game.hazards = [];
	game.hitTimer = 0;
	game.level = 3;
	game.hitsThisLevel = 1;
	const scoreBeforeHitClear = game.score;
	game.completeLevel();
	assert.equal(game.score - scoreBeforeHitClear, 750, 'A hit prevents the perfect-level score bonus');
	assert.equal(game.energy, 3, 'Every third level replenishes energy');
	game.level = 3;
	game.hitsThisLevel = 0;
	const scoreBeforePerfectClear = game.score;
	game.completeLevel();
	assert.equal(game.score - scoreBeforePerfectClear, 1200, 'A perfect clear awards the additional score bonus');
	assert.equal(game.energy, 4, 'Energy recharge is capped at four');
	game.startNewRun();
	game.emitParticles(200, 200, '#fff', 240);
	assert.equal(game.particles.length, 210, 'Particles are strictly bounded');
	game.updateEffects(2);
	assert.equal(game.particles.length, 0, 'Expired particles are removed');
	game.setState('running');
	game.spawnTimer = 0;

	const originalRandomAgain = Math.random;
	try {
		for(const phase of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
			for(const roll of [.05, .23, .34, .45, .61, .74, .92]) {
				Math.random = () => roll;
				game.level = phase;
				game.patternCounter = 0;
				game.hazards = [];
				game.beams = [];
				game.pulses = [];
				game.spawnPattern();
			}
		}
		for(const roll of [.1, .3, .6, .9]) {
			Math.random = () => roll;
			game.hazards = [];
			game.spawnVolley();
			assert.equal(game.hazards.length, 3);
		}
		Math.random = () => .9;
		game.player.x = 480;
		game.player.y = 270;
		game.level = 1;
		game.hazards = [];
		game.spawnBeam();
		assert.equal(game.beams.at(-1).vertical, true);
		Math.random = () => .1;
		game.spawnBeam();
		assert.equal(game.beams.at(-1).vertical, false);
		game.hazards = Array.from({length: 34}, () => dummyHazard('shard'));
		game.spawnPattern();
		assert.equal(game.hazards.length, 34);
		game.hazards = Array.from({length: 33}, () => dummyHazard('shard'));
		game.spawnVolley();
		assert.equal(game.hazards.length, 34);
		Math.random = () => .5;
		game.hazards = [];
		const fallbackCore = game.placeCore();
		assert.equal(fallbackCore.x, game.player.x, 'Placement stops after bounded retries');
	} finally {
		Math.random = originalRandomAgain;
	}
	game.startNewRun();
	assert.equal(game.profileDeleting, false);
	// Leave the originally tested real profile lifecycle intact before teardown.

	// Remaining error paths and host lifecycle integrations.
	game.startNewRun();
	document.hidden = true;
	listeners.get('visibilitychange')();
	assert.equal(game.state, 'paused', 'Hidden browser pauses an active game');
	document.hidden = false;
	game.start();
	const originalHasFocus = document.hasFocus;
	document.hasFocus = () => false;
	windowListeners.get('blur')();
	assert.equal(game.state, 'paused', 'Window blur pauses without changing the score');
	document.hasFocus = originalHasFocus;
	game.start();
	listeners.get('keydown')({key: 'd', repeat: false, preventDefault() {}});
	game.dashCooldown = 0;
	game.dash();
	assert.ok(game.player.vx > 0, 'Dash follows an active movement direction');
	listeners.get('keyup')({key: 'd'});

	const randomBeforeLastPatterns = Math.random;
	try {
		Math.random = () => .9;
		game.level = 4;
		game.beams = Array.from({length: 3}, () => ({vertical: true, coordinate: 100,
			width: 24, age: 0, warning: 1, duration: .6}));
		game.hazards = [];
		game.spawnPattern();
		assert.equal(game.hazards.at(-1).type, 'dart', 'Crowded beam slots fall back to a dart');
		game.beams = [];
		game.hazards = [];
		game.level = 13;
		game.patternCounter = 3;
		game.spawnPattern();
		assert.equal(game.hazards.length, 2, 'Higher tiers schedule an additional threat');
		assert.equal(game.hazards.at(-1).type, 'hunter');
	} finally {
		Math.random = randomBeforeLastPatterns;
	}

	const originalProfileUrl = game.profileUrl;
	const originalFetch = window.fetch;
	game.profileUrl = '';
	await game.loadProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_unavailable);
	game.profileUrl = originalProfileUrl;
	window.fetch = async () => {throw Error('Network offline');};
	await game.loadProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_unavailable);
	game.profileAvailable = true;
	await game.persistProfile('save');
	assert.equal(game.profileStatus.textContent, labels.profile_error);
	game.applyProfile({version: 1, best: 300});
	await game.deleteProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_error);
	assert.equal(game.profileDeleting, false);
	window.fetch = originalFetch;
	document.fullscreenElement = root;

	ui.get('[data-action="restart"]').handlers.click();
	assert.equal(game.state, 'running', 'Restart action creates a fresh run');
	scheduledFrame(5000);
	const lastRandom = Math.random;
	try {
		Math.random = () => .8;
		game.hazards = [{x: 723, y: 390, radius: 15}];
		game.placeCore();
	} finally {
		Math.random = lastRandom;
	}
	game.audioContext.close = async () => {
		audioStats.closed++;
		throw Error('Audio cleanup rejected');
	};
	document.exitFullscreen = async () => {throw Error('Fullscreen cleanup rejected');};

	// Explicit return branches and accessiblity-related controls.
	game.resume();
	game.pause();
	game.pause();
	assert.equal(game.state, 'paused');
	game.resume();
	game.fullscreenButton.disabled = true;
	await game.toggleFullscreen();
	game.fullscreenButton.disabled = false;
	game.soundButton.disabled = true;
	await game.toggleSound();
	game.soundButton.disabled = false;
	game.syncFullscreen();
	assert.equal(document.activeElement, canvas);
	game.announce(null);
	assert.equal(game.announcement.textContent, '');
	game.announce('Missing {placeholder}');
	assert.equal(game.announcement.textContent, 'Missing {placeholder}');
	game.dashCooldown = 1;
	const oldDashTimer = game.dashTimer;
	game.dash();
	assert.equal(game.dashTimer, oldDashTimer, 'Dash is unavailable during cooldown');
	game.dashCooldown = 0;
	game.reducedMotion = true;
	game.dash();
	game.player.vx = 300;
	game.drawPlayer(context, 2);
	game.drawPulse(context, {x: 400, y: 400, age: 0, warning: 1, duration: 2});
	game.core = {x: game.player.x, y: game.player.y, radius: 12};
	game.collectCore();
	game.hitTimer = 2;
	const energyBeforeInvulnerability = game.energy;
	game.takeHit();
	assert.equal(game.energy, energyBeforeInvulnerability);
	game.hitTimer = 0;
	game.dashTimer = 0;
	game.takeHit();
	assert.equal(game.shake, 0, 'Reduced motion removes collision shaking');
	game.reducedMotion = false;
	game.combo = 2;
	game.comboTimer = .01;
	game.hitTimer = 2;
	game.player.x = 30;
	game.player.y = 30;
	game.player.vx = -100;
	game.player.vy = -100;
	game.update(.02);
	assert.equal(game.combo, 0, 'Combos expire once their timer reaches zero');
	assert.equal(game.player.vx, 0);
	assert.equal(game.player.vy, 0);
	game.player.x = 480;
	game.player.y = 270;
	game.setState('between');
	canvas.handlers.pointerdown({button: 0, pointerId: 90, clientX: 200, clientY: 100});
	assert.equal(game.pointerId, null, 'Paused between-level menu ignores pointer steering');
	game.setState('idle');
	canvas.handlers.pointerdown({button: 0, pointerId: 91, clientX: 200, clientY: 100});
	assert.equal(game.state, 'running', 'Primary pointer can start an idle game');
	canvas.handlers.pointerup({pointerId: 91});
	game.pause();
	game.dash();
	assert.equal(game.state, 'paused');
	game.resume();
	game.setState('running');
	game.energy = 1;
	game.hitTimer = 0;
	game.dashTimer = 0;
	game.hazards = [dummyHazard('shard'), dummyHazard('dart')];
	for(const hazard of game.hazards) {hazard.x = game.player.x; hazard.y = game.player.y;}
	game.update(.016);
	assert.equal(game.state, 'over', 'Fatal collision ends the hazard loop');

	const randomForMixedThreat = Math.random;
	try {
		Math.random = () => .75;
		game.level = 6;
		game.patternCounter = 4;
		game.hazards = [];
		game.spawnPattern();
		assert.equal(game.hazards.length, 2, 'First campaign tier adds a shard');
		assert.equal(game.hazards.at(-1).type, 'shard');
	} finally {
		Math.random = randomForMixedThreat;
	}
	game.startNewRun();
	game.hazards = [dummyHazard('hunter')];
	game.beams = [{vertical: true, coordinate: 200, width: 30, age: 1, warning: .5, duration: .8}];
	game.pulses = [{x: 400, y: 400, age: 1.2, warning: 1, duration: .8}];
	game.dashTimer = .12;
	game.player.vx = 300;
	game.draw(10);
	assert.equal(canvasStateDepth, 0, 'Each kind of rendered threat restores Canvas state');
	game.hazards = [];
	game.beams = [];
	game.pulses = [];
	game.frame(5100);
	game.reducedMotion = true;
	game.frame(5200);
	game.setState('over');
	game.frame(5300);
	game.reducedMotion = false;

	// Existing browser buttons also restore Canvas focus during active gameplay.
	game.startNewRun();
	const lastAudioContext = game.audioContext;
	const savedAudioConstructor = window.AudioContext;
	game.audioContext = null;
	window.AudioContext = undefined;
	window.webkitAudioContext = FakeAudioContext;
	await game.toggleSound();
	assert.equal(game.audioEnabled, true, 'WebKit audio constructor is supported');
	game.playSound('unexpected');
	game.audioEnabled = false;
	game.audioContext = lastAudioContext;
	window.AudioContext = savedAudioConstructor;
	delete window.webkitAudioContext;
	document.activeElement = game.soundButton;
	ui.get('[data-action="sound"]').handlers.click();
	assert.equal(document.activeElement, canvas);
	document.activeElement = game.saveButton;
	ui.get('[data-action="save"]').handlers.click();
	assert.equal(document.activeElement, canvas);
	await game.profileQueue;
	document.activeElement = game.deleteButton;
	ui.get('[data-action="delete"]').handlers.click();
	assert.equal(document.activeElement, canvas);
	await game.profileQueue;

	// Profile failure paths never send writes for unavailable sessions.
	const fetchBeforeBranches = window.fetch;
	const profileUrlBeforeBranches = game.profileUrl;
	game.profileAvailable = false;
	await game.persistProfile('save');
	game.deleteProfile();
	game.profileAvailable = true;
	game.applyProfile({});
	game.deleteProfile();
	game.applyProfile({version: 1, best: 'not an integer', checkpoint: null});
	game.resumeSaved();
	game.savedProfile = {checkpoint: {level: '3', score: 12, energy: 2, elapsed: 12}};
	game.setState('paused');
	game.resumeSaved();
	assert.equal(game.state, 'paused', 'Malformed checkpoints are rejected');
	game.savedProfile = {checkpoint: {level: 3, score: 12, energy: 2, elapsed: 12}};
	game.setState('running');
	game.resumeSaved();
	assert.equal(game.state, 'running', 'A running game cannot be overwritten by a save');
	game.setState('paused');
	game.applyProfile({version: 1, best: 12, checkpoint: {level: 3, score: 12, energy: 2, elapsed: 12}});
	const originalConfirm = window.confirm;
	window.confirm = () => false;
	await game.deleteProfile();
	assert.equal(game.profileDeleting, false, 'Rejected deletion confirmation is harmless');
	window.confirm = originalConfirm;

	window.fetch = async () => ({ok: false, json: async () => ({ok: false})});
	await game.loadProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_unavailable);
	await game.persistProfile('record');
	assert.equal(game.profileStatus.textContent, labels.profile_error);
	await game.deleteProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_error);

	window.fetch = async () => ({ok: true, json: async () => ({ok: true, token: 'f'.repeat(64), profile: null})});
	await game.loadProfile();
	assert.equal(game.profileEnabled, false);
	window.fetch = async () => ({ok: true, json: async () => ({ok: true, token: 'f'.repeat(64), profile: {version: 1, best: 85}})});
	await game.loadProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_present);
	window.fetch = async () => ({ok: true, json: async () => ({ok: true, token: null})});
	await game.loadProfile();
	assert.equal(game.profileStatus.textContent, labels.profile_unavailable);

	window.fetch = async () => ({ok: true, json: async () => {
		root.isConnected = false;
		return {ok: true, token: 'f'.repeat(64), profile: {version: 1}};
	}});
	await game.loadProfile();
	root.isConnected = true;
	window.fetch = async () => {game.destroyed = true; throw Error('Network stopped after unmount');};
	await game.loadProfile();
	game.destroyed = false;

	game.profileUrl = profileUrlBeforeBranches;
	game.profileAvailable = true;
	game.applyProfile({version: 1, best: 85});
	window.fetch = fetchBeforeBranches;
	const queuedWrite = game.persistProfile('record');
	game.destroyed = true;
	await queuedWrite;
	game.destroyed = false;
	const queuedDelete = game.deleteProfile();
	game.destroyed = true;
	await queuedDelete;
	game.destroyed = false;
	assert.equal(game.profileDeleting, false);

	game.profileAvailable = true;
	window.fetch = async () => ({ok: true, json: async () => {
		root.isConnected = false;
		return {ok: true, profile: {version: 1, best: 85}};
	}});
	await game.persistProfile('save');
	root.isConnected = true;
	game.applyProfile({version: 1, best: 85});
	await game.deleteProfile();
	root.isConnected = true;
	window.fetch = fetchBeforeBranches;

	game.startNewRun();
	game.reducedMotion = true;
	game.dashTimer = .2;
	game.hazards = [dummyHazard('shard')];
	game.hazards[0].x = game.player.x;
	game.hazards[0].y = game.player.y;
	game.update(.016);
	assert.equal(game.energy, 3, 'Reduced-motion dash protects from collisions');
	game.reducedMotion = false;
	const audioContextBeforeDestroyedResume = game.audioContext;
	game.audioEnabled = false;
	game.audioContext = {state: 'suspended', async resume() {game.destroyed = true;}};
	await game.toggleSound();
	assert.equal(game.audioEnabled, false, 'Sound activation does not resume after unmount');
	game.destroyed = false;
	game.audioContext = audioContextBeforeDestroyedResume;

	root.isConnected = false;
	game.frame(2000);
	assert.equal(game.destroyed, true);
	assert.equal(listeners.size, 0);
	assert.equal(windowListeners.size, 0);
	assert.equal(motionListeners.size, 0);
	assert.equal(audioStats.closed, 1);
	assert.equal(cancelledFrame, 1);
	game.destroy();
	await Promise.resolve();

	const defaultRatio = window.devicePixelRatio;
	const defaultAudio = window.AudioContext;
	window.devicePixelRatio = 0;
	window.AudioContext = undefined;
	root.isConnected = true;
	const unavailableAudioGame = window.NeonDrift.mount(root, labels, {profileUrl: ''});
	assert.equal(unavailableAudioGame.canvas.width, 960, 'Missing DPR uses one pixel per unit');
	assert.equal(unavailableAudioGame.soundButton.disabled, true, 'Missing Web Audio disables sound');
	unavailableAudioGame.destroy();
	window.devicePixelRatio = defaultRatio;
	window.AudioContext = defaultAudio;
	root.isConnected = false;
	console.log('Neon Drift level, dash, profile and lifecycle tests passed.');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
