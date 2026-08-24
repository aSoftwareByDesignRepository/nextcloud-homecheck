# Changelog

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
