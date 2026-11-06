# Neon Drift

Neon Drift is an independent, level-based BASE3 arcade plugin focused on reaction time, movement skill and optional personal progression. It uses the standard `IPlugin`, classmap-discovered `IDisplay` and `IOutput`, MVC templates, language bricks, asset resolution, `ISettingsStore` and the runtime's session/user services. PulseCore and BASE3 framework/foundation contracts are unchanged.

## Complete release: levels, challenges and player profiles (0.3.0)

The game is playable without a profile or any database. Its challenge grows along five recurring sector types:

| Sector | Level | Main challenge |
| --- | --- | --- |
| Shard Field | 1, 6, 11, ... | Learn positioning against incoming shards. Later cycles mix in fast darts. |
| Impulse Zone | 2, 7, 12, ... | Fast incoming darts; later cycles introduce grouped volleys. |
| Beam Corridor | 3, 8, 13, ... | Avoid clearly telegraphed line-beam strikes while collecting cores. |
| Hunter Swarm | 4, 9, 14, ... | Dodge tracking hunters, volleys and occasional line beams. |
| Pulse Storm | 5, 10, 15, ... | Survive expanding shockwaves, line beams and moving hunters. |

Each new level requires a collection goal and at least 12 seconds of survival. The number of cores, hazard speed, spawn rate and mixed-threat frequency grow as the level increases, subject to limits on live hazards. Every level grants a score bonus, plus an additional bonus if the player was not hit. Every third completed level replenishes one unit of energy, up to four. Between levels, the game pauses until the player activates **Next Level**; there is no time pressure in that menu.

Collecting cores within the combo window multiplies the score (up to x5). **Dash** (Shift, J or the on-screen button) grants a brief movement burst and collision protection, and awards points when it destroys an incoming physical hazard. Dash has a visible cooldown. There are no purchases, social pressure, daily-login rewards or artificial wait timers.

### Controls

- WASD or arrow keys when the Canvas has focus: move the ship with inertia.
- Hold and drag on the Canvas: steer using mouse, pen or touch.
- Shift / J: Dash, with cooldown. The on-screen Dash button restores Canvas focus so keyboard movement continues immediately.
- Space: pause/resume while the Canvas has focus. Escape: pause.
- Buttons for Start, Pause, Restart and Next Level remain keyboard accessible through native button behavior.
- **Fullscreen**, top right: expands the entire game, including HUD, controls and profile bar. Click again or use Escape to leave native browser fullscreen. This control is disabled when the embedding host or browser forbids fullscreen.
- **Sound effects**, top right: optional synthesized Web Audio cues for collecting, dashing, hits, level completion and game over. Sound is OFF by default and never uses remote assets; the switch is reset when the game widget is closed.
- Keyboard control requires Canvas focus; Start/Continue/Restart and the Dash button restore it automatically. Press Tab to move to the surrounding controls.

The game pauses when the window loses focus or is hidden. **After Game Over**, its last impact shake, particles and decorative animations settle and the entire Canvas drawing stops within 0.8 seconds. The frozen final frame remains visible until restart, without an endlessly moving background. Its event listeners and animation loop are removed when an AJAX tab removes the widget. It does not use third-party JavaScript or connect to an external game service.

## Optional personal progression via BASE3 ISettingsStore

The browser-only game is available without login to the game profile service. Saving is opt-in: the player clicks **Save Checkpoint** to create a personal record. Once saved, future completed levels and end-of-run best scores are updated automatically. The same profile can be resumed from a **Load Save** button on a later visit. Checkpoints resume from the beginning of the saved level, not from a specific mid-level ship position.

The plugin does not introduce a database table, migration, new credentials or a parallel storage implementation. It uses the active `Base3\Settings\Api\ISettingsStore` under the group `neondrift_player_profiles`. The record name is `user_` followed by the SHA-256 hash of the authenticated BASE3 user ID. Hashing is pseudonymization, **not anonymization**. The configured settings backend decides whether records are stored in a database or another storage medium. A non-persistent or missing backend means saving will not be available; game play continues without it.

Two existing framework services provide security boundaries: `IUsermanager` determines the active account and `ISession` supplies a session-bound anti-CSRF token. `IRequest` parses JSON and identifies the request method. The endpoint supports JSON GET for the current profile and token; JSON POST with a valid token for `save`, `advance`, `record` and `delete`. The URL is generated using `ILinkTargetService`, so the profile output can use the host's own BASE3 routing. Clients cannot choose a record key. A regular GET or a client without an authenticated session cannot mutate records. Stored scores come from the browser and must **not** be treated as verified anti-cheat leaderboard entries.

- **Save Checkpoint** explicitly replaces the previous checkpoint, even if it is at a lower level.
- **Automatic level advances** only replace an existing checkpoint at the same or a higher level, preventing an earlier replay from wiping deeper progression.
- **End-of-run records** update personal bests without changing the checkpoint.
- **Delete Data** removes the saved checkpoint and personal best from the active SettingsStore backend. While deletion is pending, automatic saves and profile actions are blocked; unsuccessful removals are reported, not silently treated as success. The host operator remains responsible for external backups and logs.

Session-based authenticated access and a **persisting** SettingsStore must already be configured by the host. Nothing is persisted until an account explicitly saves a checkpoint. Profile requests are same-origin and use no-store caching. No global public leaderboard or tracking is included.

## BASE3 integration

The display is `NeonDrift\Display\NeonDriftDisplay`, technical name `neondriftdisplay`. Its companion profile endpoint is `NeonDrift\Output\NeonDriftProfileOutput`, technical name `neondriftprofileoutput`. Both are discovered through `IClassMap`. The game assets use `IAssetResolver` logical paths `plugin/NeonDrift/assets/...`. The PHP display and template have parallel paths in `src/Display` and `tpl/Display`. The profile service is registered in the plugin's `init()` using constructor-injected `ISettingsStore`.

`NeondriftSettingsTab` is discovered through the existing `ISettingsTab` classmap slot under the shared ClientStack Games tab. The tab and its feature permission are owned by NeonDrift. The host retains responsibility for permission decisions; the gameplay and optional profile endpoint keep their existing behavior.

Install from the directory containing `Base3IliasLab` and the other BASE3 plugins:

```sh
unzip -o neondrift-step3.zip
```

The ZIP contains the **complete NeonDrift 0.3.0 plugin**, with complete source files and tests, and overlays the previously working step-2 installation. The already installed `Base3IliasLab` Games tab integration is intentionally **not overwritten** because it needs no changes. Regenerate the BASE3 classmap if needed. A hard reload may be necessary if the browser has cached old game assets.

## Tests and coverage

All PHP unit tests live in `test/` and use APIs common to **PHPUnit 11.5 and 12.5**. There are no PHPUnit-version switches, alternative implementations, or inline global test classes. The suite covers plugin factory registration and its lazy resolution, feature permissions and native authority delegation, MVC display composition and actual template escaping, both language catalogs, profile validation and limits, persistence and deletion failures, authenticated account isolation, HTTP method/content-type checks, token reuse and creation, CSRF failure modes and read/write access.

Execute the tests using the already installed host PHPUnit runner. For example, from an ILIAS root:

```sh
vendor/composer/vendor/bin/phpunit components/Base3/NeonDrift/test
```

For a PHP coverage report, enable Xdebug or PCOV in the host runtime and include the module's `src/` tree as source. With Xdebug and the normal ILIAS PHPUnit binary:

```sh
XDEBUG_MODE=coverage vendor/composer/vendor/bin/phpunit \
  --coverage-filter components/Base3/NeonDrift/src \
  --coverage-text components/Base3/NeonDrift/test
```

Run this same test suite with the installations of PHPUnit 11.5 and PHPUnit 12.5 used by the target projects. The PHPUnit binary and PHP coverage driver are provided by the host; this module intentionally does not bundle another testing framework or bootstrap.

The original Node test also executes the production `assets/js/neondrift.js` script with a simulated browser, input system, Canvas, Web Audio and profile API. From an ILIAS root with Node.js 22:

```sh
node --test --experimental-test-coverage components/Base3/NeonDrift/test/neondrift.test.cjs
```

Measured with Node.js 22: **100% production JavaScript line coverage, 100% branch coverage and 100% function coverage**. The Node test file itself is excluded from that production-code claim. The PHP test sources have passed syntax checks and independent runtime smoke checks, but both PHPUnit-version executions and the exact PHP coverage percentage must be verified in the actual host with the coverage driver installed. Do not treat a passing Node coverage result as PHP coverage proof.

The integration with real ILIAS authorization, the configured SettingsStore backend, the host's CSRF/session implementation and live browser accessibility remains host-side acceptance testing, separate from unit coverage.

## Privacy and accessibility

The storage is an **optional** account-related processing operation. See [PRIVACY.md](PRIVACY.md) for record fields, purposes, pseudonymous identifiers, operations, deletion, recipient/retention dependencies and outstanding compliance questions. No cookies, localStorage or IndexedDB are used by the game itself, but the host session service may rely on a session cookie.

The game provides visible keyboard focus, 44px minimum touch targets for header controls, a textual level and score HUD, a semantic progressbar with synchronized ARIA values, screen-reader status announcements, keyboard and pointer input, responsive mobile/fullscreen layouts, forced-color UI styles and live `prefers-reduced-motion` support. Sound is disabled by default and locally synthesized only after user action. The spatial Canvas action mechanics do not provide equivalent non-visual gameplay, so **full WCAG 2.2 AA / EN 301 549 compliance cannot be claimed** without further accessibility design. Site-specific authorization, CSP/iframe fullscreen permissions, 400% zoom, assistive technology and real ILIAS AJAX behavior still require operator validation.


## Games settings

`NeondriftSettingsTab` contributes `neondriftdisplay` under ClientStack Games. The feature controls settings-navigation visibility, not the public browser game. Anonymous play remains possible; the optional authenticated profile output retains its own session/CSRF checks.
