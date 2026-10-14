'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const windowListeners = new Map();
const motionListeners = new Map();
const audioStats = {played: 0, closed: 0};
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
	createOscillator() {return {frequency: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}, start() {audioStats.played++;}, stop() {}};}
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
vm.runInNewContext(code, {window, document, Math, Set, Array, String, Number, Promise});

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

	root.isConnected = false;
	game.frame(2000);
	assert.equal(game.destroyed, true);
	assert.equal(listeners.size, 0);
	assert.equal(windowListeners.size, 0);
	assert.equal(motionListeners.size, 0);
	assert.equal(audioStats.closed, 1);
	assert.equal(cancelledFrame, 1);
	console.log('Neon Drift level, dash, profile and lifecycle tests passed.');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
