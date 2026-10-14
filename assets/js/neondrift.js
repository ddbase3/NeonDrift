(function(window, document) {
	'use strict';

	const WIDTH = 960;
	const HEIGHT = 540;
	const TAU = Math.PI * 2;
	const MOVEMENT_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
	const DASH_COOLDOWN = 4.2;
	const DASH_DURATION = .23;
	const MAX_HAZARDS = 34;
	const GAME_OVER_SETTLE = .8;

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	function randomBetween(min, max) {
		return min + Math.random() * (max - min);
	}

	function distanceSquared(a, b) {
		return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
	}

	function formatScore(score) {
		return String(score).padStart(6, '0');
	}

	function formatTime(seconds) {
		const value = Math.floor(seconds);
		return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
	}

	function formatLabel(template, replacements = {}) {
		return String(template || '').replace(/\{(\w+)\}/g, (match, key) => String(replacements[key] ?? match));
	}

	class NeonDriftGame {

		constructor(root, labels, options = {}) {
			this.root = root;
			this.labels = labels;
			this.profileUrl = options.profileUrl || '';
			this.canvas = root.querySelector('[data-role="canvas"]');
			this.context = this.canvas.getContext('2d');
			this.overlay = root.querySelector('[data-role="overlay"]');
			this.announcement = root.querySelector('[data-role="announcement"]');
			this.scoreElement = root.querySelector('[data-role="score"]');
			this.bestElement = root.querySelector('[data-role="best"]');
			this.energyElement = root.querySelector('[data-role="energy"]');
			this.timeElement = root.querySelector('[data-role="time"]');
			this.levelElement = root.querySelector('[data-role="level"]');
			this.comboElement = root.querySelector('[data-role="combo"]');
			this.missionCount = root.querySelector('[data-role="mission-count"]');
			this.missionFill = root.querySelector('[data-role="mission-fill"]');
			this.missionTrack = root.querySelector('[data-role="mission-track"]');
			this.missionPhase = root.querySelector('[data-role="mission-phase"]');
			this.overlayTitle = root.querySelector('[data-role="overlay-title"]');
			this.overlayText = root.querySelector('[data-role="overlay-description"]');
			this.startButton = root.querySelector('[data-action="start"]');
			this.startLabel = root.querySelector('[data-role="start-label"]');
			this.pauseButton = root.querySelector('[data-action="pause"]');
			this.fullscreenButton = root.querySelector('[data-action="fullscreen"]');
			this.fullscreenLabel = root.querySelector('[data-role="fullscreen-label"]');
			this.soundButton = root.querySelector('[data-action="sound"]');
			this.soundLabel = root.querySelector('[data-role="sound-label"]');
			this.restartButton = root.querySelector('[data-action="restart"]');
			this.dashButton = root.querySelector('[data-action="dash"]');
			this.dashLabel = root.querySelector('[data-role="dash-label"]');
			this.pauseLabel = root.querySelector('[data-role="pause-label"]');
			this.saveButton = root.querySelector('[data-action="save"]');
			this.loadButton = root.querySelector('[data-action="load"]');
			this.deleteButton = root.querySelector('[data-action="delete"]');
			this.profileStatus = root.querySelector('[data-role="profile-status"]');
			this.keys = new Set();
			this.pointer = null;
			this.pointerId = null;
			this.state = 'idle';
			this.best = 0;
			this.lastFrame = 0;
			this.frameId = 0;
			this.destroyed = false;
			this.profileAvailable = false;
			this.profileEnabled = false;
			this.csrf = '';
			this.savedProfile = null;
			this.profileQueue = Promise.resolve();
			this.profileDeleting = false;
			this.audioEnabled = false;
			this.audioContext = null;
			this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			this.reducedMotion = this.motionQuery.matches;
			this.stars = Array.from({length: 67}, () => ({
				x: randomBetween(4, WIDTH - 4),
				y: randomBetween(4, HEIGHT - 4),
				size: randomBetween(.7, 1.9),
				strength: randomBetween(.1, .45)
			}));

			this.onFrame = timestamp => this.frame(timestamp);
			this.onKeyDown = event => this.keyDown(event);
			this.onKeyUp = event => this.keyUp(event);
			this.onPointerDown = event => this.pointerDown(event);
			this.onPointerMove = event => this.pointerMove(event);
			this.onPointerUp = event => this.pointerUp(event);
			this.onVisibilityChange = () => this.pauseForInterruption();
			this.onWindowBlur = () => this.pauseForInterruption();
			this.onStartClick = () => this.start();
			this.onPauseClick = () => this.togglePause();
			this.onFullscreenClick = () => this.toggleFullscreen();
			this.onFullscreenChange = () => this.syncFullscreen();
			this.onSoundClick = () => {
				void this.toggleSound();
				if(this.state === 'running') this.canvas.focus({preventScroll: true});
			};
			this.onMotionChange = event => {
				this.reducedMotion = event.matches;
				if(this.reducedMotion) {
					this.shake = 0;
					this.particles = [];
					this.rings = [];
				}
			};
			this.onRestartClick = () => this.startNewRun();
			this.onDashClick = () => {
				this.dash();
				if(this.state === 'running') this.canvas.focus({preventScroll: true});
			};
			this.onSaveClick = () => {
				this.persistProfile('save');
				if(this.state === 'running') this.canvas.focus({preventScroll: true});
			};
			this.onLoadClick = () => this.resumeSaved();
			this.onDeleteClick = () => {
				this.deleteProfile();
				if(this.state === 'running') this.canvas.focus({preventScroll: true});
			};

			if(!this.context) {
				this.announce(this.labels.load_error);
				return;
			}

			this.startButton.addEventListener('click', this.onStartClick);
			this.pauseButton.addEventListener('click', this.onPauseClick);
			this.fullscreenButton.addEventListener('click', this.onFullscreenClick);
			this.soundButton.addEventListener('click', this.onSoundClick);
			this.restartButton.addEventListener('click', this.onRestartClick);
			this.dashButton.addEventListener('click', this.onDashClick);
			this.saveButton.addEventListener('click', this.onSaveClick);
			this.loadButton.addEventListener('click', this.onLoadClick);
			this.deleteButton.addEventListener('click', this.onDeleteClick);
			this.canvas.addEventListener('pointerdown', this.onPointerDown);
			this.canvas.addEventListener('pointermove', this.onPointerMove);
			this.canvas.addEventListener('pointerup', this.onPointerUp);
			this.canvas.addEventListener('pointercancel', this.onPointerUp);
			document.addEventListener('keydown', this.onKeyDown);
			document.addEventListener('keyup', this.onKeyUp);
			document.addEventListener('visibilitychange', this.onVisibilityChange);
			document.addEventListener('fullscreenchange', this.onFullscreenChange);
			this.motionQuery.addEventListener('change', this.onMotionChange);
			window.addEventListener('blur', this.onWindowBlur);

			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			this.canvas.width = Math.round(WIDTH * ratio);
			this.canvas.height = Math.round(HEIGHT * ratio);
			this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
			this.resetWorld();
			this.setState('idle');
			this.fullscreenButton.disabled = document.fullscreenEnabled === false ||
				typeof this.root.requestFullscreen !== 'function' || typeof document.exitFullscreen !== 'function';
			this.syncFullscreen();
			this.soundButton.disabled = typeof window.AudioContext !== 'function' && typeof window.webkitAudioContext !== 'function';
			this.syncSound();
			this.announce(this.labels.ready_announcement);
			this.frameId = window.requestAnimationFrame(this.onFrame);
			this.loadProfile();
		}

		resetWorld() {
			this.score = 0;
			this.energy = 3;
			this.elapsed = 0;
			this.level = 1;
			this.levelTime = 0;
			this.levelCores = 0;
			this.combo = 0;
			this.comboTimer = 0;
			this.hitsThisLevel = 0;
			this.spawnTimer = 0;
			this.patternCounter = 0;
			this.nextSpawn = 1.3;
			this.hitTimer = 0;
			this.dashTimer = 0;
			this.dashCooldown = 0;
			this.shake = 0;
			this.gameOverElapsed = 0;
			this.gameOverFrozen = false;
			this.player = {x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, radius: 15, angle: -Math.PI / 2};
			this.hazards = [];
			this.beams = [];
			this.pulses = [];
			this.particles = [];
			this.rings = [];
			this.keys.clear();
			this.pointer = null;
			this.pointerId = null;
			this.core = this.placeCore();
			this.refreshHud();
		}

		placeCore() {
			let point;
			for(let attempt = 0; attempt < 60; attempt++) {
				point = {x: randomBetween(75, WIDTH - 75), y: randomBetween(70, HEIGHT - 70), radius: 12};
				if(distanceSquared(point, this.player) >= 145 ** 2 &&
					this.hazards.every(hazard => distanceSquared(point, hazard) > 65 ** 2)) {
					return point;
				}
			}
			return point;
		}

		targetCores() {
			return 3 + Math.min(6, Math.ceil(this.level / 2));
		}

		phaseIndex() {
			return ((this.level - 1) % 5) + 1;
		}

		currentThreat() {
			return this.level + Math.floor(this.levelTime / 25);
		}

		start() {
			if(this.state === 'between') {
				this.lastFrame = 0;
				this.setState('running');
				this.announce(this.labels.level_started, {level: this.level});
				this.canvas.focus({preventScroll: true});
			} else if(this.state === 'idle' || this.state === 'over') {
				this.startNewRun();
			} else if(this.state === 'paused') {
				this.resume();
			}
		}

		startNewRun() {
			this.resetWorld();
			this.setState('running');
			this.lastFrame = 0;
			this.announce(this.labels.running_announcement);
			this.playSound('start');
			this.canvas.focus({preventScroll: true});
		}

		resume() {
			if(this.state !== 'paused') return;
			this.lastFrame = 0;
			this.setState('running');
			this.announce(this.labels.running_announcement);
			this.canvas.focus({preventScroll: true});
		}

		pause() {
			if(this.state !== 'running') return;
			this.keys.clear();
			this.pointer = null;
			this.pointerId = null;
			this.setState('paused');
			this.announce(this.labels.paused_announcement);
		}

		togglePause() {
			if(this.state === 'running') this.pause();
			else if(this.state === 'paused') this.resume();
		}

		pauseForInterruption() {
			if(document.hidden || !document.hasFocus()) this.pause();
		}

		setState(state) {
			this.state = state;
			if(state === 'over') {
				this.gameOverElapsed = 0;
				this.gameOverFrozen = false;
			}
			this.root.dataset.state = state;
			this.overlay.setAttribute('aria-hidden', state === 'running' ? 'true' : 'false');
			this.startButton.disabled = state === 'running' || state === 'paused';
			this.pauseButton.disabled = state !== 'running' && state !== 'paused';
			this.restartButton.disabled = state === 'idle';
			this.startLabel.textContent = state === 'between' ? this.labels.next_level : this.labels.start;
			this.pauseLabel.textContent = state === 'paused' ? this.labels.resume : this.labels.pause;
			const section = state === 'between' ? 'between' : state === 'paused' ? 'paused' : state === 'over' ? 'over' : 'intro';
			this.overlayTitle.textContent = formatLabel(this.labels[section + '_title'], {level: this.level});
			this.overlayText.textContent = formatLabel(this.labels[section + '_text'], {level: this.level, score: this.score});
			this.updateControls();
		}

		async toggleFullscreen() {
			if(this.fullscreenButton.disabled || this.destroyed) return;
			try {
				if(document.fullscreenElement === this.root) await document.exitFullscreen();
				else await this.root.requestFullscreen();
			} catch(error) {
				this.announce(this.labels.fullscreen_error);
			}
		}

		syncFullscreen() {
			const active = document.fullscreenElement === this.root;
			const label = active ? this.labels.fullscreen_exit : this.labels.fullscreen_enter;
			this.fullscreenButton.setAttribute('aria-label', label);
			this.fullscreenButton.title = label;
			this.fullscreenLabel.textContent = label;
			if(this.state === 'running') this.canvas.focus({preventScroll: true});
		}

		async toggleSound() {
			if(this.soundButton.disabled || this.destroyed) return;
			if(this.audioEnabled) {
				this.audioEnabled = false;
				this.syncSound();
				return;
			}
			try {
				if(!this.audioContext) {
					const AudioContext = window.AudioContext || window.webkitAudioContext;
					this.audioContext = new AudioContext();
				}
				if(this.audioContext.state === 'suspended') await this.audioContext.resume();
				if(this.destroyed) return;
				this.audioEnabled = true;
				this.syncSound();
				this.playSound('start');
			} catch(error) {
				this.audioEnabled = false;
				this.soundButton.disabled = true;
				this.syncSound();
				this.announce(this.labels.sound_unavailable);
			}
		}

		syncSound() {
			this.soundButton.setAttribute('aria-pressed', String(this.audioEnabled));
			this.soundLabel.textContent = this.audioEnabled ? this.labels.sound_disable : this.labels.sound_enable;
			this.soundButton.title = this.audioEnabled ? this.labels.sound_disable : this.labels.sound_enable;
		}

		playSound(kind) {
			if(!this.audioEnabled || !this.audioContext || this.destroyed) return;
			const notes = {
				start: [510, 780, .13], collect: [680, 1140, .12],
				dash: [240, 660, .16], hit: [260, 110, .19],
				level: [630, 1250, .24], over: [330, 115, .28]
			};
			const [from, to, duration] = notes[kind] || notes.start;
			try {
				const oscillator = this.audioContext.createOscillator();
				const volume = this.audioContext.createGain();
				const now = this.audioContext.currentTime;
				oscillator.type = 'triangle';
				oscillator.frequency.setValueAtTime(from, now);
				oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
				volume.gain.setValueAtTime(.001, now);
				volume.gain.exponentialRampToValueAtTime(.07, now + .012);
				volume.gain.exponentialRampToValueAtTime(.001, now + duration);
				oscillator.connect(volume);
				volume.connect(this.audioContext.destination);
				oscillator.start(now);
				oscillator.stop(now + duration + .01);
				oscillator.onended = () => {oscillator.disconnect(); volume.disconnect();};
			} catch(error) {
				this.audioEnabled = false;
				this.syncSound();
				this.announce(this.labels.sound_unavailable);
			}
		}

		announce(message, replacements = {}) {
			this.announcement.textContent = formatLabel(message, replacements);
		}

		keyDown(event) {
			// Native buttons must retain their own Space and Enter activation.
			if(document.activeElement !== this.canvas) return;
			const key = event.key.toLowerCase();
			if(MOVEMENT_KEYS.has(key) || key === ' ' || key === 'shift' || key === 'j') event.preventDefault();
			if(key === ' ' && !event.repeat) {
				if(this.state === 'running' || this.state === 'paused') this.togglePause();
				else this.start();
			}
			if(key === 'escape') this.pause();
			if(this.state !== 'running') return;
			if(MOVEMENT_KEYS.has(key)) this.keys.add(key);
			if((key === 'shift' || key === 'j') && !event.repeat) this.dash();
		}

		keyUp(event) {
			this.keys.delete(event.key.toLowerCase());
		}

		pointerPoint(event) {
			const bounds = this.canvas.getBoundingClientRect();
			return {
				x: clamp((event.clientX - bounds.left) * WIDTH / bounds.width, 0, WIDTH),
				y: clamp((event.clientY - bounds.top) * HEIGHT / bounds.height, 0, HEIGHT)
			};
		}

		pointerDown(event) {
			if(event.button !== 0 || this.pointerId !== null) return;
			this.canvas.focus({preventScroll: true});
			if(this.state === 'idle' || this.state === 'over') this.startNewRun();
			if(this.state !== 'running') return;
			this.pointerId = event.pointerId;
			this.pointer = this.pointerPoint(event);
			this.canvas.setPointerCapture(event.pointerId);
		}

		pointerMove(event) {
			if(this.pointerId === event.pointerId) this.pointer = this.pointerPoint(event);
		}

		pointerUp(event) {
			if(this.pointerId === event.pointerId) {
				this.pointerId = null;
				this.pointer = null;
			}
		}

		movementVector() {
			let x = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
			let y = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
			if(x === 0 && y === 0 && this.pointer) {
				const dx = this.pointer.x - this.player.x;
				const dy = this.pointer.y - this.player.y;
				const distance = Math.hypot(dx, dy);
				if(distance > 7) {
					const strength = Math.min(1, distance / 95);
					x = dx / distance * strength;
					y = dy / distance * strength;
				}
			}
			const length = Math.hypot(x, y);
			if(length > 1) {x /= length; y /= length;}
			return {x, y};
		}

		dash() {
			if(this.state !== 'running' || this.dashCooldown > 0) return;
			const movement = this.movementVector();
			const direction = Math.hypot(movement.x, movement.y) > .1
				? Math.atan2(movement.y, movement.x) : this.player.angle;
			this.player.angle = direction;
			this.player.vx = Math.cos(direction) * 950;
			this.player.vy = Math.sin(direction) * 950;
			this.dashTimer = DASH_DURATION;
			this.dashCooldown = DASH_COOLDOWN;
			this.emitParticles(this.player.x, this.player.y, '#ffcc85', this.reducedMotion ? 5 : 23);
			this.rings.push({x: this.player.x, y: this.player.y, life: .34, duration: .34, color: '#ffcc85'});
			this.playSound('dash');
			this.updateControls();
		}

		update(delta) {
			this.elapsed += delta;
			this.levelTime += delta;
			this.hitTimer = Math.max(0, this.hitTimer - delta);
			this.dashTimer = Math.max(0, this.dashTimer - delta);
			this.dashCooldown = Math.max(0, this.dashCooldown - delta);
			this.shake = Math.max(0, this.shake - 32 * delta);
			if(this.comboTimer > 0) {
				this.comboTimer = Math.max(0, this.comboTimer - delta);
				if(this.comboTimer === 0) this.combo = 0;
			}

			if(this.dashTimer <= 0) {
				const movement = this.movementVector();
				const friction = Math.exp(-4.8 * delta);
				this.player.vx = (this.player.vx + movement.x * 1550 * delta) * friction;
				this.player.vy = (this.player.vy + movement.y * 1550 * delta) * friction;
				const speed = Math.hypot(this.player.vx, this.player.vy);
				if(speed > 395) {
					this.player.vx *= 395 / speed;
					this.player.vy *= 395 / speed;
				}
			}
			const speed = Math.hypot(this.player.vx, this.player.vy);
			this.player.x = clamp(this.player.x + this.player.vx * delta, 30, WIDTH - 30);
			this.player.y = clamp(this.player.y + this.player.vy * delta, 30, HEIGHT - 30);
			if(this.player.x === 30 || this.player.x === WIDTH - 30) this.player.vx = 0;
			if(this.player.y === 30 || this.player.y === HEIGHT - 30) this.player.vy = 0;
			if(speed > 22) this.player.angle = Math.atan2(this.player.vy, this.player.vx);

			this.spawnTimer += delta;
			const threat = this.currentThreat();
			if(this.spawnTimer >= this.nextSpawn) {
				this.spawnTimer -= this.nextSpawn;
				this.nextSpawn = Math.max(.39, 1.45 - threat * .085);
				this.spawnPattern();
			}

			for(const hazard of this.hazards) {
				if(hazard.type === 'hunter') {
					const desired = Math.atan2(this.player.y - hazard.y, this.player.x - hazard.x);
					const current = Math.atan2(hazard.vy, hazard.vx);
					const change = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
					const direction = current + clamp(change, -1.5 * delta, 1.5 * delta);
					hazard.vx = Math.cos(direction) * hazard.speed;
					hazard.vy = Math.sin(direction) * hazard.speed;
				}
				hazard.x += hazard.vx * delta;
				hazard.y += hazard.vy * delta;
				hazard.angle += hazard.spin * delta;
				hazard.age += delta;
				if(distanceSquared(hazard, this.player) < (hazard.radius * .72 + this.player.radius) ** 2) {
					if(this.dashTimer > 0 && !hazard.destroyed) {
						hazard.destroyed = true;
						this.score += 75;
						this.best = Math.max(this.best, this.score);
						this.emitParticles(hazard.x, hazard.y, '#ffc879', this.reducedMotion ? 3 : 10);
					} else if(this.canBeHit()) {
						this.takeHit();
						if(this.state !== 'running') break;
					}
				}
			}
			this.hazards = this.hazards.filter(hazard => !hazard.destroyed && hazard.age < (hazard.type === 'hunter' ? 6 : 9) &&
				hazard.x > -130 && hazard.x < WIDTH + 130 && hazard.y > -130 && hazard.y < HEIGHT + 130);

			for(const beam of this.beams) {
				beam.age += delta;
				if(beam.age >= beam.warning && beam.age < beam.warning + beam.duration && this.canBeHit()) {
					const playerCoordinate = beam.vertical ? this.player.x : this.player.y;
					if(Math.abs(playerCoordinate - beam.coordinate) <= beam.width / 2 + this.player.radius * .65) this.takeHit();
				}
			}
			this.beams = this.beams.filter(beam => beam.age < beam.warning + beam.duration);

			for(const pulse of this.pulses) {
				pulse.age += delta;
				if(pulse.age >= pulse.warning && pulse.age < pulse.warning + pulse.duration && this.canBeHit()) {
					const fraction = (pulse.age - pulse.warning) / pulse.duration;
					const radius = 30 + fraction * 155;
					const distance = Math.sqrt(distanceSquared(pulse, this.player));
					if(Math.abs(distance - radius) <= 12 + this.player.radius * .65) this.takeHit();
				}
			}
			this.pulses = this.pulses.filter(pulse => pulse.age < pulse.warning + pulse.duration);

			if(this.state === 'running' && distanceSquared(this.core, this.player) < (this.core.radius + this.player.radius + 6) ** 2) {
				this.collectCore();
			}

			this.updateEffects(delta);

			if(this.state === 'running' && this.levelCores >= this.targetCores() && this.levelTime >= 12) {
				this.completeLevel();
			}
			this.refreshHud();
		}

		updateEffects(delta) {
			for(const particle of this.particles) {
				particle.x += particle.vx * delta;
				particle.y += particle.vy * delta;
				particle.life -= delta;
			}
			this.particles = this.particles.filter(particle => particle.life > 0);
			for(const ring of this.rings) ring.life -= delta;
			this.rings = this.rings.filter(ring => ring.life > 0);
		}

		canBeHit() {
			return this.state === 'running' && this.hitTimer <= 0 && this.dashTimer <= 0;
		}

		spawnPattern() {
			if(this.hazards.length >= MAX_HAZARDS) return;
			this.patternCounter++;
			const phase = this.phaseIndex();
			const tier = Math.floor((this.level - 1) / 5);
			const roll = Math.random();
			// Each sector trains one additional avoidance skill before mixing threats.
			if(phase === 1) {
				this.spawnHazard(tier >= 1 && roll < .25 ? 'dart' : 'shard');
			} else if(phase === 2) {
				if(tier >= 1 && roll < .20) this.spawnVolley();
				else this.spawnHazard(roll < .7 ? 'dart' : 'shard');
			} else if(phase === 3) {
				if(roll < .32 && this.beams.length < 3) this.spawnBeam();
				else if(roll < .56) this.spawnHazard('dart');
				else this.spawnHazard('shard');
			} else if(phase === 4) {
				if(roll < .40) this.spawnHazard('hunter');
				else if(roll < .73) this.spawnVolley();
				else if(this.beams.length < 3) this.spawnBeam();
				else this.spawnHazard('dart');
			} else {
				if(roll < .30 && this.pulses.length < 3) this.spawnPulse();
				else if(roll < .52 && this.beams.length < 3) this.spawnBeam();
				else if(roll < .76) this.spawnHazard('hunter');
				else this.spawnVolley();
			}
			// Every five levels the campaign loops with an additional mixed threat.
			// This also increases intensity after single-entity spawn speed is capped.
			if(tier > 0 && this.patternCounter % Math.max(2, 6 - Math.min(tier, 4)) === 0 && this.hazards.length < MAX_HAZARDS) {
				this.spawnHazard(tier >= 2 && phase >= 3 ? 'hunter' : 'shard');
			}
		}

		spawnHazard(type = 'shard', angleOffset = 0, entry = null) {
			const side = Math.floor(randomBetween(0, 4));
			const padding = 42;
			let x = randomBetween(0, WIDTH);
			let y = randomBetween(0, HEIGHT);
			if(side === 0) y = -padding;
			if(side === 1) x = WIDTH + padding;
			if(side === 2) y = HEIGHT + padding;
			if(side === 3) x = -padding;
			if(entry) {x = entry.x; y = entry.y;}
			const target = {x: this.player.x + randomBetween(-110, 110), y: this.player.y + randomBetween(-100, 100)};
			const angle = Math.atan2(target.y - y, target.x - x) + angleOffset;
			const speed = type === 'hunter' ? Math.min(195, 110 + this.level * 5)
				: type === 'dart' ? Math.min(430, 230 + this.level * 15)
				: Math.min(360, randomBetween(145, 185) + this.level * 13);
			this.hazards.push({
				type, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
				speed, radius: type === 'dart' ? 15 : type === 'hunter' ? 21 : randomBetween(18, 27),
				angle: randomBetween(0, TAU), spin: type === 'hunter' ? 0 : randomBetween(-2.1, 2.1), age: 0
			});
		}

		spawnVolley() {
			const side = Math.floor(randomBetween(0, 4));
			const entry = {
				x: side === 0 ? -40 : side === 1 ? WIDTH + 40 : randomBetween(80, WIDTH - 80),
				y: side === 2 ? -40 : side === 3 ? HEIGHT + 40 : randomBetween(80, HEIGHT - 80)
			};
			for(const offset of [-.23, 0, .23]) {
				if(this.hazards.length < MAX_HAZARDS) this.spawnHazard('dart', offset, entry);
			}
		}

		spawnBeam() {
			const vertical = Math.random() > .5;
			const playerCoordinate = vertical ? this.player.x : this.player.y;
			this.beams.push({
				vertical,
				coordinate: clamp(playerCoordinate + randomBetween(-65, 65), 50, (vertical ? WIDTH : HEIGHT) - 50),
				width: Math.min(48, 24 + this.level * 2), age: 0,
				warning: Math.max(.85, 1.5 - this.level * .045), duration: .62
			});
		}

		spawnPulse() {
			this.pulses.push({
				x: clamp(this.player.x + randomBetween(-130, 130), 150, WIDTH - 150),
				y: clamp(this.player.y + randomBetween(-105, 105), 130, HEIGHT - 130),
				age: 0, warning: 1.12, duration: .92
			});
		}

		collectCore() {
			this.combo = this.comboTimer > 0 ? Math.min(5, this.combo + 1) : 1;
			this.comboTimer = 5.5;
			this.score += 100 * this.combo;
			this.best = Math.max(this.best, this.score);
			this.levelCores++;
			this.emitParticles(this.core.x, this.core.y, '#49fff0', this.reducedMotion ? 5 : 18);
			this.rings.push({x: this.core.x, y: this.core.y, life: .48, duration: .48, color: '#49fff0'});
			this.core = this.placeCore();
			this.playSound('collect');
			this.announce(this.labels.collected_announcement, {score: this.score, combo: this.combo});
		}

		takeHit() {
			if(!this.canBeHit()) return;
			this.energy--;
			this.hitsThisLevel++;
			this.combo = 0;
			this.comboTimer = 0;
			this.hitTimer = 1.4;
			this.shake = this.reducedMotion ? 0 : 9;
			this.emitParticles(this.player.x, this.player.y, '#ff527a', this.reducedMotion ? 5 : 25);
			this.playSound(this.energy <= 0 ? 'over' : 'hit');
			this.rings.push({x: this.player.x, y: this.player.y, life: .48, duration: .48, color: '#ff527a'});
			if(this.energy <= 0) {
				this.setState('over');
				this.keys.clear();
				this.pointer = null;
				this.pointerId = null;
				this.announce(this.labels.over_announcement, {score: this.score, level: this.level});
				if(this.profileEnabled) this.persistProfile('record');
			} else {
				this.announce(this.labels.hit_announcement, {energy: this.energy});
			}
		}

		completeLevel() {
			const completedLevel = this.level;
			const perfect = this.hitsThisLevel === 0;
			const bonus = completedLevel * 250 + (perfect ? completedLevel * 150 : 0);
			this.score += bonus;
			this.best = Math.max(this.best, this.score);
			this.level++;
			this.levelTime = 0;
			this.levelCores = 0;
			this.hitsThisLevel = 0;
			if(completedLevel % 3 === 0) this.energy = Math.min(4, this.energy + 1);
			this.player.x = WIDTH / 2;
			this.player.y = HEIGHT / 2;
			this.player.vx = 0;
			this.player.vy = 0;
			this.hitTimer = 1.8;
			this.dashCooldown = 0;
			this.dashTimer = 0;
			this.spawnTimer = 0;
			this.patternCounter = 0;
			this.hazards = [];
			this.beams = [];
			this.pulses = [];
			this.core = this.placeCore();
			this.keys.clear();
			this.pointer = null;
			this.pointerId = null;
			this.setState('between');
			this.playSound('level');
			this.announce(this.labels.level_complete, {level: completedLevel, bonus, next: this.level});
			if(this.profileEnabled) this.persistProfile('advance');
		}

		emitParticles(x, y, color, count) {
			for(let i = 0; i < count; i++) {
				const angle = randomBetween(0, TAU);
				const speed = randomBetween(55, 225);
				const duration = randomBetween(.28, .65);
				this.particles.push({x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: duration, duration, color});
			}
			if(this.particles.length > 210) this.particles = this.particles.slice(-210);
		}

		refreshHud() {
			this.scoreElement.textContent = formatScore(this.score);
			this.bestElement.textContent = formatScore(this.best);
			this.energyElement.textContent = String(this.energy) + ' ' + (this.energy > 0 ? '◆ '.repeat(this.energy).trim() : '◇ ◇ ◇');
			this.timeElement.textContent = formatTime(this.elapsed);
			this.levelElement.textContent = String(this.level).padStart(2, '0');
			this.comboElement.textContent = '×' + String(Math.max(1, this.combo));
			this.missionCount.textContent = `${Math.min(this.levelCores, this.targetCores())} / ${this.targetCores()}`;
			this.missionFill.style.width = (Math.min(1, this.levelCores / this.targetCores()) * 100) + '%';
			this.missionTrack.setAttribute('aria-valuenow', String(Math.min(this.levelCores, this.targetCores())));
			this.missionTrack.setAttribute('aria-valuemax', String(this.targetCores()));
			this.missionPhase.textContent = this.labels['phase_' + this.phaseIndex()];
			this.updateControls();
		}

		updateControls() {
			this.dashButton.disabled = this.state !== 'running' || this.dashCooldown > 0;
			const nextLabel = this.dashCooldown > 0 ? `${this.labels.dash} ${this.dashCooldown.toFixed(1)}s` : this.labels.dash;
			if(this.dashLabel.textContent !== nextLabel) this.dashLabel.textContent = nextLabel;
			this.saveButton.disabled = this.profileDeleting || !this.profileAvailable || !['running', 'paused', 'between'].includes(this.state);
			this.loadButton.disabled = this.profileDeleting || !this.savedProfile?.checkpoint || this.state === 'running';
			this.deleteButton.disabled = this.profileDeleting || !this.profileAvailable || !this.profileEnabled;
		}

		async loadProfile() {
			if(!this.profileUrl || typeof window.fetch !== 'function') {
				this.profileStatus.textContent = this.labels.profile_unavailable;
				return;
			}
			try {
				const result = await window.fetch(this.profileUrl, {
					method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: {'Accept': 'application/json'}
				});
				const data = await result.json();
				if(this.destroyed || !this.root.isConnected) return;
				if(!result.ok || !data.ok || typeof data.token !== 'string') throw new Error('Game profile unavailable');
				this.csrf = data.token;
				this.profileAvailable = true;
				this.applyProfile(data.profile || {});
				this.profileStatus.textContent = this.profileEnabled ? this.labels.profile_present : this.labels.profile_opt_in;
				this.refreshHud();
			} catch(error) {
				if(this.destroyed) return;
				this.profileStatus.textContent = this.labels.profile_unavailable;
			}
		}

		applyProfile(profile) {
			this.profileEnabled = !!profile && typeof profile === 'object' && profile.version === 1;
			this.savedProfile = this.profileEnabled ? profile : null;
			if(this.profileEnabled && Number.isInteger(profile.best)) {
				this.best = Math.max(this.best, profile.best);
			}
			this.updateControls();
		}

		persistProfile(operation) {
			if(!this.profileAvailable || this.destroyed || this.profileDeleting) return this.profileQueue;
			const payload = {
				operation, token: this.csrf,
				score: this.score, level: this.level, elapsed: Math.floor(this.elapsed),
				energy: this.energy
			};
			this.profileQueue = this.profileQueue.then(async () => {
				if(this.destroyed) return;
				try {
					const result = await window.fetch(this.profileUrl, {
						method: 'POST', credentials: 'same-origin', cache: 'no-store',
						headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
						body: JSON.stringify(payload)
					});
					const data = await result.json();
					if(this.destroyed || !this.root.isConnected) return;
					if(!result.ok || !data.ok) throw new Error('Game profile save failed');
					this.applyProfile(data.profile);
					this.profileStatus.textContent = operation === 'record' ? this.labels.profile_recorded : this.labels.profile_saved;
					this.refreshHud();
				} catch(error) {
					if(!this.destroyed) this.profileStatus.textContent = this.labels.profile_error;
				}
			});
			return this.profileQueue;
		}

		resumeSaved() {
			if(this.state === 'running' || !this.savedProfile?.checkpoint) return;
			const saved = this.savedProfile.checkpoint;
			if(!Number.isInteger(saved.level) || !Number.isInteger(saved.score) || !Number.isInteger(saved.energy) || !Number.isInteger(saved.elapsed)) return;
			this.resetWorld();
			this.level = clamp(saved.level, 1, 999);
			this.score = clamp(saved.score, 0, 2000000000);
			this.best = Math.max(this.best, this.score);
			this.energy = clamp(saved.energy, 1, 4);
			this.elapsed = clamp(saved.elapsed, 0, 604800);
			this.hitTimer = 1.8;
			this.setState('running');
			this.lastFrame = 0;
			this.refreshHud();
			this.announce(this.labels.profile_resumed, {level: this.level});
			this.canvas.focus({preventScroll: true});
		}

		deleteProfile() {
			if(!this.profileAvailable || !this.profileEnabled || this.profileDeleting || this.destroyed) return this.profileQueue;
			if(typeof window.confirm === 'function' && !window.confirm(this.labels.profile_confirm_delete)) return this.profileQueue;
			this.profileDeleting = true;
			this.updateControls();
			this.profileQueue = this.profileQueue.then(async () => {
				if(this.destroyed) return;
				try {
					const result = await window.fetch(this.profileUrl, {
						method: 'POST', credentials: 'same-origin', cache: 'no-store',
						headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
						body: JSON.stringify({operation: 'delete', token: this.csrf})
					});
					const data = await result.json();
					if(this.destroyed || !this.root.isConnected) return;
					if(!result.ok || !data.ok) throw new Error('Game profile deletion failed');
					this.applyProfile({});
					this.best = this.score;
					this.profileStatus.textContent = this.labels.profile_deleted;
					this.refreshHud();
				} catch(error) {
					if(!this.destroyed) this.profileStatus.textContent = this.labels.profile_error;
				}
			}).finally(() => {
				this.profileDeleting = false;
				if(!this.destroyed) this.updateControls();
			});
			return this.profileQueue;
		}

		frame(timestamp) {
			if(this.destroyed || !this.root.isConnected) {
				this.destroy();
				return;
			}
			const delta = this.lastFrame ? clamp((timestamp - this.lastFrame) / 1000, 0, .033) : 0;
			this.lastFrame = timestamp;
			const wasRunning = this.state === 'running';
			if(wasRunning) this.update(delta);
			if(this.state === 'over') {
				if(!this.gameOverFrozen) {
					if(!wasRunning) {
						this.gameOverElapsed += delta;
						this.shake = Math.max(0, this.shake - 36 * delta);
						this.updateEffects(delta);
					}
					if(this.gameOverElapsed >= GAME_OVER_SETTLE) {
						this.shake = 0;
						this.particles = [];
						this.rings = [];
						this.gameOverFrozen = true;
					}
					this.draw(this.reducedMotion ? 0 : timestamp / 1000);
				}
			} else {
				this.draw(this.reducedMotion ? 0 : timestamp / 1000);
			}
			this.frameId = window.requestAnimationFrame(this.onFrame);
		}

		draw(clock) {
			const ctx = this.context;
			ctx.clearRect(0, 0, WIDTH, HEIGHT);
			ctx.fillStyle = '#060d1c';
			ctx.fillRect(0, 0, WIDTH, HEIGHT);
			const ambient = ctx.createRadialGradient(WIDTH * .53, HEIGHT * .45, 40, WIDTH * .53, HEIGHT * .45, 535);
			ambient.addColorStop(0, '#0d2940');
			ambient.addColorStop(.5, '#0a1a2b');
			ambient.addColorStop(1, '#050b19');
			ctx.fillStyle = ambient;
			ctx.fillRect(0, 0, WIDTH, HEIGHT);

			ctx.save();
			ctx.strokeStyle = 'rgba(70, 174, 211, .13)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			const offset = this.reducedMotion ? 0 : (clock * 8) % 44;
			for(let x = -44 + offset; x < WIDTH + 44; x += 44) {ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT);}
			for(let y = -44 + offset; y < HEIGHT + 44; y += 44) {ctx.moveTo(0, y); ctx.lineTo(WIDTH, y);}
			ctx.stroke();
			ctx.restore();
			for(const star of this.stars) {
				ctx.fillStyle = `rgba(151, 223, 254, ${star.strength})`;
				ctx.fillRect(star.x, star.y, star.size, star.size);
			}

			ctx.save();
			ctx.translate(WIDTH / 2, HEIGHT / 2);
			ctx.strokeStyle = 'rgba(76, 174, 212, .12)';
			ctx.lineWidth = 1;
			for(let i = 0; i < 4; i++) {
				ctx.beginPath(); ctx.arc(0, 0, 90 + i * 95, 0, TAU); ctx.stroke();
			}
			ctx.strokeStyle = 'rgba(80, 217, 231, .3)';
			ctx.beginPath();
			ctx.arc(0, 0, 185, clock * .24, clock * .24 + .74);
			ctx.stroke();
			ctx.restore();

			ctx.save();
			if(this.shake > 0) ctx.translate(randomBetween(-this.shake, this.shake), randomBetween(-this.shake, this.shake));
			this.drawCore(ctx, clock);
			for(const beam of this.beams) this.drawBeam(ctx, beam);
			for(const pulse of this.pulses) this.drawPulse(ctx, pulse);
			for(const hazard of this.hazards) this.drawHazard(ctx, hazard);
			this.drawPlayer(ctx, clock);
			this.drawEffects(ctx);
			ctx.restore();

			ctx.fillStyle = 'rgba(134, 216, 234, .68)';
			ctx.font = 'bold 12px monospace';
			ctx.fillText(this.labels.field_label, 27, 35);
			ctx.textAlign = 'right';
			ctx.fillText(`${this.labels.threat_label} ${String(this.currentThreat()).padStart(2, '0')}`, WIDTH - 27, 35);
			ctx.textAlign = 'left';
		}

		drawCore(ctx, clock) {
			const core = this.core;
			const pulse = 1 + Math.sin(clock * 3.5) * .08;
			ctx.save();
			ctx.translate(core.x, core.y);
			ctx.shadowColor = '#42fff2'; ctx.shadowBlur = 35; ctx.fillStyle = '#7ffff5';
			ctx.beginPath(); ctx.arc(0, 0, core.radius * pulse, 0, TAU); ctx.fill();
			ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(88, 255, 240, .85)'; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.arc(0, 0, 23 * pulse, 0, TAU); ctx.stroke();
			ctx.beginPath(); ctx.arc(0, 0, 32 * pulse, clock * 1.3, clock * 1.3 + Math.PI * .9); ctx.stroke();
			ctx.restore();
		}

		drawHazard(ctx, hazard) {
			ctx.save();
			ctx.translate(hazard.x, hazard.y);
			ctx.rotate(hazard.angle);
			ctx.shadowColor = hazard.type === 'hunter' ? '#e168ff' : hazard.type === 'dart' ? '#ffba55' : '#ff416c';
			ctx.shadowBlur = 22;
			ctx.fillStyle = hazard.type === 'hunter' ? '#72359b' : hazard.type === 'dart' ? '#a25a28' : '#9e2349';
			ctx.strokeStyle = hazard.type === 'hunter' ? '#e5a1ff' : hazard.type === 'dart' ? '#ffe1a2' : '#ff7995';
			ctx.lineWidth = 2.5; ctx.beginPath();
			if(hazard.type === 'dart') {
				ctx.moveTo(hazard.radius, 0); ctx.lineTo(-hazard.radius * .75, -hazard.radius * .8);
				ctx.lineTo(-hazard.radius * .38, 0); ctx.lineTo(-hazard.radius * .75, hazard.radius * .8);
			} else if(hazard.type === 'hunter') {
				for(let i = 0; i < 6; i++) {
					const a = i * TAU / 6;
					if(i === 0) ctx.moveTo(Math.cos(a) * hazard.radius, Math.sin(a) * hazard.radius);
					else ctx.lineTo(Math.cos(a) * hazard.radius, Math.sin(a) * hazard.radius);
				}
			} else {
				for(let i = 0; i < 8; i++) {
					const a = i * TAU / 8;
					const radius = i % 2 === 0 ? hazard.radius : hazard.radius * .43;
					if(i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
					else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
				}
			}
			ctx.closePath(); ctx.fill(); ctx.stroke();
			ctx.shadowBlur = 0; ctx.fillStyle = '#ffe6f0'; ctx.fillRect(-3, -3, 6, 6);
			ctx.restore();
		}

		drawBeam(ctx, beam) {
			const active = beam.age >= beam.warning;
			const start = beam.coordinate - beam.width / 2;
			ctx.save();
			ctx.fillStyle = active ? 'rgba(255, 80, 115, .47)' : 'rgba(255, 190, 72, .13)';
			ctx.strokeStyle = active ? '#ff9da7' : '#ffd17b';
			ctx.lineWidth = active ? 3 : 2;
			if(beam.vertical) {
				ctx.fillRect(start, 0, beam.width, HEIGHT);
				ctx.beginPath(); ctx.moveTo(start, 0); ctx.lineTo(start, HEIGHT);
				ctx.moveTo(start + beam.width, 0); ctx.lineTo(start + beam.width, HEIGHT); ctx.stroke();
			} else {
				ctx.fillRect(0, start, WIDTH, beam.width);
				ctx.beginPath(); ctx.moveTo(0, start); ctx.lineTo(WIDTH, start);
				ctx.moveTo(0, start + beam.width); ctx.lineTo(WIDTH, start + beam.width); ctx.stroke();
			}
			ctx.restore();
		}

		drawPulse(ctx, pulse) {
			const active = pulse.age >= pulse.warning;
			const radius = active ? 30 + (pulse.age - pulse.warning) / pulse.duration * 155 : 30;
			ctx.save();
			ctx.strokeStyle = active ? '#ff5fb2' : '#ffd17b';
			ctx.lineWidth = active ? 16 : 3;
			ctx.globalAlpha = active ? .68 : this.reducedMotion ? .55 : .48 + .2 * Math.sin(pulse.age * 8);
			ctx.beginPath(); ctx.arc(pulse.x, pulse.y, radius, 0, TAU); ctx.stroke();
			if(!active) {
				ctx.beginPath(); ctx.arc(pulse.x, pulse.y, 43, 0, TAU); ctx.stroke();
			}
			ctx.restore();
		}

		drawPlayer(ctx, clock) {
			const player = this.player;
			const speed = Math.hypot(player.vx, player.vy);
			ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
			if(speed > 35) {
				ctx.shadowColor = this.dashTimer > 0 ? '#ffda8a' : '#36efff'; ctx.shadowBlur = 20;
				ctx.fillStyle = this.dashTimer > 0 ? 'rgba(255, 204, 118, .55)' : `rgba(55, 231, 248, ${.18 + .25 * Math.sin(clock * 8) ** 2})`;
				ctx.beginPath(); ctx.moveTo(-17, -8); ctx.lineTo(-31 - speed / 40, 0);
				ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
			}
			ctx.shadowColor = this.dashTimer > 0 ? '#ffc57e' : '#31eafb'; ctx.shadowBlur = 27;
			ctx.strokeStyle = '#b1ffff'; ctx.fillStyle = this.dashTimer > 0 ? '#ffe7a9' : this.hitTimer > 0 ? '#a2dfe7' : '#38dff2';
			ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(-14, -13);
			ctx.lineTo(-8, 0); ctx.lineTo(-14, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
			ctx.shadowBlur = 0; ctx.fillStyle = '#05273a'; ctx.beginPath(); ctx.arc(2, 0, 4, 0, TAU); ctx.fill(); ctx.restore();
			if(this.hitTimer > 0 || this.dashTimer > 0) {
				ctx.strokeStyle = this.dashTimer > 0 ? 'rgba(255, 217, 136, .85)' : 'rgba(128, 249, 254, .65)';
				ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 29, 0, TAU); ctx.stroke();
			}
		}

		drawEffects(ctx) {
			for(const ring of this.rings) {
				ctx.strokeStyle = ring.color; ctx.globalAlpha = ring.life / ring.duration; ctx.lineWidth = 2;
				ctx.beginPath(); ctx.arc(ring.x, ring.y, 10 + (1 - ring.life / ring.duration) * 80, 0, TAU); ctx.stroke();
			}
			for(const particle of this.particles) {
				ctx.globalAlpha = clamp(particle.life / particle.duration, 0, 1);
				ctx.fillStyle = particle.color; ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
			}
			ctx.globalAlpha = 1;
		}

		destroy() {
			if(this.destroyed) return;
			this.destroyed = true;
			window.cancelAnimationFrame(this.frameId);
			this.startButton.removeEventListener('click', this.onStartClick);
			this.pauseButton.removeEventListener('click', this.onPauseClick);
			this.fullscreenButton.removeEventListener('click', this.onFullscreenClick);
			this.soundButton.removeEventListener('click', this.onSoundClick);
			this.restartButton.removeEventListener('click', this.onRestartClick);
			this.dashButton.removeEventListener('click', this.onDashClick);
			this.saveButton.removeEventListener('click', this.onSaveClick);
			this.loadButton.removeEventListener('click', this.onLoadClick);
			this.deleteButton.removeEventListener('click', this.onDeleteClick);
			this.canvas.removeEventListener('pointerdown', this.onPointerDown);
			this.canvas.removeEventListener('pointermove', this.onPointerMove);
			this.canvas.removeEventListener('pointerup', this.onPointerUp);
			this.canvas.removeEventListener('pointercancel', this.onPointerUp);
			document.removeEventListener('keydown', this.onKeyDown);
			document.removeEventListener('keyup', this.onKeyUp);
			document.removeEventListener('visibilitychange', this.onVisibilityChange);
			document.removeEventListener('fullscreenchange', this.onFullscreenChange);
			this.motionQuery.removeEventListener('change', this.onMotionChange);
			this.audioEnabled = false;
			if(this.audioContext) void this.audioContext.close().catch(() => {});
			if(document.fullscreenElement === this.root) {
				void document.exitFullscreen().catch(() => {});
			}
			window.removeEventListener('blur', this.onWindowBlur);
		}
	}

	window.NeonDrift = {
		mount(root, labels, options) {
			return new NeonDriftGame(root, labels, options);
		}
	};
})(window, document);
