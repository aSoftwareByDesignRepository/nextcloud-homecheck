# Changelog

## 1.0.15 — 2026-08-25

- Feature: Nextcloud Dashboard desklet (`homecheck-launcher`) — layout status + start-page hint + **Open launcher** button.
- Security: desklet uses read-only `summarizeForUser()` (never persists layout / apporder on Dashboard load).
- UX: dense launcher grid — fixed-ish tile tracks packed to the start (no `1fr` stretch / empty bloated cards).
- Assets: `app-dashboard.svg` / `app-dark.svg` + `desklet-nextcloud.css` (WCAG 2.1 AA touch/focus).
- Tests: LauncherWidget unit + summarize contracts; desklet chrome; E2E density + OCS desklet; mutation guards.

## 1.0.14 — 2026-08-25

- Fix: drag-and-drop reorder — edit mode no longer sets `disabled` on launch buttons (that blocked dragstart on Firefox/Chrome).
- Fix: pointer-based DnD with drop-target highlight (mouse + touch); native image drag disabled so reorder can start from the icon.
- UX: restore Move left / Move right on top-level cards for keyboard/menu reorder.
- Tests: `e2e/dnd.spec.js`; mutation guards against `launch.disabled=true`.

## 1.0.13 — 2026-08-25

- UX: app logos on solid `--color-primary-element` wells with NC `--primary-invert-if-dark` so white SVG icons stay visible in light, dark, and custom-accent themes.
- UX: larger icon wells (4.5rem) and glyphs (2.75rem); folder stacks inherit the same invert treatment.
- a11y: high-contrast ring and forced-colors Canvas rules for icon wells.
- Tests: CSS/mutation icon invert contract; e2e size + dark-theme filter checks.

## 1.0.12 — 2026-08-25

- UX: native Nextcloud launcher — borderless app tiles, NC hover, compact toolbar, `button-vue primary/secondary`.
- UX: remove heavy page header and edit banner; grid visible immediately; one-line edit hint.
- UX: start-page CTA uses NC `notecard`; status hidden when empty.
- UX: edit actions (⋮ menu) visible on every card in edit mode.
- Tests: `e2e/first-view.spec.js` first-paint clarity + axe; contracts updated.

## 1.0.11 — 2026-08-24

- UX: design-system full-width shell (`hmk-shell--wide`) — removes 72rem page cap; matches sibling Check apps.
- UX: page header with 56×56 icon well, `fs-2xl` title, 60ch lead, responsive action row.
- UX: `hmk-page-stack` vertical rhythm; wider responsive app grid on tablet/desktop.
- Shell: `shell-init.js` applies `hmk-app` on `#app-content` before paint; NC content area flex fill.
- Tests: shell CSS contract guards; E2E wide-viewport width assertion.

## 1.0.10 — 2026-08-24

- l10n: fix stale msgids (`Drag cards to reorder…`); remove unused catalog keys; 54 keys synced to PHP templates.
- l10n: informal native-quality gate; polish DE/FR/ES/IT/PL/nb/pt_BR banner and skip-link copy.
- l10n: regenerate all `.js` catalogs; add `check-l10n-code-keys.php` and glossary HomeCheck terms.

## 1.0.9 — 2026-08-24

- Theme: map `hmk-*` tokens to Nextcloud CSS variables under `#app-content` (light/dark/accent/high-contrast).
- Theme: dialog open/close override, forced-colors + prefers-contrast, safe-area padding, danger fill via `--color-element-error`.
- Theme: `button-vue` on all controls so NC core mobile `button:not(.button-vue)` styles do not override app buttons.
- Theme: primary/danger fills use theme-aware `color-mix` for WCAG 2.1 AA contrast in dark mode.
- Responsive: tablet (768px) rules, dialog action stacks, overflow-x clip, icon well rem tokens.
- Tests: CSS theme contract; e2e matrix across 5 viewports × 4 theme presets + axe.

## 1.0.8 — 2026-08-24

- UX: one-click folder creation (default name, optional rename); no mandatory naming modal.
- UX: accessible confirm dialog replaces native `window.confirm` for folder delete.
- UX: smart “Add to folder” (auto-create, single-folder direct add, or picker for many).
- UX: edit-mode banner, larger cards/touch targets (48px), clearer status feedback, shorter copy.
- UX: removed redundant grid move-left/right menu items (drag-and-drop handles reorder).
- a11y/e2e: axe-core WCAG 2.1 AA scans + keyboard, mobile, and journey flow tests.

## 1.0.7 — 2026-08-24

- P1: First-write CAS loser path re-syncs `apporder` instead of assuming sync succeeded (`getForUserAfterLostRace`).
- P1: Client apporder retry uses exponential backoff (3 attempts: 750 ms / 1.5 s / 3 s).
- Tests: lost-race unit tests; JS retry delay contract; mutation guards.

## 1.0.6 — 2026-08-24

- P1: `LayoutMerger` caps top-level items at 100 (no silent over-limit append on GET/save).
- P1: `deleteFolder` / `removeFromFolder` refuse when expand would exceed the grid limit.
- Tests: merger cap unit test; JS limit contracts; mutation guards.

## 1.0.5 — 2026-08-24

- P0: DnD reorder compensates splice index shift when moving right (correct layout + apporder).
- P1: Href guard compares full origin (scheme+host+port); first-GET exposes `apporderSynced` for client retry.
- P1: Client enforces max 100 grid items / 40 folder children; CTA dismiss checks API success.
- a11y: empty-folder grid uses `role="status"`; menu actions are `menuitem`; dragend clears drag id.
- Admin UI strings i18n’d via JSON script; en/de limit messages.

## 1.0.4 — 2026-08-24

- SF-01: `POST /api/sync-apporder` + automatic client retry after layout-saved / top-bar-sync 502.
- SF-02: structured info log on successful layout save (revision, item count, sync flag).
- UX/a11y: define `--hmk-space-7`; Escape on rename/new-folder prompt clears handlers (no double-fire).
- Tests: resync unit/API/integration + mutation/JS contracts for retry path.

## 1.0.3 — 2026-08-24

- Zeus: atomic layout CAS via `LayoutWriteGuard` (SELECT … FOR UPDATE + conditional write).
- Zeus: client in-flight saves no longer clobber newer local edits (epoch + revision adopt).
- Tests: WriteGuard unit + integration stale-revision conflict; JS epoch apply contract.

## 1.0.2 — 2026-08-24

- P0: Folder open/remove works in edit mode; cards no longer nest buttons (WCAG).
- P1: `defaultapp` CSV merge/strip; uninstall strips HomeCheck from defaultapp; revision TOCTOU re-check; same-origin absolute hrefs only; in-folder reorder; serialized client saves.
- P2: 409 returns server layout; apporder sync failure → HTTP 502; default-landing requires explicit params; focus restore on dialogs; ApiController / UninstallCleanup / sync-failure unit tests; stronger e2e.

## 1.0.1 — 2026-08-24

- Harden: regenerate corrupt personal layouts on GET; href+icon guard; flush dirty saves; CSRF 412 reload.
- UX: New folder toolbar; delete confirm; server-driven i18n; `application/json` initial state.

## 1.0.0 — 2026-08-24

- Initial release: card grid, folders, personal layout, top-bar `apporder` sync, default-landing CTA, admin seed template, en/de.
