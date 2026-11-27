# LoneStar — Implementation Plan & Progress

## Phase 1: Project Setup & Clean Architecture Core (`lonestar-core`)
- [x] Initialize `tasks/todo.md` and `tasks/lessons.md`
- [x] Create Cargo workspace `Cargo.toml` and `crates/lonestar-core/Cargo.toml`
- [x] Implement Domain layer (`entities.rs`, `errors.rs`, `validator.rs`) with full iStar 2.0 metamodel rules
- [x] Implement Application layer (`ports.rs`, `service.rs`) with CRUD, connection validation, auto-layout, and stats
- [x] Implement Infrastructure layer (`pistar.rs`, `repository.rs`, `templates.rs`) for piStar 2.0 JSON interop & canonical templates
- [x] Add comprehensive unit tests in `lonestar-core` and verify `cargo test -p lonestar-core`

## Phase 2: Tauri v2 Desktop Host (`src-tauri`)
- [x] Create `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`
- [x] Generate valid RGBA app icons (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`, `icon.icns`)
- [x] Implement `src-tauri/src/commands.rs`, `lib.rs`, `main.rs` delegating to `lonestar-core`
- [x] Verify `cargo check --workspace` & `cargo test --workspace`

## Phase 3: Svelte 5 Frontend (Clean Architecture & Zero-Bluish Warm Themes)
- [x] Configure `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- [x] Implement `src/app.css` with Warm Dark (charcoal/stone) & Warm Light (alabaster/ivory) themes (`R >= G >= B` on backgrounds)
- [x] Implement Frontend Domain (`src/domain/types.ts`, `src/domain/istarRules.ts`)
- [x] Implement Frontend Application Stores (`src/application/modelStore.svelte.ts`, `src/application/uiStore.svelte.ts`) with Svelte 5 Runes & Undo/Redo
- [x] Implement Frontend Infrastructure (`backendAdapter.ts`, `pistarCodec.ts`, `exportService.ts` for Hi-Res PNG 2x/3x/4x, SVG, JSON)
- [x] Implement Presentation Layer (`Toolbar.svelte`, `Palette.svelte`, `Canvas.svelte`, `ActorNode.svelte`, `ElementNode.svelte`, `LinkEdge.svelte`, `DependencyNode.svelte`, `Inspector.svelte`, `DependencyModal.svelte`, `App.svelte`)
- [x] Add Vitest unit tests covering iStar 2.0 rules, piStar round-trip, export utilities, and non-bluish CSS invariants

## Phase 4: GitHub Presentation Page & Multi-OS CI/CD
- [x] Build GitHub Pages site (`docs/index.html`, `docs/styles.css`, `docs/app.js`) with OS auto-detection, multi-OS download hub, interactive iStar 2.0 showcase, and warm dark/light toggle
- [x] Build CI workflow (`.github/workflows/ci.yml`), Multi-OS Tauri Release workflow (`.github/workflows/release.yml`), and GitHub Pages workflow (`.github/workflows/pages.yml`)

## Phase 5: End-to-End Verification & Review
- [x] `cargo test --workspace` passes (6/6 tests)
- [x] `cargo clippy --workspace --all-targets -- -D warnings` passes with zero warnings
- [x] `npm test` passes (5/5 Vitest tests)
- [x] Verify `npm run check && npm run build` succeeds with zero TypeScript or Svelte warnings and bundles cleanly into `docs/demo/`
- [x] Document engineering review in `tasks/todo.md`

## Phase 6: Cowboy Panda Icon, Enlarged Header, Settings & Updater, piStar `.txt` Support
- [x] Generate Cowboy Panda app icons (`src-tauri/icons/*`), favicons, and `CowboyPandaIcon.svelte`
- [x] Enlarge top Toolbar header, brand title/logo, and Template / Open Model controls
- [x] Implement `.txt` diagram import & export across Rust `lonestar-core` and TypeScript `pistarCodec`
- [x] Integrate Tauri v2 updater, process & opener plugins (`tauri-plugin-updater`, `latest.json` CI release, startup auto-check)
- [x] Build `SettingsModal.svelte` (version badge, check updates button, GitHub Page & Releases links) and update `docs/` site

## Phase 7: In-App Local & Cloud AI Agent (Tauri Desktop Only)
- [x] Implement `crates/lonestar-core/src/application/agent.rs` (declarative `AgentOperation` batch executor, name/ID resolution, metamodel auto-repair, compact semantic context summarizer, iStar 2.0 system prompt & tool schema, fenced JSON fallback extractor)
- [x] Add `reqwest` OpenAI-compatible HTTP client & agent orchestrator (`src-tauri/src/agent.rs`) with LM Studio / Ollama / Cloud presets, tool-call + HTTP 400 non-tool fallback, and 2-round self-correction loop; expose Tauri commands `agent_list_models` and `agent_run_turn`
- [x] Implement `src/infrastructure/backendAdapter.ts` IPC methods, `uiStore.agentPanelOpen`, and `src/application/agentStore.svelte.ts` (persisted presets/config, atomic Undo/Redo mutations)
- [x] Implement Desktop-only UI (`AgentPanel.svelte`, Toolbar `✦ AI Agent` toggle, SettingsModal `Local & Cloud AI Agent` section, `App.svelte` workspace wiring) strictly guarded by `isTauriRuntime()` and warm theme `R >= G >= B`
- [x] Add Rust & Vitest unit/integration tests covering batch operations, metamodel auto-repair, fenced block extraction, and agentStore preset defaults
- [x] Run full verification suite (`cargo fmt`, `cargo clippy`, `cargo test`, `npm run check`, `npm test`, `npm run build`) and document final review

## Phase 8: Version Sync, Toolbar Cleanup, SVG Export Fix & Docs AI Section
- [x] Remove version badge from top Toolbar (`src/presentation/Toolbar.svelte`), keeping it exclusively in `SettingsModal.svelte`
- [x] Inject `package.json` version via Vite `define` (`__APP_VERSION__`), sync Web Studio `appVersion` from GitHub Releases API in `updateStore.svelte.ts`, and auto-sync `v*` Git tag into `package.json`, `tauri.conf.json`, and `Cargo.toml` inside `.github/workflows/release.yml`
- [x] Fix standalone Vector SVG export (`src/infrastructure/exportService.ts`, `LinkEdge.svelte`, `DependencyNode.svelte`) by stripping editor hit-targets/comments and resolving `var(--...)` + `rgba(...)` paints to SVG 1.1 hex + opacity attributes
- [x] Document Desktop-only Local & Cloud AI Agent in `docs/index.html`
- [x] Add Vitest unit tests and verify `npm run check`, `npm test`, `npm run build`, `cargo test --workspace`, and Inkscape SVG rendering

## Phase 9: Release Pipeline Updater Signing Fix
- [x] Generate Tauri updater minisign keypair, store `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions repository secrets, and update `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`
- [x] Add `"app"` to `bundle.targets` in `src-tauri/tauri.conf.json` so macOS also produces signed updater artifacts (`.app.tar.gz`)
- [x] Make `.github/workflows/release.yml` resilient when `TAURI_SIGNING_PRIVATE_KEY` is absent/empty by disabling `bundle.createUpdaterArtifacts` and setting `includeUpdaterJson` dynamically
- [x] Verify `gh secret list`, `npm run check`, `npm test`, `npm run build`, and `cargo test --workspace`
- [x] Update `README.md` (Desktop AI Agent, SVG 1.1 export details, updated Clean Architecture diagram & repo structure, release version sync & updater signing fallback) and verify `npm test`

## Phase 10: macOS Ad-Hoc Bundle Signing Fix
- [x] Set `bundle.macOS.signingIdentity` to `"-"` in `src-tauri/tauri.conf.json` so `tauri build` seals `Info.plist` and `Resources` into `Contents/_CodeSignature`
- [x] Document `bundle.macOS.signingIdentity: "-"` in `README.md` and capture Lesson #5 in `tasks/lessons.md`
- [x] Verify `codesign --verify --deep --strict` on the rebuilt `LoneStar.app` vs `v1.6.2` and assert `signingIdentity` in `tests/lonestar.test.ts`
- [x] Run verification suite (`npm run check`, `npm test`, `npm run build`, `cargo test --workspace`)

## Phase 11: Enlarge Theme, AI Agent & Settings Icons
- [x] Enlarge theme (`☾`/`☀`), AI Agent (`✦`), and Settings (`⚙`) icon spans in `src/presentation/Toolbar.svelte`
- [x] Enlarge AI Agent (`✦`) and Settings (`⚙`) icons in `src/presentation/AgentPanel.svelte`
- [x] Enlarge theme switch (`☾`/`☀`) icon in `src/presentation/SettingsModal.svelte`
- [x] Add Vitest check in `tests/lonestar.test.ts` and verify `npm run check`, `npm test`, `npm run build`

## Phase 12: Replace Unicode AI Agent & Settings Icons with Symmetric Centered SVGs
- [x] Replace Unicode `✦` and `⚙` in `src/presentation/Toolbar.svelte` with centered 18×18 Gemma faceted-star and gear SVGs (`tb-icon-svg`) + `text-box: trim-both cap alphabetic` label alignment
- [x] Replace Unicode `✦` and `⚙` in `src/presentation/AgentPanel.svelte` with centered 16×16 Gemma faceted-star and gear SVGs (`agent-icon-svg`)
- [x] Update Vitest assertions in `tests/lonestar.test.ts`, verify `npm run check`, `npm test`, `npm run build`, and rebuild macOS desktop bundle (`target/release/bundle/macos/LoneStar.app`)

## Phase 13: Offline Recent Projects Menu (Last 10 Diagrams)
- [x] Enhance `read_file_from_disk` in `src-tauri/src/commands.rs` with explicit `FILE_NOT_FOUND` detection and add Rust unit tests
- [x] Create `src/application/recentProjectsStore.svelte.ts` (capped at 10 recent diagram files, persisted to `localStorage`, deduplicated by path, with filename extraction and missing-file detection helpers)
- [x] Update `src/infrastructure/backendAdapter.ts` to return saved/opened file paths and provide `readJsonFileFromPath` (Tauri Desktop only)
- [x] Add offline-only (`isTauriRuntime()`) Recent Projects dropdown menu & missing-file cleanup handling to `src/presentation/Toolbar.svelte`
- [x] Add Vitest unit tests in `tests/lonestar.test.ts` and verify `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `npm run check`, `npm test`, and `npm run build`

## Phase 14: GUI Zoom Shortcuts (Ctrl/Cmd + / - / 0)
- [x] Grant `core:webview:allow-set-webview-zoom` permission in `src-tauri/capabilities/default.json` without enabling `zoomHotkeysEnabled`
- [x] Add `setWebviewZoom` method on `backendAdapter` in `src/infrastructure/backendAdapter.ts` using `@tauri-apps/api/webview`
- [x] Extend `src/application/uiStore.svelte.ts` with `uiZoom` state, persistence, zoom controls, and pure shortcut/clamping/platform helpers
- [x] Wire global capture-phase keyboard listener and startup zoom restoration in `src/App.svelte` (desktop Tauri runtime only)
- [x] Guard modified single-key shortcuts in `src/presentation/Canvas.svelte` (`ctrlKey || metaKey || altKey`)
- [x] Add Desktop-only Interface Scale controls in `src/presentation/SettingsModal.svelte`
- [x] Add unit & config invariant tests in `tests/lonestar.test.ts` and run full verification (`npm run check`, `npm test`, `npm run build`, `cargo check`, `cargo test`, `cargo clippy`, `cargo fmt`)

## Phase 15: Full iStar 2.0 Syntax & Metamodel Fidelity Upgrade
- [x] Add strict `MetamodelError` variants and validator checks (`MixedRefinementOnParent`, `ContributionAndQualificationConflict`, `DuplicateContributionLink`, `ContributionCycle`, `DependerElementCannotBeRefinedOrContributed`, orphan/mixed `Error` upgrades, single-child AND `Warning`) in `crates/lonestar-core/src/domain/errors.rs` & `validator.rs`
- [x] Fix AI Agent `Goal -> Task` auto-flip bug, Quality-originating `Qualification` inference, OR-refinement matching, and system prompt rules in `crates/lonestar-core/src/application/agent.rs`
- [x] Align canonical `travel` and `telemedicine` templates across `crates/lonestar-core/src/infrastructure/templates.rs` and `src/infrastructure/pistarCodec.ts` to validate with 0 errors and 0 warnings
- [x] Synchronize TypeScript rules & store parity (`validateProposedDependencyClient`, strict `validateProposedLinkClient`/`validateModelClient`/`resolveDragConnection`, atomic refinement switching in `modelStore.svelte.ts`)
- [x] Fix concrete syntax in `ActorNode.svelte` & `Palette.svelte` (`Role` downward smile arc) and `LinkEdge.svelte` (solid filled `NeededBy` circle, label-free refinement edges, double-click AND/OR toggle)
- [x] Upgrade `DependencyModal.svelte` and `Inspector.svelte` (validated `Depender Element`/`Dependee Element` anchor selectors + Custom Properties editor for Actors, Elements, and Dependencies)
- [x] Add Rust (`istar_metamodel_tests.rs`) and Vitest (`lonestar.test.ts`) coverage and update `tasks/lessons.md`

## Phase 16: Fix GitHub Pages Deployment Artifact Race Condition
- [x] Split `.github/workflows/pages.yml` into `build` and `deploy` (`needs: build`) jobs, set `cancel-in-progress: false`, and upgrade to Node 24-native actions (`checkout@v7`, `setup-node@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`)
- [x] Add regression test in `tests/lonestar.test.ts`, capture Lesson #6 in `tasks/lessons.md`, and verify YAML syntax + `npm run check` + `npm test`

---

## Final Engineering Review
- **Clean Architecture Adherence**:
  - `crates/lonestar-core/src/domain/` defines pure iStar 2.0 domain entities (`DiagramModel`, `Actor`, `IntentionalElement`, `Link`, `Dependency`) and formal metamodel constraint enforcement (`validator.rs`) without any UI, Tauri, or filesystem dependencies.
  - `crates/lonestar-core/src/application/` encapsulates use cases (`ModelService`) and outbound ports (`ModelRepository`, `PiStarInteropPort`).
  - `crates/lonestar-core/src/infrastructure/` implements the bidirectional piStar 2.0 JSON/TXT adapter, file persistence repository, and built-in canonical templates (`travel`, `telemedicine`).
  - `src-tauri/` adapts Tauri v2 IPC commands, native save/open dialogs, auto-updater (`tauri-plugin-updater`), process relaunch (`tauri-plugin-process`), and URL opener (`tauri-plugin-opener`) to `lonestar-core`.
  - `src/` mirrors Clean Architecture in TypeScript + Svelte 5 Runes (`$state`, `$derived`) with seamless Tauri-desktop / browser-demo fallback via `backendAdapter.ts`.
- **iStar 2.0 Fidelity & Usability**:
  - Supports all actor variants (`Actor`, `Agent`, `Role` with official top bar / bottom smile crescent markers and expandable/collapsible SR boundaries), all intentional elements (`Goal`, `Quality`, `Task`, `Resource`), all internal links (`AndRefinement` T-bar, `OrRefinement` triangle, `NeededBy` filled circle, `Contribution` `make`/`help`/`hurt`/`break`, `Qualification` dashed), actor links (`IsA`, `ParticipatesIn`), and `Dependency` (`D` semicircle markers).
  - Enforces full iStar 2.0 integrity rules in both Rust and TypeScript: non-mixed AND/OR refinements per parent, single-child AND warning, `Contribution`/`Qualification` mutual exclusion, unique `Contribution` links (no self-contribution; Phase 16 removed the stricter-than-spec Quality contribution-cycle rule), `dependerElement` refinement/contribution prohibition, and error-level boundary containment.
  - Pointer-based drag-and-drop from the Palette works uniformly across Linux WebKitGTK, macOS, Windows, and web browsers, with automatic boundary containment and Smart Auto-Connect drag linking.
  - Supports opening, dropping, and exporting `.json` and `.txt` (piStar 2.0 JSON-in-`.txt` and structured iStar 2.0 text notation).
- **Theme Constraint Verification**:
  - Both `src/app.css` and `docs/styles.css` enforce `R >= G >= B` across all light (`#f6f4ef`, `#fcfbf8`, `#efece4`) and dark (`#151412`, `#1d1c19`, `#262420`) background tokens, automatically verified by Vitest.
- **Verification Results (Phase 15)**:
  - `cargo fmt --all -- --check` — clean.
  - `cargo clippy --workspace --all-targets -- -D warnings` — 0 warnings, 0 errors.
  - `cargo test --workspace` — `lonestar_lib`: 2 passed, 0 failed, 1 ignored (`live_lmstudio_gemma4_e4b_end_to_end`); `lonestar-core` integration (`istar_metamodel_tests`): 13 passed, 0 failed.
  - `npm run check` (`tsc --noEmit`) — 0 errors.
  - `npm test` (Vitest) — 20 passed, 0 failed (including strict iStar 2.0 integrity rules, canonical template 0-issue checks, concrete SVG syntax checks, GUI zoom, and warm theme checks).
  - `npm run build` (Vite + Svelte 5) — 0 errors, 0 warnings (`dist/` bundle built cleanly).
- **Phase 14 GUI Zoom Architecture Summary**:
  - **Tauri WebView Zoom (`src-tauri/capabilities/default.json`, `src/infrastructure/backendAdapter.ts`)**: Grants `core:webview:allow-set-webview-zoom` and calls `getCurrentWebview().setZoom(scaleFactor)` in Tauri desktop mode without enabling `zoomHotkeysEnabled`, preserving diagram canvas `Ctrl+wheel` zoom.
  - **Application State & Shortcut Resolution (`src/application/uiStore.svelte.ts`)**: Manages `uiZoom` (`0.5`–`2.0` at `0.1` steps) persisted in `localStorage` (`lonestar-ui-zoom`), plus pure helpers (`clampUiZoom`, `isMacPlatform`, `resolveUiZoomShortcut`) supporting `Ctrl` on Linux/Windows, `Cmd` on macOS, Italian/US/Numpad `+`, `=`, `-`, `0` keys, and rejecting `AltGr` / cross-OS conflicts.
  - **Global Wiring & UI Controls (`src/App.svelte`, `src/presentation/Canvas.svelte`, `src/presentation/SettingsModal.svelte`)**: Registers a capture-phase `keydown` handler in `App.svelte` (desktop Tauri only) and restores zoom on startup; guards `Canvas.svelte` single-key shortcuts when modifiers are held; adds Desktop-only Interface Scale controls in `SettingsModal.svelte`.
- **Phase 7 AI Agent Architecture Summary**:
  - **Core (`crates/lonestar-core/src/application/agent.rs`)**: Pure domain/application declarative batch engine (`execute_agent_operations`) supporting ID or case-insensitive name resolution, automatic iStar 2.0 metamodel repairs (e.g., flipping reversed `NeededBy`/`Qualification`/`Contribution`, converting invalid `Agent` `IsA` links to `ParticipatesIn`, converting cross-boundary SR links into social `Dependency` links), automatic `ModelService::auto_layout`, compact semantic context summaries, system prompt with iStar 2.0 guide, OpenAI tool schema (`apply_istar_operations`), and fenced ` ```istar-ops ` / ` ```json ` fallback extraction.
  - **Tauri Backend (`src-tauri/src/agent.rs`, `commands.rs`, `lib.rs`)**: OpenAI-compatible HTTP client via `reqwest` (`rustls` + `ring`) exposing `agent_list_models` and `agent_run_turn` with automatic HTTP 400/422 non-tool fallback for local Jinja templates (LM Studio / Ollama) and a 2-round self-correction loop.
  - **Desktop-Only Frontend (`agentStore.svelte.ts`, `AgentPanel.svelte`, `Toolbar.svelte`, `SettingsModal.svelte`, `App.svelte`)**: Guarded strictly by `isTauriRuntime()` so the GitHub Pages Web Studio stays unaffected, with persisted presets (`LM Studio`, `Ollama`, `OpenAI`, `OpenRouter`, `Custom`), selection-aware context badge, quick action chips, expandable operation/repair badges, and single-snapshot `modelStore` Undo/Redo.

## Phase 16: iStar 2.0 Conformance Audit & Fixes
- Reference: iStar 2.0 Language Guide (arXiv 1605.07767v3) §3, §5, §6 (Table 1), §8 (integrity constraints), cross-checked against piStar's `tool/language/constraints.js`.
- Method: 99-case differential probe (every Table 1 source/target pair, actor-link, dependency and model-level rules) run against both `validator.rs` and `istarRules.ts`. Probes live outside the repo (scratchpad); both validators gave identical results.
- Result: 94/99 cases match the guide. Hard rules (Table 1 matrix, is-a typing, one actor link per pair, same-actor element links, contribution XOR qualification, depender/dependee ownership, dependerElmt not refined/contributed, refinement cycles, AND/OR mixing) are all correct.
- Findings (fixed in this phase unless noted):
  - [x] F1 `validator.rs:223-237` / `istarRules.ts:207-214`: acyclic-contribution rule among Qualities is stricter than the guide (only self-contribution is forbidden; piStar has no such check). Valid mutual Q↔Q contributions produce `istar.link` errors, also on import.
  - [x] F2 `validator.rs:92-118` / `istarRules.ts:112-127`: is-a and participates-in edges share one graph, so a mixed cycle (A is-a B, B part-in C, C part-in A) is rejected; guide §8 forbids is-a cycles and participates-in cycles separately.
  - [x] F3 `agent.rs:744-764`, `:694-699`, `:560-562`: AI agent writes `actor_id` / `kind` directly without validation; `validation_issues` (`agent.rs:1223`) is not used by the self-correction loop nor by `agentStore.svelte.ts`.
  - [~] F4 (UI-edit part fixed; the rest deliberately left open, see Review) Minor: unvalidated UI mutations (`moveElementBy`, `updateElement`, `updateActor` kind) are caught only post-hoc by the issues panel; mixed AND/OR parent is reported 3x; text/JSON import silently defaults unknown link kind to AND-refinement and missing contribution label to `help`.
- Note: `docs/index.html` and README claim "acyclic" checks as iStar 2.0 fidelity; F1 should be reworded if it stays.
- Review (fixes):
  - F1: removed the Quality contribution-cycle rule and `MetamodelError::ContributionCycle` (Rust `validator.rs`/`errors.rs`, TS `istarRules.ts`); self-contribution is still rejected as a self-loop.
  - F2: actor-link cycle detection now builds one graph per link kind (is-a / participates-in), in Rust and TS; error text says "of the same kind".
  - F3: `apply_checked` in `agent.rs` wraps the three direct writes (`UpdateActor` kind, `UpdateElement` kind, containment `AddLink`); a write that introduces a new `(rule, entity)` error is rolled back and reported in `report.errors`, which feeds the existing 2-round self-correction loop.
  - F4 (UI edits): `introducedErrorClient` + guarded `modelStore.updateActor/updateElement/moveElementBy` (return `string | null`); `Inspector.svelte` notifies and resets the owner `<select>`; `Canvas.svelte` drag refuses re-parenting that would break a rule (element stays put, one notification per drag, pointer delta kept pending).
  - Tests: Rust 18 passed (was 13; +per-kind cycles, +3 agent guard rejections, +guard allows conformant writes, 2 existing tests rewritten to the spec), Vitest 28 passed (was 21). The 3 agent rejection tests were mutation-checked: with the rollback disabled all 3 fail.
  - Re-run of the 99-case guide probe: 0 divergences on both Rust and TS (was 5).
  - Verified: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `npm run check`, `npm test`, `npm run build` all clean.
- Deliberately NOT changed (not iStar 2.0 violations, or a product decision): mixed AND/OR parent reported 3x; import silently defaulting unknown link kind to AND-refinement / missing contribution label to `help`; agent cross-boundary auto-repair semantics; ambiguous-name resolution in the agent; dependency dedup; `validation_issues` stays non-blocking in the agent report.

## Phase 17: Save Shortcuts (Ctrl/Cmd+S, Ctrl/Cmd+Shift+S) & Unsaved-Changes Indicator
- Design: `modelStore` owns the document lifecycle (it already owns history and `initFromBackend`), so it also holds the bound `filePath` and the last-saved LoneStar JSON; `isDirty` compares what *would* be written with what *was* written, so undoing back to the saved state is clean again. Ctrl/Cmd+S overwrites only a native LoneStar JSON file; a piStar / `.txt` file is never silently converted, Save falls back to Save As. Opening a file or a template starts a new document (fresh undo history, otherwise undo would put the previous diagram under the new file path) and asks before discarding unsaved changes.
- [x] `pistarCodec.ts`: extract `isLoneStarJsonDocument(raw)` from `importAnyJsonModel` native detection
- [x] `modelStore.svelte.ts`: `filePath`, `isDirty`, `openDocument(model, path)`, `markSaved(path, contents)`, `confirmDiscardChanges()`; `initFromBackend` / `loadTemplate` start a clean document
- [x] `backendAdapter.ts`: `writeTextFile(path, contents)` (desktop) and `confirm(message, title)` (Tauri `ask` / `window.confirm`; `dialog:default` already grants `allow-message`)
- [x] `uiStore.svelte.ts`: pure `resolveSaveShortcut(event, isMac)` next to `resolveUiZoomShortcut`
- [x] `Toolbar.svelte`: exported `saveDocument({ saveAs })`, Save / Save As menu items with shortcut hints, open flows via `openDocument` + discard confirm, unsaved-changes + bound file indicator
- [x] `App.svelte`: capture-phase Ctrl/Cmd+S handler (desktop and web), commits a focused input before saving; `Canvas.svelte` file drop via `openDocument` + confirm
- [x] Vitest coverage + README shortcut table; verify `npm run check`, `npm test`, `npm run build`
- Review:
  - Dirty state is `exportModelToLoneStarJson(model) !== savedContents`, not a flag set by mutations: it also catches writes outside history (title `bind:value`, drags) and goes back to clean when undo returns to the saved state. `markSaved` takes the exact string written, so an edit landing while a save is awaited stays dirty.
  - Behaviour change: opening a file / recent / dropped file / template no longer pushes undo history (it starts a new document); unsaved work is protected by an OK/Cancel confirm instead. The AI agent's `replaceModel` is still an undoable edit.
  - The save shortcut is a capture-phase listener in `App.svelte` (web + desktop, `e.repeat` ignored) that blurs a focused input first so `onchange` / inline-rename edits are committed before saving.
  - Tests: Vitest 36 passed (was 28; +8: shortcut resolution, native-JSON detection, open/edit/undo/save/in-flight/template dirty transitions, wiring). New tests failed before the implementation.
  - Verified: `npm run check`, `npm test`, `npm run build` (0 warnings). Not verified in a running UI (no browser automation in this session): manual check pending.

## Phase 18: Close Guard for Unsaved Changes & Toolbar Save Button
- Design: closing reuses `modelStore.confirmDiscardChanges()`. Desktop: `getCurrentWindow().onCloseRequested` (with a JS listener Tauri prevents the native close and the JS side calls `destroy()`, which needs `core:window:allow-destroy`). Web Studio: `beforeunload` (the browser shows its own generic prompt). macOS Cmd+Q: tao 0.37 has no `applicationShouldTerminate` and the predefined Quit item calls `-[NSApp terminate:]`, which never emits `CloseRequested`; the default menu keeps every item but Quit is replaced by a custom `CmdOrCtrl+Q` item that calls `window.close()`, so it goes through the same guard.
- [x] `backendAdapter.ts`: `onCloseRequested(shouldClose)` (desktop only, returns unlisten)
- [x] `App.svelte`: register the desktop close guard and the web `beforeunload` guard, both driven by `modelStore.isDirty`
- [x] `src-tauri/capabilities/default.json`: `core:window:allow-destroy`
- [x] `src-tauri/src/lib.rs`: macOS menu with guarded Quit (`CmdOrCtrl+Q` → `close()` on the windows)
- [x] `Toolbar.svelte`: Save button (floppy SVG, `tb-action-icon` / `tb-icon-svg` like Settings) next to Open, accent when dirty, shortcut in tooltip
- [x] Vitest (`confirmDiscardChanges` asks only when dirty, wiring) + README; verify `npm run check`, `npm test`, `npm run build`, `cargo fmt`, `cargo clippy`, `cargo test`
- Review:
  - Window close: `backendAdapter.onCloseRequested` + `modelStore.confirmDiscardChanges()`; Web Studio: `beforeunload` registered only outside Tauri (WKWebView has no beforeunload UI).
  - Cmd+Q: the Quit item of `Menu::default` is located by its predefined text (`Quit …`) and replaced in place by `CmdOrCtrl+Q` → `window.close()`; if Tauri ever changes the default menu and the item is not found, the menu is left as is (no guard on Cmd+Q, nothing breaks). Dock → Quit and logout still terminate without asking (tao 0.37 has no `applicationShouldTerminate`).
  - Tauri keeps JS listeners across page reloads (no cleanup on page load in 2.12.5): a stale close listener only means the native close is deferred to the reloaded page's own listener. Reloads only happen in dev (HMR).
  - Tests: Vitest 39 passed (+3: confirm asked only when dirty and answer honoured, close-guard wiring incl. `core:window:allow-destroy` and the macOS Quit item, Save button). Rust: fmt clean, clippy 0 warnings, 18 + 2 tests passed.
  - Smoke: `tauri dev` started with the custom menu installed (setup returned Ok, no panic). Interactive close / Cmd+Q / Save button not exercised by me: manual check pending.
