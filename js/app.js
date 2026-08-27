/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * HomeCheck launcher — accessible cards, folders, keyboard parity, CSRF saves.
 */
(function () {
	'use strict';

	var appContent = document.getElementById('app-content')
		|| document.querySelector('#content[class*="app-homecheck"]');
	if (appContent) {
		appContent.classList.add('hmk-app');
	}

	const root = document.getElementById('homecheck-app');
	if (!root) {
		return;
	}

	function readJsonScript(id, fallback) {
		const node = document.getElementById(id);
		if (!node || !node.textContent) {
			return fallback;
		}
		try {
			return JSON.parse(node.textContent);
		} catch (e) {
			return fallback;
		}
	}

	/** @type {{layout:any, entries:any[], ctaDismissed:boolean, isDefaultLanding:boolean, displayName?:string}} */
	let state = readJsonScript('hmk-initial-state', {
		layout: { version: 1, revision: 0, items: [] },
		entries: [],
		ctaDismissed: true,
		isDefaultLanding: false,
		displayName: '',
	});
	if (!state.layout || !Array.isArray(state.layout.items)) {
		state.layout = { version: 1, revision: 0, items: [], hidden: [], hiddenFolders: [] };
	}
	if (!Array.isArray(state.layout.hidden)) {
		state.layout.hidden = [];
	}
	if (!Array.isArray(state.layout.hiddenFolders)) {
		state.layout.hiddenFolders = [];
	}
	if (typeof state.displayName !== 'string') {
		state.displayName = '';
	}

	const t = Object.assign({
		edit: 'Edit',
		done: 'Done',
		folder: 'Folder',
		moveLeft: 'Move left',
		moveRight: 'Move right',
		newFolder: 'New folder',
		addToFolder: 'Add to folder',
		removeFromFolder: 'Remove from folder',
		hideApp: 'Hide',
		hiddenApps: 'Hidden apps',
		showApp: 'Show again',
		hiddenEmpty: 'No hidden apps.',
		appHidden: 'Hidden from HomeCheck',
		folderHidden: 'Folder hidden from HomeCheck',
		renameFolder: 'Rename folder',
		deleteFolder: 'Delete folder',
		confirmDeleteFolder: 'Delete this folder? Apps inside return to the home screen.',
		saving: 'Saving…',
		saved: 'Saved',
		saveFailed: 'Could not save — try again',
		conflict: 'Someone changed the layout — reloading',
		openFolder: 'Open folder',
		nameFolder: 'Folder name',
		nameInvalid: 'Name must be 1–40 characters',
		nameChars: 'Name has invalid characters',
		moreActions: 'More actions',
		editSubtitle: 'Drag panes to rearrange. Hide apps you do not need. Tap Done when finished.',
		viewSubtitle: 'Tap a pane to open an app.',
		editBanner: 'Editing your apps',
		chooseFolder: 'Choose a folder',
		noFoldersYet: 'No folders yet — a new one will be created.',
		delete: 'Delete',
		rename: 'Rename',
		syncWarn: 'Saved (top-bar sync failed — try again)',
		syncRetrying: 'Retrying top-bar sync…',
		startOk: 'HomeCheck is your start page',
		startCleared: 'HomeCheck is no longer your start page',
		startFail: 'Could not update start page',
		useAsHome: 'Use as home',
		unsetAsHome: 'Unset as home',
		useAsHomeHint: 'Open HomeCheck after you sign in',
		unsetAsHomeHint: 'Stop opening HomeCheck after you sign in',
		unsafeLink: 'This app link is not safe to open',
		emptyFolder: 'This folder is empty — add apps from Edit.',
		limitItems: 'Too many items on the home screen (max 100)',
		limitChildren: 'Too many apps in this folder (max 40)',
		goodMorning: 'Good morning',
		goodMorningName: 'Good morning, {name}',
		goodAfternoon: 'Good afternoon',
		goodAfternoonName: 'Good afternoon, {name}',
		goodEvening: 'Good evening',
		goodEveningName: 'Good evening, {name}',
		hello: 'Hello',
		helloName: 'Hello, {name}',
	}, readJsonScript('hmk-i18n', {}));

	const MAX_ITEMS = 100;
	const MAX_CHILDREN = 40;

	const entriesById = Object.create(null);
	(state.entries || []).forEach(function (e) {
		entriesById[e.id] = e;
	});

	let editing = false;
	let saveTimer = null;
	let dirty = false;
	/** Bumps on every local edit — in-flight saves must not clobber newer local state. */
	let localEpoch = 0;
	let dragId = null;
	/** Pointer DnD (HTML5 drag is unreliable on disabled/button surfaces). */
	let pointerDnD = {
		pointerId: null,
		fromId: null,
		active: false,
		startX: 0,
		startY: 0,
		suppressClick: false,
		onMove: null,
		onUp: null,
	};
	/** @type {Promise<void>} */
	let saveChain = Promise.resolve();
	/** @type {HTMLElement|null} */
	let focusReturn = null;
	/** @type {string|null} */
	let openFolderId = null;

	const el = {
		panels: document.getElementById('hmk-panels'),
		empty: document.getElementById('hmk-empty'),
		status: document.getElementById('hmk-status'),
		editToggle: document.getElementById('hmk-edit-toggle'),
		newFolder: document.getElementById('hmk-new-folder'),
		hiddenAppsBtn: document.getElementById('hmk-hidden-apps'),
		homeToggle: document.getElementById('hmk-home-toggle'),
		cta: document.getElementById('hmk-cta'),
		ctaYes: document.getElementById('hmk-cta-yes'),
		ctaNo: document.getElementById('hmk-cta-no'),
		folderDialog: document.getElementById('hmk-folder-dialog'),
		folderTitle: document.getElementById('hmk-folder-title'),
		folderGrid: document.getElementById('hmk-folder-grid'),
		folderClose: document.getElementById('hmk-folder-close'),
		promptDialog: document.getElementById('hmk-prompt-dialog'),
		promptTitle: document.getElementById('hmk-prompt-title'),
		promptLabel: document.getElementById('hmk-prompt-label'),
		promptInput: document.getElementById('hmk-prompt-input'),
		promptError: document.getElementById('hmk-prompt-error'),
		promptOk: document.getElementById('hmk-prompt-ok'),
		promptCancel: document.getElementById('hmk-prompt-cancel'),
		confirmDialog: document.getElementById('hmk-confirm-dialog'),
		confirmMessage: document.getElementById('hmk-confirm-message'),
		confirmOk: document.getElementById('hmk-confirm-ok'),
		confirmCancel: document.getElementById('hmk-confirm-cancel'),
		folderPicker: document.getElementById('hmk-folder-picker'),
		folderPickerList: document.getElementById('hmk-folder-picker-list'),
		folderPickerCancel: document.getElementById('hmk-folder-picker-cancel'),
		hiddenDialog: document.getElementById('hmk-hidden-dialog'),
		hiddenList: document.getElementById('hmk-hidden-list'),
		hiddenClose: document.getElementById('hmk-hidden-close'),
		hiddenCancel: document.getElementById('hmk-hidden-cancel'),
		editHint: document.getElementById('hmk-edit-hint'),
		instructions: document.getElementById('hmk-instructions'),
		greeting: document.getElementById('hmk-greeting'),
	};
	/** @deprecated alias — panes host (Dashboard-style layout) */
	el.grid = el.panels;

	/**
	 * NC Dashboard period buckets (hour 0–23).
	 * night: 22–04, morning: 05–11, afternoon: 12–17, evening: 18–21
	 * @param {number} hour
	 * @returns {'morning'|'afternoon'|'evening'|'night'}
	 */
	function greetingPeriod(hour) {
		var h = Number(hour);
		if (!Number.isFinite(h)) {
			return 'morning';
		}
		h = ((Math.floor(h) % 24) + 24) % 24;
		if (h >= 22 || h < 5) {
			return 'night';
		}
		if (h >= 18) {
			return 'evening';
		}
		if (h >= 12) {
			return 'afternoon';
		}
		return 'morning';
	}

	/**
	 * @param {'morning'|'afternoon'|'evening'|'night'} period
	 * @param {string} name
	 * @param {Record<string, string>} dict
	 * @returns {string}
	 */
	function formatGreeting(period, name, dict) {
		var clean = typeof name === 'string' ? name.trim() : '';
		var withName = clean !== '';
		var key;
		if (period === 'afternoon') {
			key = withName ? 'goodAfternoonName' : 'goodAfternoon';
		} else if (period === 'evening') {
			key = withName ? 'goodEveningName' : 'goodEvening';
		} else if (period === 'night') {
			key = withName ? 'helloName' : 'hello';
		} else {
			key = withName ? 'goodMorningName' : 'goodMorning';
		}
		var tpl = dict[key] || '';
		return withName ? String(tpl).split('{name}').join(clean) : String(tpl);
	}

	function paintGreeting() {
		if (!el.greeting) {
			return;
		}
		var text = formatGreeting(
			greetingPeriod(new Date().getHours()),
			state.displayName || '',
			t
		);
		el.greeting.textContent = text;
	}

	function generateFolderId() {
		const bytes = new Uint8Array(8);
		crypto.getRandomValues(bytes);
		return 'fld_' + Array.from(bytes, function (b) {
			return b.toString(16).padStart(2, '0');
		}).join('');
	}

	function isSafeHref(href) {
		if (!href || typeof href !== 'string') {
			return false;
		}
		const h = href.trim();
		if (h.charAt(0) === '/') {
			return h.indexOf('//') !== 0;
		}
		if (!/^https?:\/\//i.test(h)) {
			return false;
		}
		try {
			const u = new URL(h);
			return u.origin === window.location.origin;
		} catch (e) {
			return false;
		}
	}

	function setStatus(msg, isError) {
		if (!el.status) {
			return;
		}
		el.status.textContent = msg || '';
		el.status.classList.toggle('is-error', !!isError);
		el.status.classList.toggle('is-success', !!msg && !isError);
	}

	function defaultFolderName() {
		return t.newFolder;
	}

	function token() {
		return (window.OC && window.OC.requestToken) ? window.OC.requestToken : '';
	}

	async function api(method, url, body) {
		const headers = {
			requesttoken: token(),
			Accept: 'application/json',
		};
		let payload = null;
		if (body !== undefined) {
			headers['Content-Type'] = 'application/json';
			payload = JSON.stringify(Object.assign({ requesttoken: token() }, body));
		}
		const res = await fetch(url, {
			method: method,
			credentials: 'same-origin',
			headers: headers,
			body: payload,
		});
		if (res.status === 412) {
			window.location.reload();
			return { res: res, data: { ok: false, error: { code: 'csrf', message: 'csrf' } } };
		}
		const data = await res.json().catch(function () {
			return { ok: false, error: { code: 'server_error', message: 'Bad response' } };
		});
		return { res: res, data: data };
	}

	function layoutUrl() {
		return (window.OC && window.OC.generateUrl)
			? window.OC.generateUrl('/apps/homecheck/api/layout')
			: '/index.php/apps/homecheck/api/layout';
	}

	function defaultLandingUrl() {
		return (window.OC && window.OC.generateUrl)
			? window.OC.generateUrl('/apps/homecheck/api/default-landing')
			: '/index.php/apps/homecheck/api/default-landing';
	}

	function syncAppOrderUrl() {
		return (window.OC && window.OC.generateUrl)
			? window.OC.generateUrl('/apps/homecheck/api/sync-apporder')
			: '/index.php/apps/homecheck/api/sync-apporder';
	}

	function scheduleSave() {
		dirty = true;
		localEpoch += 1;
		setStatus(t.saving, false);
		if (saveTimer) {
			clearTimeout(saveTimer);
		}
		saveTimer = setTimeout(function () {
			saveTimer = null;
			enqueueSave();
		}, 500);
	}

	function enqueueSave() {
		saveChain = saveChain.catch(function () { /* keep chain alive */ }).then(function () {
			return doSave();
		});
		return saveChain;
	}

	async function flushSave() {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
		if (dirty) {
			enqueueSave();
		}
		await saveChain;
	}

	async function doSave() {
		const epochAtStart = localEpoch;
		const snapshot = JSON.parse(JSON.stringify(state.layout));
		dirty = false;
		const { res, data } = await api('PUT', layoutUrl(), { layout: snapshot });
		if (!data.ok) {
			dirty = true;
			if (res.status === 409) {
				setStatus(t.conflict, true);
				if (data.data && data.data.layout) {
					state.layout = data.data.layout;
				}
				window.location.reload();
				return;
			}
			setStatus((data.error && data.error.message) || t.saveFailed, true);
			return;
		}
		// Local edits during the request: keep items, adopt server revision for the next PUT.
		if (epochAtStart !== localEpoch) {
			if (data.data && data.data.layout && typeof data.data.layout.revision === 'number') {
				state.layout.revision = data.data.layout.revision;
			}
			dirty = true;
			enqueueSave();
			return;
		}
		state.layout = data.data.layout;
		if (!Array.isArray(state.layout.hidden)) {
			state.layout.hidden = [];
		}
		if (!Array.isArray(state.layout.hiddenFolders)) {
			state.layout.hiddenFolders = [];
		}
		if (data.data.entries) {
			state.entries = data.data.entries;
			Object.keys(entriesById).forEach(function (k) { delete entriesById[k]; });
			state.entries.forEach(function (e) { entriesById[e.id] = e; });
		}
		const syncFail = data.data.warning === 'apporder_sync_failed' || res.status === 502;
		setStatus(syncFail ? t.syncWarn : t.saved, syncFail);
		render();
		if (openFolderId) {
			const folder = state.layout.items.find(function (it) {
				return it.type === 'folder' && it.id === openFolderId;
			});
			if (folder) {
				paintFolderDialog(folder);
			}
		}
		if (syncFail) {
			scheduleAppOrderRetry();
		} else {
			resetAppOrderRetryState();
		}
	}

	const APPORDER_RETRY_MAX = 3;
	const APPORDER_RETRY_BASE_MS = 750;
	let appOrderRetryTimer = null;
	let appOrderRetryAttempt = 0;

	function appOrderRetryDelayMs(attempt) {
		if (attempt >= APPORDER_RETRY_MAX) {
			return null;
		}
		return APPORDER_RETRY_BASE_MS * Math.pow(2, attempt);
	}

	function resetAppOrderRetryState() {
		appOrderRetryAttempt = 0;
		if (appOrderRetryTimer) {
			clearTimeout(appOrderRetryTimer);
			appOrderRetryTimer = null;
		}
	}

	function scheduleAppOrderRetry() {
		const delay = appOrderRetryDelayMs(appOrderRetryAttempt);
		if (delay === null || appOrderRetryTimer) {
			return;
		}
		appOrderRetryTimer = setTimeout(async function () {
			appOrderRetryTimer = null;
			const attempt = appOrderRetryAttempt;
			appOrderRetryAttempt += 1;
			setStatus(t.syncRetrying, false);
			const { res, data } = await api('POST', syncAppOrderUrl(), {});
			const ok = !!(data.ok && data.data && data.data.apporderSynced && res.status < 500);
			if (ok) {
				resetAppOrderRetryState();
				setStatus(t.saved, false);
				return;
			}
			setStatus(t.syncWarn, true);
			if (appOrderRetryAttempt < APPORDER_RETRY_MAX) {
				scheduleAppOrderRetry();
			}
		}, delay);
	}

	function findItemIndex(id) {
		return state.layout.items.findIndex(function (it) {
			return (it.type === 'app' && it.id === id) || (it.type === 'folder' && it.id === id);
		});
	}

	function reorderItemsById(fromId, toId, placeAfter) {
		if (!fromId || !toId || fromId === toId) {
			return false;
		}
		const from = findItemIndex(fromId);
		const to = findItemIndex(toId);
		if (from < 0 || to < 0) {
			return false;
		}
		const items = state.layout.items.slice();
		const moved = items.splice(from, 1)[0];
		items.splice(reorderInsertIndex(from, to, !!placeAfter), 0, moved);
		state.layout.items = items;
		scheduleSave();
		render();
		return true;
	}

	function clearDropTargets() {
		if (!el.panels) {
			return;
		}
		el.panels.querySelectorAll('.hmk-pane.is-drop-target').forEach(function (node) {
			node.classList.remove('is-drop-target');
		});
	}

	function resetPointerDnD(pane) {
		if (pane) {
			pane.classList.remove('is-dragging');
		}
		clearDropTargets();
		if (pointerDnD.onMove) {
			document.removeEventListener('pointermove', pointerDnD.onMove, true);
			pointerDnD.onMove = null;
		}
		if (pointerDnD.onUp) {
			document.removeEventListener('pointerup', pointerDnD.onUp, true);
			document.removeEventListener('pointercancel', pointerDnD.onUp, true);
			pointerDnD.onUp = null;
		}
		pointerDnD.pointerId = null;
		pointerDnD.fromId = null;
		pointerDnD.active = false;
		dragId = null;
	}

	function paneAtPoint(clientX, clientY) {
		const under = document.elementFromPoint(clientX, clientY);
		if (!under || typeof under.closest !== 'function') {
			return null;
		}
		return under.closest('#hmk-panels > .hmk-pane');
	}

	function attachPointerDnD(pane, item) {
		pane.addEventListener('pointerdown', function (ev) {
			if (!editing) {
				return;
			}
			if (typeof ev.button === 'number' && ev.button !== 0) {
				return;
			}
			if (ev.target && ev.target.closest && ev.target.closest('.hmk-pane__menu')) {
				return;
			}
			/* Folder child rows keep their own menus; drag those panes from the header. */
			if (item.type === 'folder' && ev.target && ev.target.closest && ev.target.closest('.hmk-pane__row')) {
				return;
			}

			resetPointerDnD(pane);
			pointerDnD.pointerId = ev.pointerId;
			pointerDnD.fromId = item.id;
			pointerDnD.active = false;
			pointerDnD.startX = ev.clientX;
			pointerDnD.startY = ev.clientY;
			pointerDnD.suppressClick = false;

			try {
				pane.setPointerCapture(ev.pointerId);
			} catch (err) {
				/* Older engines may reject capture on some surfaces — document listeners still work. */
			}

			pointerDnD.onMove = function (moveEv) {
				if (pointerDnD.pointerId !== moveEv.pointerId || pointerDnD.fromId !== item.id) {
					return;
				}
				const dx = moveEv.clientX - pointerDnD.startX;
				const dy = moveEv.clientY - pointerDnD.startY;
				if (!pointerDnD.active) {
					if ((dx * dx) + (dy * dy) < 36) {
						return;
					}
					pointerDnD.active = true;
					pointerDnD.suppressClick = true;
					dragId = item.id;
					pane.classList.add('is-dragging');
					/* Close any open ⋮ menus so they do not steal hit-testing. */
					el.panels.querySelectorAll('.hmk-pane__menu[open]').forEach(function (node) {
						node.open = false;
					});
				}
				clearDropTargets();
				const target = paneAtPoint(moveEv.clientX, moveEv.clientY);
				if (target && target.dataset.id && target.dataset.id !== item.id) {
					target.classList.add('is-drop-target');
				}
				if (moveEv.cancelable) {
					moveEv.preventDefault();
				}
			};

			pointerDnD.onUp = function (upEv) {
				if (pointerDnD.pointerId !== upEv.pointerId || pointerDnD.fromId !== item.id) {
					return;
				}
				const fromId = pointerDnD.fromId;
				const wasActive = pointerDnD.active;
				const target = wasActive ? paneAtPoint(upEv.clientX, upEv.clientY) : null;
				const toId = target && target.dataset ? target.dataset.id : null;
				let placeAfter = false;
				if (target) {
					const rect = target.getBoundingClientRect();
					/* Works for side-by-side and wrapped stacks */
					const nx = (upEv.clientX - rect.left) / Math.max(rect.width, 1);
					const ny = (upEv.clientY - rect.top) / Math.max(rect.height, 1);
					placeAfter = (nx + ny) > 1;
				}
				try {
					if (pane.hasPointerCapture && pane.hasPointerCapture(upEv.pointerId)) {
						pane.releasePointerCapture(upEv.pointerId);
					}
				} catch (err) {
					/* ignore */
				}
				resetPointerDnD(pane);
				if (wasActive && toId) {
					reorderItemsById(fromId, toId, placeAfter);
				}
			};

			document.addEventListener('pointermove', pointerDnD.onMove, true);
			document.addEventListener('pointerup', pointerDnD.onUp, true);
			document.addEventListener('pointercancel', pointerDnD.onUp, true);
		});
	}

	function moveItem(id, dir) {
		const idx = findItemIndex(id);
		if (idx < 0) {
			return;
		}
		const to = idx + dir;
		if (to < 0 || to >= state.layout.items.length) {
			return;
		}
		const items = state.layout.items.slice();
		const tmp = items[idx];
		items[idx] = items[to];
		items[to] = tmp;
		state.layout.items = items;
		scheduleSave();
		render();
	}

	function moveChildInFolder(folderId, appId, dir) {
		const idx = findItemIndex(folderId);
		if (idx < 0) {
			return;
		}
		const folder = Object.assign({}, state.layout.items[idx]);
		const children = (folder.children || []).slice();
		const cIdx = children.indexOf(appId);
		const to = cIdx + dir;
		if (cIdx < 0 || to < 0 || to >= children.length) {
			return;
		}
		const tmp = children[cIdx];
		children[cIdx] = children[to];
		children[to] = tmp;
		folder.children = children;
		const items = state.layout.items.slice();
		items[idx] = folder;
		state.layout.items = items;
		scheduleSave();
		paintFolderDialog(folder);
		render();
	}

	function deleteFolder(folderId) {
		confirmAction(t.confirmDeleteFolder, t.delete, function () {
			const idx = findItemIndex(folderId);
			if (idx < 0) {
				return;
			}
			const folder = state.layout.items[idx];
			const children = (folder.children || []).map(function (cid) {
				return { type: 'app', id: cid };
			});
			const nextLen = state.layout.items.length - 1 + children.length;
			if (nextLen > MAX_ITEMS) {
				setStatus(t.limitItems, true);
				return;
			}
			const items = state.layout.items.slice();
			items.splice(idx, 1);
			state.layout.items = items.concat(children);
			if (openFolderId === folderId) {
				el.folderDialog.close();
			}
			scheduleSave();
			render();
		});
	}

	function reorderInsertIndex(from, to, placeAfter) {
		if (from < 0 || to < 0 || from === to) {
			return to;
		}
		if (from < to) {
			/* After splice(from,1), the old target index shifts left by 1. */
			return placeAfter ? to : to - 1;
		}
		return placeAfter ? to + 1 : to;
	}

	function createEmptyFolder() {
		if ((state.layout.items || []).length >= MAX_ITEMS) {
			setStatus(t.limitItems, true);
			return;
		}
		state.layout.items = state.layout.items.concat([{
			type: 'folder',
			id: generateFolderId(),
			name: defaultFolderName(),
			children: [],
		}]);
		scheduleSave();
		render();
	}

	function createFolderWithApp(appId) {
		const items = state.layout.items.filter(function (it) {
			return !(it.type === 'app' && it.id === appId);
		});
		if (items.length >= MAX_ITEMS) {
			setStatus(t.limitItems, true);
			return;
		}
		items.push({
			type: 'folder',
			id: generateFolderId(),
			name: defaultFolderName(),
			children: [appId],
		});
		state.layout.items = items;
		scheduleSave();
		render();
	}

	function addAppToFolderFlow(appId) {
		const folders = state.layout.items.filter(function (it) { return it.type === 'folder'; });
		if (folders.length === 0) {
			createFolderWithApp(appId);
			return;
		}
		if (folders.length === 1) {
			addAppToFolder(appId, folders[0].id);
			return;
		}
		showFolderPicker(appId);
	}

	function addAppToFolder(appId, folderId) {
		const items = state.layout.items.slice();
		const appIdx = items.findIndex(function (it) { return it.type === 'app' && it.id === appId; });
		if (appIdx < 0) {
			return;
		}
		const fIdx = items.findIndex(function (it) { return it.type === 'folder' && it.id === folderId; });
		if (fIdx < 0) {
			return;
		}
		const folder = Object.assign({}, items[fIdx]);
		const kids = (folder.children || []).slice();
		if (kids.length >= MAX_CHILDREN) {
			setStatus(t.limitChildren, true);
			return;
		}
		items.splice(appIdx, 1);
		const fIdxAfter = items.findIndex(function (it) { return it.type === 'folder' && it.id === folderId; });
		if (fIdxAfter < 0) {
			return;
		}
		folder.children = kids.concat([appId]);
		items[fIdxAfter] = folder;
		state.layout.items = items;
		scheduleSave();
		render();
	}

	function removeFromFolder(folderId, appId) {
		const idx = findItemIndex(folderId);
		if (idx < 0) {
			return;
		}
		if ((state.layout.items || []).length >= MAX_ITEMS) {
			setStatus(t.limitItems, true);
			return;
		}
		const folder = Object.assign({}, state.layout.items[idx]);
		folder.children = (folder.children || []).filter(function (c) { return c !== appId; });
		const items = state.layout.items.slice();
		items[idx] = folder;
		items.push({ type: 'app', id: appId });
		state.layout.items = items;
		scheduleSave();
		paintFolderDialog(folder);
		render();
	}

	function ensureHiddenList() {
		if (!Array.isArray(state.layout.hidden)) {
			state.layout.hidden = [];
		}
		return state.layout.hidden;
	}

	function ensureHiddenFolders() {
		if (!Array.isArray(state.layout.hiddenFolders)) {
			state.layout.hiddenFolders = [];
		}
		return state.layout.hiddenFolders;
	}

	function hasAnyHidden() {
		return ensureHiddenList().length > 0 || ensureHiddenFolders().length > 0;
	}

	function hideApp(appId, folderId) {
		if (!appId) {
			return;
		}
		const hidden = ensureHiddenList();
		if (hidden.indexOf(appId) === -1) {
			hidden.push(appId);
		}
		if (folderId) {
			const idx = findItemIndex(folderId);
			if (idx >= 0) {
				const folder = Object.assign({}, state.layout.items[idx]);
				folder.children = (folder.children || []).filter(function (c) { return c !== appId; });
				const items = state.layout.items.slice();
				items[idx] = folder;
				state.layout.items = items;
				if (el.folderDialog && el.folderDialog.open) {
					paintFolderDialog(folder);
				}
			}
		} else {
			state.layout.items = state.layout.items.filter(function (it) {
				return !(it.type === 'app' && it.id === appId);
			});
		}
		scheduleSave();
		setStatus(t.appHidden, false);
		render();
	}

	function hideFolder(folderId) {
		const idx = findItemIndex(folderId);
		if (idx < 0) {
			return;
		}
		const folder = Object.assign({}, state.layout.items[idx]);
		if (folder.type !== 'folder') {
			return;
		}
		const kids = (folder.children || []).slice();
		// Flat-hidden apps that are in this folder move into the folder hide entry.
		state.layout.hidden = ensureHiddenList().filter(function (id) {
			return kids.indexOf(id) === -1;
		});
		ensureHiddenFolders().push({
			type: 'folder',
			id: folder.id,
			name: folder.name || t.folder,
			children: kids,
		});
		state.layout.items = state.layout.items.filter(function (it) {
			return !(it.type === 'folder' && it.id === folderId);
		});
		if (openFolderId === folderId && el.folderDialog && el.folderDialog.open) {
			el.folderDialog.close();
		}
		scheduleSave();
		setStatus(t.folderHidden, false);
		render();
	}

	function showAppAgain(appId) {
		state.layout.hidden = ensureHiddenList().filter(function (id) { return id !== appId; });
		const placed = state.layout.items.some(function (it) {
			if (it.type === 'app' && it.id === appId) {
				return true;
			}
			if (it.type === 'folder' && (it.children || []).indexOf(appId) !== -1) {
				return true;
			}
			return false;
		}) || ensureHiddenFolders().some(function (f) {
			return (f.children || []).indexOf(appId) !== -1;
		});
		if (!placed && (state.layout.items || []).length < MAX_ITEMS) {
			state.layout.items = state.layout.items.concat([{ type: 'app', id: appId }]);
		}
		scheduleSave();
		render();
		paintHiddenDialog();
	}

	function showFolderAgain(folderId) {
		const folders = ensureHiddenFolders();
		const fIdx = folders.findIndex(function (f) { return f.id === folderId; });
		if (fIdx < 0) {
			return;
		}
		if ((state.layout.items || []).length >= MAX_ITEMS) {
			setStatus(t.limitItems, true);
			return;
		}
		const folder = Object.assign({}, folders[fIdx]);
		folders.splice(fIdx, 1);
		state.layout.hiddenFolders = folders;
		state.layout.items = state.layout.items.concat([folder]);
		scheduleSave();
		render();
		paintHiddenDialog();
	}

	function paintHiddenDialog() {
		if (!el.hiddenList) {
			return;
		}
		el.hiddenList.textContent = '';
		const hidden = ensureHiddenList();
		const hiddenFolders = ensureHiddenFolders();
		if (hidden.length === 0 && hiddenFolders.length === 0) {
			const p = document.createElement('p');
			p.className = 'hmk-empty-inline';
			p.textContent = t.hiddenEmpty;
			el.hiddenList.appendChild(p);
			return;
		}
		hiddenFolders.forEach(function (folder) {
			const row = document.createElement('div');
			row.className = 'hmk-hidden-row';
			row.setAttribute('role', 'listitem');
			const label = document.createElement('span');
			label.className = 'hmk-hidden-row__name';
			const count = (folder.children || []).length;
			label.textContent = (folder.name || t.folder) + ' (' + count + ')';
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'button-vue primary hmk-touch-btn';
			btn.textContent = t.showApp;
			btn.addEventListener('click', function () {
				showFolderAgain(folder.id);
			});
			row.appendChild(label);
			row.appendChild(btn);
			el.hiddenList.appendChild(row);
		});
		hidden.forEach(function (id) {
			const entry = entriesById[id] || { id: id, name: id };
			const row = document.createElement('div');
			row.className = 'hmk-hidden-row';
			row.setAttribute('role', 'listitem');
			const label = document.createElement('span');
			label.className = 'hmk-hidden-row__name';
			label.textContent = entry.name || id;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'button-vue primary hmk-touch-btn';
			btn.textContent = t.showApp;
			btn.addEventListener('click', function () {
				showAppAgain(id);
			});
			row.appendChild(label);
			row.appendChild(btn);
			el.hiddenList.appendChild(row);
		});
	}

	function openHiddenDialog() {
		paintHiddenDialog();
		if (el.hiddenDialog && typeof el.hiddenDialog.showModal === 'function') {
			el.hiddenDialog.showModal();
		}
	}

	function renameFolder(folderId) {
		const idx = findItemIndex(folderId);
		if (idx < 0) {
			return;
		}
		const current = state.layout.items[idx].name || '';
		promptName(t.rename, t.nameFolder, current, function (name) {
			const items = state.layout.items.slice();
			items[idx] = Object.assign({}, items[idx], { name: name });
			state.layout.items = items;
			scheduleSave();
			render();
			if (openFolderId === folderId) {
				paintFolderDialog(items[idx]);
			}
		});
	}

	function promptName(title, label, value, onOk) {
		focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		el.promptTitle.textContent = title;
		el.promptLabel.textContent = label;
		el.promptInput.value = value || '';
		el.promptError.textContent = '';
		el.promptDialog.showModal();
		el.promptInput.focus();
		el.promptInput.select();

		let cleaned = false;
		let accepted = false;
		function cleanup() {
			if (cleaned) {
				return;
			}
			cleaned = true;
			el.promptOk.onclick = null;
			el.promptCancel.onclick = null;
			el.promptInput.removeEventListener('keydown', onPromptKey);
			el.promptInput.removeEventListener('input', onPromptInput);
		}
		function onPromptInput() {
			el.promptError.textContent = '';
		}
		function onPromptKey(ev) {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				el.promptOk.click();
			}
		}
		function onPromptClose() {
			el.promptDialog.removeEventListener('close', onPromptClose);
			cleanup();
			if (accepted) {
				onOk((el.promptInput.value || '').trim());
			}
		}
		el.promptInput.addEventListener('input', onPromptInput);
		el.promptInput.addEventListener('keydown', onPromptKey);
		el.promptDialog.addEventListener('close', onPromptClose);
		el.promptCancel.onclick = function () {
			accepted = false;
			cleanup();
			el.promptDialog.close();
		};
		el.promptOk.onclick = function () {
			const name = (el.promptInput.value || '').trim();
			if (!name || name.length > 40) {
				el.promptError.textContent = t.nameInvalid;
				el.promptInput.focus();
				return;
			}
			if (!/^[\p{L}\p{N} _\-\.\/\(\)]+$/u.test(name)) {
				el.promptError.textContent = t.nameChars;
				el.promptInput.focus();
				return;
			}
			accepted = true;
			el.promptInput.value = name;
			cleanup();
			el.promptDialog.close();
		};
	}

	function confirmAction(message, confirmLabel, onConfirm) {
		if (!el.confirmDialog) {
			return;
		}
		focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		el.confirmMessage.textContent = message;
		el.confirmOk.textContent = confirmLabel || t.delete;
		el.confirmDialog.showModal();
		el.confirmCancel.focus();

		let cleaned = false;
		function cleanup() {
			if (cleaned) {
				return;
			}
			cleaned = true;
			el.confirmOk.onclick = null;
			el.confirmCancel.onclick = null;
			el.confirmDialog.removeEventListener('close', onConfirmClose);
			el.confirmDialog.removeEventListener('keydown', onConfirmKey);
		}
		function finish(confirmed) {
			cleanup();
			el.confirmDialog.close();
			if (confirmed) {
				onConfirm();
			}
		}
		function onConfirmClose() {
			cleanup();
			restoreFocus();
		}
		function onConfirmKey(ev) {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				finish(false);
			}
		}
		el.confirmDialog.addEventListener('close', onConfirmClose);
		el.confirmDialog.addEventListener('keydown', onConfirmKey);
		el.confirmCancel.onclick = function () { finish(false); };
		el.confirmOk.onclick = function () { finish(true); };
	}

	function showFolderPicker(appId) {
		if (!el.folderPicker || !el.folderPickerList) {
			return;
		}
		const folders = state.layout.items.filter(function (it) { return it.type === 'folder'; });
		focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		el.folderPickerList.textContent = '';
		folders.forEach(function (folder) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'button-vue hmk-picker-list__item';
			btn.setAttribute('role', 'listitem');
			const label = document.createElement('span');
			label.textContent = folder.name || t.folder;
			const count = document.createElement('span');
			count.className = 'hmk-picker-list__count';
			count.textContent = String((folder.children || []).length);
			btn.appendChild(label);
			btn.appendChild(count);
			btn.addEventListener('click', function () {
				el.folderPicker.close();
				addAppToFolder(appId, folder.id);
			});
			el.folderPickerList.appendChild(btn);
		});
		el.folderPicker.showModal();
		if (el.folderPickerList.firstElementChild) {
			/** @type {HTMLElement} */ (el.folderPickerList.firstElementChild).focus();
		}
	}

	function iconLetter(name) {
		const s = (name || '?').trim();
		return s ? s.charAt(0).toUpperCase() : '?';
	}

	function menuButton(label, onClick) {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'button-vue';
		b.setAttribute('role', 'menuitem');
		b.textContent = label;
		b.addEventListener('click', function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			onClick();
		});
		return b;
	}

	function attachEditMenu(host, item, opts) {
		if (!editing) {
			return;
		}
		opts = opts || {};
		const details = document.createElement('details');
		details.className = 'hmk-pane__menu';
		const summary = document.createElement('summary');
		summary.textContent = '⋮';
		summary.setAttribute('aria-label', t.moreActions);
		details.appendChild(summary);
		const menu = document.createElement('div');
		menu.className = 'hmk-menu';
		menu.setAttribute('role', 'menu');

		if (opts.folderId) {
			menu.appendChild(menuButton(t.moveLeft, function () {
				details.open = false;
				moveChildInFolder(opts.folderId, item.id, -1);
			}));
			menu.appendChild(menuButton(t.moveRight, function () {
				details.open = false;
				moveChildInFolder(opts.folderId, item.id, 1);
			}));
			menu.appendChild(menuButton(t.removeFromFolder, function () {
				details.open = false;
				removeFromFolder(opts.folderId, item.id);
			}));
			menu.appendChild(menuButton(t.hideApp, function () {
				details.open = false;
				hideApp(item.id, opts.folderId);
			}));
		} else {
			if (item.type === 'app') {
				menu.appendChild(menuButton(t.moveLeft, function () { details.open = false; moveItem(item.id, -1); }));
				menu.appendChild(menuButton(t.moveRight, function () { details.open = false; moveItem(item.id, 1); }));
				menu.appendChild(menuButton(t.newFolder, function () { details.open = false; createFolderWithApp(item.id); }));
				menu.appendChild(menuButton(t.addToFolder, function () { details.open = false; addAppToFolderFlow(item.id); }));
				menu.appendChild(menuButton(t.hideApp, function () { details.open = false; hideApp(item.id, null); }));
			} else if (item.type === 'folder') {
				menu.appendChild(menuButton(t.moveLeft, function () { details.open = false; moveItem(item.id, -1); }));
				menu.appendChild(menuButton(t.moveRight, function () { details.open = false; moveItem(item.id, 1); }));
				menu.appendChild(menuButton(t.openFolder, function () { details.open = false; openFolder(item, summary); }));
				menu.appendChild(menuButton(t.rename, function () { details.open = false; renameFolder(item.id); }));
				menu.appendChild(menuButton(t.hideApp, function () { details.open = false; hideFolder(item.id); }));
				menu.appendChild(menuButton(t.deleteFolder, function () { details.open = false; deleteFolder(item.id); }));
			}
		}
		details.appendChild(menu);
		details.addEventListener('toggle', function () {
			const hostPane = details.closest('.hmk-pane');
			if (hostPane) {
				hostPane.classList.toggle('is-menu-open', details.open);
			}
			if (details.open) {
				/* Accordion: only one ⋮ menu open at a time (home grid + folder dialog). */
				document.querySelectorAll('#homecheck-app .hmk-pane__menu[open]').forEach(function (node) {
					if (node !== details) {
						node.open = false;
						const otherPane = node.closest('.hmk-pane');
						if (otherPane) {
							otherPane.classList.remove('is-menu-open');
						}
					}
				});
				host.scrollIntoView({ block: 'nearest', behavior: 'instant' });
			}
		});
		host.appendChild(details);
	}

	function activateApp(entry) {
		if (!entry || !entry.href || !isSafeHref(entry.href)) {
			setStatus(t.unsafeLink, true);
			return;
		}
		window.location.href = entry.href;
	}

	function buildPaneIcon(entry, isFolder) {
		const well = document.createElement('span');
		well.className = 'hmk-pane__icon-well';
		well.setAttribute('aria-hidden', 'true');

		const img = document.createElement('img');
		img.className = 'hmk-pane__icon';
		img.alt = '';
		img.width = 24;
		img.height = 24;
		img.decoding = 'async';
		img.draggable = false;
		if (isFolder) {
			img.src = (window.OC && window.OC.imagePath)
				? window.OC.imagePath('homecheck', 'app-dashboard.svg')
				: '/apps/homecheck/img/app-dashboard.svg';
			well.appendChild(img);
			return well;
		}
		/* Same allowlist as launch hrefs — never trust entry.icon from nav/JSON alone. */
		if (entry && entry.icon && typeof entry.icon === 'string' && isSafeHref(entry.icon)) {
			img.src = entry.icon;
			img.addEventListener('error', function () {
				img.remove();
				const span = document.createElement('span');
				span.className = 'hmk-pane__icon hmk-pane__icon--fallback';
				span.textContent = iconLetter(entry ? entry.name : '?');
				well.appendChild(span);
			});
			well.appendChild(img);
			return well;
		}
		const span = document.createElement('span');
		span.className = 'hmk-pane__icon hmk-pane__icon--fallback';
		span.textContent = iconLetter(entry ? entry.name : '?');
		well.appendChild(span);
		return well;
	}

	function makeListRow(entry, opts) {
		opts = opts || {};
		const li = document.createElement('div');
		li.className = 'hmk-pane__row';
		li.setAttribute('role', 'listitem');
		li.dataset.id = entry ? entry.id : '';

		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'button-vue hmk-pane__row-launch';

		const icon = buildPaneIcon(entry, false);
		icon.classList.add('hmk-pane__row-icon');
		btn.appendChild(icon);

		const title = document.createElement('span');
		title.className = 'hmk-pane__row-title';
		title.textContent = entry ? entry.name : '';
		btn.appendChild(title);

		if (editing) {
			btn.setAttribute('aria-disabled', 'true');
			btn.addEventListener('click', function (ev) {
				ev.preventDefault();
				ev.stopPropagation();
			});
		} else {
			btn.addEventListener('click', function () { activateApp(entry); });
		}

		li.appendChild(btn);
		if (opts.folderId && entry) {
			attachEditMenu(li, { type: 'app', id: entry.id }, { folderId: opts.folderId });
		}
		return li;
	}

	function paintFolderDialog(folder) {
		openFolderId = folder.id;
		el.folderTitle.textContent = folder.name || t.folder;
		el.folderGrid.textContent = '';
		const kids = folder.children || [];
		if (kids.length === 0) {
			el.folderGrid.setAttribute('role', 'status');
			el.folderGrid.removeAttribute('aria-label');
			const p = document.createElement('p');
			p.className = 'hmk-muted';
			p.textContent = t.emptyFolder;
			el.folderGrid.appendChild(p);
			return;
		}
		el.folderGrid.setAttribute('role', 'list');
		el.folderGrid.setAttribute('aria-label', folder.name || t.folder);
		kids.forEach(function (cid) {
			const entry = entriesById[cid];
			if (!entry) {
				return;
			}
			el.folderGrid.appendChild(makeListRow(entry, { folderId: folder.id }));
		});
	}

	function openFolder(folder, fromEl) {
		focusReturn = fromEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		paintFolderDialog(folder);
		el.folderDialog.showModal();
		el.folderClose.focus();
	}

	/**
	 * Dashboard-style pane for one top-level app or folder.
	 * App panes: one clickable surface (no redundant “Open” subtitle).
	 * Folder panes: header + inline app rows (rows stay separate buttons).
	 */
	function makePane(item) {
		const pane = document.createElement('section');
		pane.className = 'hmk-pane' + (item.type === 'folder' ? ' hmk-pane--folder' : ' hmk-pane--app');
		pane.setAttribute('role', 'listitem');
		pane.dataset.id = item.id;
		pane.dataset.type = item.type;

		const header = document.createElement('header');
		header.className = 'hmk-pane__header';

		if (item.type === 'folder') {
			const titleWrap = document.createElement('div');
			titleWrap.className = 'hmk-pane__title';
			titleWrap.appendChild(buildPaneIcon(null, true));
			const text = document.createElement('span');
			text.className = 'hmk-pane__title-text';
			text.textContent = item.name || t.folder;
			titleWrap.appendChild(text);
			const badge = document.createElement('span');
			badge.className = 'hmk-pane__badge';
			badge.textContent = String((item.children || []).length);
			titleWrap.appendChild(badge);
			header.appendChild(titleWrap);
			attachEditMenu(header, item, {});
			pane.appendChild(header);

			const content = document.createElement('div');
			content.className = 'hmk-pane__content';
			const list = document.createElement('div');
			list.className = 'hmk-pane__list';
			list.setAttribute('role', 'list');
			const kids = item.children || [];
			let shown = 0;
			kids.forEach(function (cid) {
				const entry = entriesById[cid];
				if (!entry) {
					return;
				}
				list.appendChild(makeListRow(entry, { folderId: item.id }));
				shown += 1;
			});
			if (shown === 0) {
				const empty = document.createElement('p');
				empty.className = 'hmk-pane__empty';
				empty.textContent = t.emptyFolder;
				content.appendChild(empty);
			} else {
				content.appendChild(list);
			}
			pane.appendChild(content);
		} else {
			const entry = entriesById[item.id];
			const launch = document.createElement('button');
			launch.type = 'button';
			launch.className = 'button-vue hmk-pane__launch';
			launch.appendChild(buildPaneIcon(entry, false));
			const text = document.createElement('span');
			text.className = 'hmk-pane__title-text';
			text.textContent = entry ? entry.name : item.id;
			launch.appendChild(text);
			if (editing) {
				launch.setAttribute('aria-disabled', 'true');
				launch.addEventListener('click', function (ev) {
					ev.preventDefault();
					ev.stopPropagation();
				});
			} else {
				launch.addEventListener('click', function () { activateApp(entry); });
			}
			header.appendChild(launch);
			attachEditMenu(header, item, {});
			pane.appendChild(header);
		}

		if (editing) {
			pane.classList.add('hmk-pane--draggable');
			attachPointerDnD(pane, item);
		}

		return pane;
	}

	function render() {
		const items = (state.layout && state.layout.items) ? state.layout.items : [];
		if (!el.panels) {
			return;
		}
		el.panels.textContent = '';
		if (items.length === 0) {
			el.empty.hidden = false;
			el.panels.hidden = true;
		} else {
			el.empty.hidden = true;
			el.panels.hidden = false;
			items.forEach(function (item) {
				el.panels.appendChild(makePane(item));
			});
		}
		root.classList.toggle('is-editing', editing);
		if (el.editToggle) {
			el.editToggle.setAttribute('aria-pressed', editing ? 'true' : 'false');
			el.editToggle.textContent = editing ? t.done : t.edit;
			el.editToggle.classList.toggle('primary', !editing);
			el.editToggle.classList.toggle('secondary', editing);
			el.editToggle.setAttribute('aria-label', editing ? t.editSubtitle : t.viewSubtitle);
		}
		if (el.newFolder) {
			el.newFolder.hidden = !editing;
		}
		if (el.hiddenAppsBtn) {
			el.hiddenAppsBtn.hidden = !editing || !hasAnyHidden();
		}
		if (el.editHint) {
			el.editHint.hidden = !editing;
		}
		if (el.instructions) {
			el.instructions.textContent = editing ? t.editSubtitle : t.viewSubtitle;
		}
		paintHomeToggle();
	}

	function paintHomeToggle() {
		if (!el.homeToggle) {
			return;
		}
		const on = !!state.isDefaultLanding;
		el.homeToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
		el.homeToggle.textContent = on ? t.unsetAsHome : t.useAsHome;
		el.homeToggle.setAttribute('aria-label', on ? t.unsetAsHomeHint : t.useAsHomeHint);
		el.homeToggle.title = on ? t.unsetAsHomeHint : t.useAsHomeHint;
		el.homeToggle.classList.toggle('primary', on);
		el.homeToggle.classList.toggle('secondary', !on);
		el.homeToggle.classList.toggle('hmk-chrome__btn--home-on', on);
	}

	async function toggleDefaultLanding() {
		const enable = !state.isDefaultLanding;
		/* enable:false must not send dismiss:true — API treats that as CTA-only dismiss. */
		const body = enable ? { enable: true, dismiss: true } : { enable: false };
		const { data } = await api('POST', defaultLandingUrl(), body);
		if (!data.ok) {
			setStatus(t.startFail, true);
			return;
		}
		state.isDefaultLanding = !!(data.data && data.data.isDefaultLanding);
		if (enable) {
			state.ctaDismissed = true;
			if (el.cta) {
				el.cta.hidden = true;
			}
		}
		paintHomeToggle();
		setStatus(state.isDefaultLanding ? t.startOk : t.startCleared, false);
	}

	function setupCta() {
		if (!el.cta) {
			return;
		}
		if (state.ctaDismissed || state.isDefaultLanding) {
			el.cta.hidden = true;
			return;
		}
		el.cta.hidden = false;
		el.ctaYes.addEventListener('click', async function () {
			const { data } = await api('POST', defaultLandingUrl(), { enable: true, dismiss: true });
			if (data.ok) {
				state.isDefaultLanding = true;
				state.ctaDismissed = true;
				el.cta.hidden = true;
				paintHomeToggle();
				setStatus(t.startOk, false);
			} else {
				setStatus(t.startFail, true);
			}
		});
		el.ctaNo.addEventListener('click', async function () {
			const { data } = await api('POST', defaultLandingUrl(), { enable: false, dismiss: true });
			if (data.ok) {
				state.ctaDismissed = true;
				el.cta.hidden = true;
			} else {
				setStatus(t.startFail, true);
			}
		});
	}

	function restoreFocus() {
		if (focusReturn && typeof focusReturn.focus === 'function') {
			focusReturn.focus();
		}
		focusReturn = null;
	}

	if (el.editToggle) {
		el.editToggle.addEventListener('click', function () {
			editing = !editing;
			render();
			if (openFolderId && el.folderDialog.open) {
				const folder = state.layout.items.find(function (it) {
					return it.type === 'folder' && it.id === openFolderId;
				});
				if (folder) {
					paintFolderDialog(folder);
				}
			}
		});
	}
	if (el.homeToggle) {
		el.homeToggle.addEventListener('click', function () {
			toggleDefaultLanding();
		});
	}
	if (el.newFolder) {
		el.newFolder.addEventListener('click', function () {
			createEmptyFolder();
		});
	}
	if (el.hiddenAppsBtn) {
		el.hiddenAppsBtn.addEventListener('click', function () {
			openHiddenDialog();
		});
	}
	if (el.hiddenClose) {
		el.hiddenClose.addEventListener('click', function () { el.hiddenDialog.close(); });
	}
	if (el.hiddenCancel) {
		el.hiddenCancel.addEventListener('click', function () { el.hiddenDialog.close(); });
	}
	if (el.hiddenDialog) {
		el.hiddenDialog.addEventListener('close', function () {
			restoreFocus();
		});
	}
	if (el.folderClose) {
		el.folderClose.addEventListener('click', function () { el.folderDialog.close(); });
	}
	el.folderDialog.addEventListener('close', function () {
		openFolderId = null;
		restoreFocus();
	});
	el.promptDialog.addEventListener('close', function () {
		restoreFocus();
	});
	if (el.folderPickerCancel) {
		el.folderPickerCancel.addEventListener('click', function () { el.folderPicker.close(); });
	}
	el.folderPicker && el.folderPicker.addEventListener('close', function () {
		restoreFocus();
	});
	el.confirmDialog && el.confirmDialog.addEventListener('close', function () {
		restoreFocus();
	});

	document.addEventListener('keydown', function (ev) {
		if (ev.key === 'Escape' && el.folderDialog.open) {
			el.folderDialog.close();
		}
	});

	window.addEventListener('beforeunload', function (ev) {
		if (!dirty && !saveTimer) {
			return;
		}
		ev.preventDefault();
		ev.returnValue = '';
		flushSave();
	});
	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState === 'hidden' && (dirty || saveTimer)) {
			flushSave();
		}
	});

	setupCta();
	paintGreeting();
	render();
	if (state.apporderSynced === false) {
		scheduleAppOrderRetry();
	}
})();
