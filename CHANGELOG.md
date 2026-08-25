# Changelog

## 1.0.40 — 2026-08-25

- A11y/Theme: Chrome secondary buttons use opaque `main-background` + maxcontrast border so wallpaper/dark themes keep ≥4.5:1.
- Theme: Soft sticky topbar (main-background frost) instead of a solid plain-colour slab; high-contrast solid fallback.
- A11y: Dark-theme icon wells invert glyphs; 48px icon wells; design-system spacing on folder rows.
- Tests: Chrome secondary luminance check; theme-contract + icon-contrast updated for dark invert.

## 1.0.39 — 2026-08-25

- App Store: nine 1920×1040 screenshots + `info.xml` listing URLs; Playwright `chromium-store` capture script.
- Release: Makefile (`release` / `release-signed`) and ready2publish catalog entry.

## 1.0.38 — 2026-08-25

- Fix: AppHome scrolls when there are many apps so the Software by Design link always stays at the end of the page and remains reachable.

## 1.0.37 — 2026-08-25

- Feature: Hide whole folders from AppHome (Edit → ⋮ → Hide). Restore the folder and its apps together from Hidden apps.

## 1.0.36 — 2026-08-25

- Feature: Hide apps from your AppHome (Edit → ⋮ → Hide). Restore anytime via Hidden apps.
- Layout: Personal `hidden` id list; merger no longer re-appends hidden live nav entries.

## 1.0.35 — 2026-08-25

- A11y/Theme: Primary/secondary/danger buttons use AA-safe fills (`color-mix` + surface tokens; dark + bright accents).
- Theme: Secondary chrome paints `var(--color-background-dark)` + main text — never pale `--color-primary-element-light` under dark ink.
- Responsive: Replace one-off px spacing with `hmk-space-*`; pane width token `--hmk-pane-width`.
- Desklet: Drop NC invert sentinel; dark UI uses valid `brightness(0) invert(1)`.
- Tests: Theme/axe matrix covers dark/HC/custom accents; secondary fill contract asserts background-dark.

## 1.0.34 — 2026-08-25

- Security: LayoutMerger sanitizes hostile/corrupt folder names (defense-in-depth if preferences bypass LayoutValidator).
- Tests: Full API auth matrix (unauthenticated 401 + non-admin 403); stronger cross-user isolation; JSON size limit unit test.
- QA: Momos FULL engagement 2026-08-25.

## 1.0.33 — 2026-08-25

- Security: Icon URLs use the same `isSafeHref` allowlist as launch links (blocks `javascript:`, `data:`, foreign origins).
- Security: Dashboard desklet `getItemsV2` binds session UID before summarizing (BOLA defense-in-depth).
- Audit: Argus FULL AUDIT 2026-08-25.

## 1.0.32 — 2026-08-25

- Fix: Icon wells use light primary surface + black silhouette (`brightness(0)`) — visible with AA contrast; avoids NC `filter: no` and white-on-bright-primary failure.
- Audit: Zeus FULL AUDIT 2026-08-25 (architecture No-Go gate `tests/Architecture/absolute-no-gos.php`).

## 1.0.31 — 2026-08-25

- UX: Remove frosted chip behind the top-right home/Edit actions.

## 1.0.30 — 2026-08-25

- Fix: Icon glyphs always render as white silhouettes on primary wells (`brightness(0) invert(1)`) — restores visibility when NC’s `filter: no` sentinel blanked icons.

## 1.0.29 — 2026-08-25

- Fix: Icon glyphs use `--primary-invert-if-bright` (NC contract) so white app icons stay white on dark primary wells — restores WCAG-readable contrast (was black-on-blue via invert-if-dark).
- UX: Slightly larger opaque icon wells with a light edge so they separate cleanly from frosted panes.

## 1.0.28 — 2026-08-25

- Fix: Icon wells keep the Nextcloud primary colour — invert only the glyph (was turning blue wells orange).
- UX: Soft frosted toolbar behind Edit/home actions; vendor credit is a readable frosted label after the panes.

## 1.0.27 — 2026-08-25

- UX: Vendor credit back after the panes (scroll with content); keep readable contrast, drop the pinned bottom bar.

## 1.0.26 — 2026-08-25

- Fix: Primary/secondary/danger buttons use Nextcloud Appearance colours (vanilla `button-vue` was unstyled and ignored theme primary).
- UX: Frosted panes use a denser surface so warm wallpapers tint less heavily against a blue primary.

## 1.0.25 — 2026-08-25

- UX: Pin vendor credit to the bottom of the AppHome viewport as a frosted pill (always visible while browsing panes).

## 1.0.24 — 2026-08-25

- UX: Quiet footer credit linking to [nextcloud.software-by-design.de](https://nextcloud.software-by-design.de/) (launcher + admin seed settings).

## 1.0.23 — 2026-08-25

- Rename: user-facing product name **AppHome** (technical app id remains `homecheck`).

## 1.0.22 — 2026-08-25

- Rename: user-facing product name **AppCheck** (technical app id remains `homecheck`). Superseded by AppHome in 1.0.23.

## 1.0.21 — 2026-08-25

- UX: Always-visible **Use as home** / **Unset as home** toggle in the sticky top bar (set or clear Nextcloud start page after login).

## 1.0.20 — 2026-08-25

- Fix: ⋮ edit menus paint above neighbouring frosted panes (stacking / `backdrop-filter`).
- Fix: drag-and-drop hit-testing — dragged pane uses `pointer-events: none` + pointer capture so drop targets resolve.
- UX: sticky frosted top bar with greeting + pill Edit / New folder controls.

## 1.0.19 — 2026-08-25

- Fix: home scroll — app root height uses viewport minus header (`--hmk-overlay-height`) so the last panes are not clipped below the fold; extra bottom padding on the shell.

## 1.0.18 — 2026-08-25

- UX: App panes are one clickable surface — drop the useless “Open” subtitle line; folder rows stay single-line.

## 1.0.17 — 2026-08-25

- UX: Individual Dashboard-style frosted panes (~320px) you can drag to rearrange; wrap responsively on narrow screens.
- UX: Folder panes list apps inline; greeting + themed background kept from 1.0.16.
- Tests: pane selectors in e2e/contracts/mutation; l10n “pane” / “home screen” msgids.

## 1.0.16 — 2026-08-25

- UX: Native Nextcloud Dashboard look — themed background, time-of-day greeting with display name, frosted `hmk-panel` chrome around the launcher grid.
- a11y: reduced-transparency / high-contrast / forced-colors fallbacks for blur panels; greeting uses `--color-background-plain-text`.
- Security: greeting name via `textContent` + PHP `p()`; displayName stripped of control chars (max 80).
- Tests: greeting period/formatter contracts; CSS dashboard chrome; first-view e2e for greeting + panel.

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
