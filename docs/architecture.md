# Architecture

This project is a collection of Herdr mods and assets connected by one layout. The visual modules read shared Herdr state; assets are local, and runtime code does not fetch network resources.

## Layout

`layouts/star-wars.json` composes the workspace:

- **Sidebar:** `star-wars-systems` for spaces and `star-wars-agents` for agents.
- **Main area:** `star-wars-tabs` (Herdr's tabs plus a Bomb Run button), and Herdr's pane, files, and changes modules. A hidden side-panel stack holds Files, Changes and the Bomb Run game; the top-bar buttons pick one, with no strip of its own. Files remains the default.
- **Footer:** `star-wars-status`.
- **Notifications:** `star-wars-alerts`.
- **Appearance:** `light-side` and `dark-side` theme files.

`star-wars-arena` opens as an optional overlay rather than a permanent layout panel.

## Modules

### `star-wars-systems`

Shows spaces, stable ship emblems, machine groups, and Git status. It reads Git branch and upstream information with read-only commands, watches local repositories for changes, and refreshes remote machine information through Herdr. The explicit **Connect** action is the only path that runs `hc machine rm/add`.

The module also handles Light Side/Dark Side commands and updates the cockpit background when the active space or appearance changes. Background changes are applied only while the Star Wars layout is active.

### `star-wars-agents`

Renders agents grouped by space or priority. It supports pinning, sub-agent trees, foldable groups, status indicators, and character assignments. Characters are unique across agents; Stormtroopers fill the roster after every other character is assigned. `hc read` is used to infer model and context details from terminal output; unavailable values are omitted.

Agent characters are stored in shared state under `star-wars-agents.cast`. If that key is absent, existing assignments are copied from the older `fellowship.cast` key; it is left intact for layouts that still use it. Ship assignments are read from `star-wars.ships`. `battle.js` renders status-aware miniature training fronts, native character motion, paginated squads and attributed conversations. Per-space pause, page and dialogue state lives in the agent view, never in the agent terminals. Narrow sidebars show four fighters per page; wide sidebars show eight. The slow narrative timer advances only visible, unpaused scenes. Expanding passes the visible squad and source space ID to the Arena. `agent-stats.js` parses terminal output, and `casting.js` enforces unique assignments.

### `star-wars-alerts`

Renders in-app alerts and mirrors them to system notifications where supported. It uses `terminal-notifier` on macOS, `notify-send` on Linux, and the in-app view on other platforms. Missing or failing helpers do not launch another application: the in-app toast remains the fallback. There is deliberately no AppleScript fallback, since its banners can open Script Editor. macOS banner clicks target Herdr through `-activate dev.herdr.app`. Agent notifications can use the character assigned in `star-wars-agents.cast`.

### `star-wars-status`

Shows the active machine, branch, and counts by agent status. It also places a badge on the app icon while agents need attention.

### `star-wars-arena`

Displays a self-contained training simulator with up to four fronts. `choreography.js` holds pure character profiles, four presets, roster validation, pairing and multi-line conversations. `scene.js` renders character-specific native loops, melee contact flashes, blaster bursts and Force/droid effects. `main.js` owns the custom selection, focused comms channel, dialogue cursor, speed, pause and reduced-motion controls. A roster may contain up to eight fighters; only Stormtroopers may repeat. Support characters remain unarmed, and an unpaired fighter stays on standby.

Standalone scenes use the active space's ship; expanded mini battles keep their source space's ship. Selection and playback settings are local to the overlay and reset on reopening. Movement never uses a JS frame timer. A slow timer advances dialogue, skipping paused simulations and hidden windows; reduced motion removes native loops without disabling dialogue. Timers belong to the view and stop when it closes. The Arena only reads Herdr state and closes its own overlay; it never creates, moves or commands real agents.

### `star-wars-tabs`

A copy of Herdr's built-in `tabs` mod with one change: the panel buttons list is Files/Changes (from shared `workspace.panels`) plus `bomb-run`, so Bomb Run opens from the top bar exactly like Files and Changes, and is remembered per space the same way. Its `toggle-bomb-run` command (palette: **Star Wars: Toggle Bomb Run**) flips shared `star-wars.bomb-run`; off removes the button and hides an open Bomb Run panel.

### `star-wars-bomb-run`

A pixel-art game panel with theme-native chrome. `game.js` owns collisions, destructible coolant cells, thermal charges, roaming enemies, scoring, level generation and pilot XP. Each deck uses a rotating unique roster that excludes the pilot; only Stormtroopers may repeat. `decks.js` supplies eight handcrafted collision maps and zone identities. Success carries XP/score/time and the selected payload to a fresh zone, while clearing hazards. There is no loot inventory or collectible/drop path. Enemy count/speed are bounded at eight/420 ms. Six upgrades are derived from both XP and the current deck milestone, not mutable buff stacks. Reach is capped at five tiles, charge capacity at three and movement at 120 ms/tile. Nova and Echo are exclusive selected payloads, cycled with E, so wide lanes cannot also echo. Retries retain XP/deck-derived unlocks and reset the payload to Standard. Planted charges snapshot all payload flags. Blast geometry is computed against the intact board before applying damage; queued echoes have separate timers and warning beacons, and prevent an early deck clear. `scene.js` paints a dedicated deck, layered props, plasma, three-pose walking atlases and compact lower state ribbons. `ui.js` owns theme-native chrome: a 36 px icon toolbar, 26 px inline HUD, 40 px pilot strip and 30 px command rail. HUD/deck/pilot form one measured frame, with an explicit 66 px HUD/pilot budget when fitting tiles. Pixel icons are native integer rectangles, not emoji or a dependency. `tools/build-bomb-run-art.py` reads the JSON-compatible data export in `decks.js` and builds eight different backgrounds, zone-specific machinery, six milestone icons, effects and directional atlases from integer pixel geometry and the original palettes, without network/font dependencies.

`main.js` reads live pilot assignments and owns Start/pause/restart, held-key input, focus and view-local options/control visibility. Detailed milestones, restart and optional directional controls are tucked into a height-bounded, scrollable options drawer; Thinking only remains directly accessible through the toolbar link icon. Opening options pauses an active game and clears held input. Escape dismisses options first; Resume dismisses options before playing. Closing options alone never resumes. A 40 ms simulation timer supports exact 160/120 ms movement cadence; stable game ticks advance state; stable actor IDs and native linear transitions interpolate positions. Walking changes foot/arm poses instead of bouncing the body. Sprint uses the same per-move duration in input throttling, pose selection and native interpolation; Q line planting respects free charge slots and the first obstacle. The viewport converts measured window pixels using Herdr's zoom and chooses an even tile size. Dock props identify the parent panel and stack, so hidden panels, inactive tabs, hidden windows and lost focus pause without ticking the simulation. UI commands only open a larger overlay or hide the panel; no terminal or agent commands are sent.

Per-agent `{xp, level}` records live under the mod-local `pilot-progress` storage key. Milestones are derived from those values; payload selection and queued echoes are not persisted. XP and unlocked decks survive defeat, retries, pilot switches and view recreation. Saves happen only when progress advances, merge existing records with non-decreasing values, and are disabled during Herdr checks. The current pilot's character is fixed during play, so live cast changes cannot introduce duplicates into an existing deck.

The `thinking-only` preference defaults to Off. When On, every simulation tick and gameplay entry point checks `agents().find(address === selectedAddress)?.status === "working"`; no other working agent is accepted as a substitute. The scene renders a non-interactive waiting curtain and freezes native pulses/poses as well. This soft gate clears held input but does not mutate the mission or override manual/focus pauses, so returning to working can resume safely. Preference persistence is separate from progress, with no reads/writes during checks and no terminal commands.

## Shared data and assets

| Key or path | Use |
| --- | --- |
| `star-wars-agents.cast` | Stable agent-to-character assignments. |
| `star-wars.ships` | Stable space-to-ship assignments. |
| `space.colors` | Stable space accent colors. |
| `backgrounds/ships/{light-side,dark-side}/` | Generated cockpit backgrounds. |
| `mods/star-wars-agents/sprites/star-wars/` | Character and weapon artwork used by the board, Arena and Bomb Run. |
| `mods/star-wars-bomb-run/art/` | Generated pixel deck, props, bitmap labels and four-direction walking atlases. |

Theme JSON files are the source of semantic interface colors and cockpit colors. Character and weapon art keeps its own palette.

## Verification

Run the theme and behavior regression tests from the project root:

```sh
node --test tools/*.test.mjs
```

Validate a mod with Herdr's checker, for example:

```sh
herdr-app check mods/star-wars-agents
herdr-app check mods/star-wars-bomb-run
herdr-app check mods/star-wars-tabs
```
