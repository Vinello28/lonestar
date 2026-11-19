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

---

## Final Engineering Review
- **Clean Architecture Adherence**:
  - `crates/lonestar-core/src/domain/` defines pure iStar 2.0 domain entities (`DiagramModel`, `Actor`, `IntentionalElement`, `Link`, `Dependency`) and formal metamodel constraint enforcement (`validator.rs`) without any UI, Tauri, or filesystem dependencies.
  - `crates/lonestar-core/src/application/` encapsulates use cases (`ModelService`) and outbound ports (`ModelRepository`, `PiStarInteropPort`).
  - `crates/lonestar-core/src/infrastructure/` implements the bidirectional piStar 2.0 JSON/TXT adapter, file persistence repository, and built-in canonical templates (`travel`, `telemedicine`).
  - `src-tauri/` adapts Tauri v2 IPC commands, native save/open dialogs, auto-updater (`tauri-plugin-updater`), process relaunch (`tauri-plugin-process`), and URL opener (`tauri-plugin-opener`) to `lonestar-core`.
  - `src/` mirrors Clean Architecture in TypeScript + Svelte 5 Runes (`$state`, `$derived`) with seamless Tauri-desktop / browser-demo fallback via `backendAdapter.ts`.
- **iStar 2.0 Fidelity & Usability**:
  - Supports all actor variants (`Actor`, `Agent`, `Role` with official bar/crescent markers and expandable/collapsible SR boundaries), all intentional elements (`Goal`, `Quality`, `Task`, `Resource`), all internal links (`AndRefinement` T-bar, `OrRefinement` triangle, `NeededBy` circle, `Contribution` `make`/`help`/`hurt`/`break`, `Qualification` dashed), actor links (`IsA`, `ParticipatesIn`), and `Dependency` (`D` semicircle markers).
  - Pointer-based drag-and-drop from the Palette works uniformly across Linux WebKitGTK, macOS, Windows, and web browsers, with automatic boundary containment and Smart Auto-Connect drag linking.
  - Supports opening, dropping, and exporting `.json` and `.txt` (piStar 2.0 JSON-in-`.txt` and structured iStar 2.0 text notation).
- **Theme Constraint Verification**:
  - Both `src/app.css` and `docs/styles.css` enforce `R >= G >= B` across all light (`#f6f4ef`, `#fcfbf8`, `#efece4`) and dark (`#151412`, `#1d1c19`, `#262420`) background tokens, automatically verified by Vitest.
- **Verification Results**:
  - `cargo fmt --all -- --check` — clean.
  - `cargo clippy --workspace --all-targets -- -D warnings` — 0 warnings, 0 errors.
  - `cargo test --workspace` — 11 passed, 0 failed (`lonestar-core` integration suite including 4 AI Agent tests).
  - Live LM Studio E2E (`live_lmstudio_gemma4_e4b_end_to_end` against `http://localhost:1234/v1` with `google/gemma-4-e4b`) — passed in 8.81s (14 applied operations, 0 errors, 0 validation issues).
  - `npm run check` (`tsc --noEmit`) — 0 errors.
  - `npm test` (Vitest) — 7 passed, 0 failed (including AI Agent defaults & preset switching test and warm theme invariant).
  - `npm run build` (Vite + Svelte 5) — 0 errors, 0 warnings (`dist/` bundle built cleanly).
- **Phase 7 AI Agent Architecture Summary**:
  - **Core (`crates/lonestar-core/src/application/agent.rs`)**: Pure domain/application declarative batch engine (`execute_agent_operations`) supporting ID or case-insensitive name resolution, automatic iStar 2.0 metamodel repairs (e.g., flipping reversed `NeededBy`/`Qualification`/`Contribution`, converting invalid `Agent` `IsA` links to `ParticipatesIn`, converting cross-boundary SR links into social `Dependency` links), automatic `ModelService::auto_layout`, compact semantic context summaries, system prompt with iStar 2.0 guide, OpenAI tool schema (`apply_istar_operations`), and fenced ` ```istar-ops ` / ` ```json ` fallback extraction.
  - **Tauri Backend (`src-tauri/src/agent.rs`, `commands.rs`, `lib.rs`)**: OpenAI-compatible HTTP client via `reqwest` (`rustls` + `ring`) exposing `agent_list_models` and `agent_run_turn` with automatic HTTP 400/422 non-tool fallback for local Jinja templates (LM Studio / Ollama) and a 2-round self-correction loop.
  - **Desktop-Only Frontend (`agentStore.svelte.ts`, `AgentPanel.svelte`, `Toolbar.svelte`, `SettingsModal.svelte`, `App.svelte`)**: Guarded strictly by `isTauriRuntime()` so the GitHub Pages Web Studio stays unaffected, with persisted presets (`LM Studio`, `Ollama`, `OpenAI`, `OpenRouter`, `Custom`), selection-aware context badge, quick action chips, expandable operation/repair badges, and single-snapshot `modelStore` Undo/Redo.
