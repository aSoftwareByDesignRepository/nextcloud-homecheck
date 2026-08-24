/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * HomeCheck launcher — accessible cards, folders, keyboard parity, CSRF saves.
 */
(function () {
	'use strict';

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

	/** @type {{layout:any, entries:any[], ctaDismissed:boolean, isDefaultLanding:boolean}} */
	let state = readJsonScript('hmk-initial-state', {
		layout: { version: 1, revision: 0, items: [] },
		entries: [],
		ctaDismissed: true,
		isDefaultLanding: false,
	});
	if (!state.layout || !Array.isArray(state.layout.items)) {
		state.layout = { version: 1, revision: 0, items: [] };
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
		renameFolder: 'Rename folder',
		deleteFolder: 'Delete folder',
		confirmDeleteFolder: 'Delete this folder? Apps inside return to the home grid.',
		saving: 'Saving…',
		saved: 'Saved',
		saveFailed: 'Could not save — try again',
		conflict: 'Someone changed the layout — reloading',
		openFolder: 'Open folder',
		nameFolder: 'Folder name',
		nameInvalid: 'Name must be 1–40 characters',
		nameChars: 'Name has invalid characters',
		moreActions: 'More actions',
		editSubtitle: 'Drag cards to reorder. Tap Done when finished.',
		viewSubtitle: 'Tap a card to open an app.',
		editBanner: 'Editing your apps',
		chooseFolder: 'Choose a folder',
		noFoldersYet: 'No folders yet — a new one will be created.',
		delete: 'Delete',
		rename: 'Rename',
		syncWarn: 'Saved (top-bar sync failed — try again)',
		syncRetrying: 'Retrying top-bar sync…',
		startOk: 'HomeCheck is your start page',
		startFail: 'Could not update start page',
		unsafeLink: 'This app link is not safe to open',
		emptyFolder: 'This folder is empty — add apps from the home grid.',
		limitItems: 'Too many items on the home grid (max 100)',
		limitChildren: 'Too many apps in this folder (max 40)',
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
	/** @type {Promise<void>} */
	let saveChain = Promise.resolve();
	/** @type {HTMLElement|null} */
	let focusReturn = null;
	/** @type {string|null} */
	let openFolderId = null;

	const el = {
		grid: document.getElementById('hmk-grid'),
		empty: document.getElementById('hmk-empty'),
		status: document.getElementById('hmk-status'),
		editToggle: document.getElementById('hmk-edit-toggle'),
		newFolder: document.getElementById('hmk-new-folder'),
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
		subtitle: document.getElementById('hmk-subtitle'),
		editBanner: document.getElementById('hmk-edit-banner'),
		confirmDialog: document.getElementById('hmk-confirm-dialog'),
		confirmMessage: document.getElementById('hmk-confirm-message'),
		confirmOk: document.getElementById('hmk-confirm-ok'),
		confirmCancel: document.getElementById('hmk-confirm-cancel'),
		folderPicker: document.getElementById('hmk-folder-picker'),
		folderPickerList: document.getElementById('hmk-folder-picker-list'),
		folderPickerCancel: document.getElementById('hmk-folder-picker-cancel'),
	};

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

	function reorderInsertIndex(from, to) {
		if (from < 0 || to < 0 || from === to) {
			return to;
		}
		// After splice(from,1), indices to the right of `from` shift left by 1.
		return from < to ? to - 1 : to;
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

	function buildIcon(entry) {
		const wrap = document.createElement('div');
		wrap.className = 'hmk-card__icon';
		wrap.setAttribute('aria-hidden', 'true');
		if (entry && entry.icon && isSafeHref(entry.icon)) {
			const img = document.createElement('img');
			img.src = entry.icon;
			img.alt = '';
			img.loading = 'lazy';
			img.addEventListener('error', function () {
				wrap.textContent = '';
				const span = document.createElement('span');
				span.className = 'hmk-card__icon-fallback';
				span.textContent = iconLetter(entry.name);
				wrap.appendChild(span);
			});
			wrap.appendChild(img);
		} else {
			const span = document.createElement('span');
			span.className = 'hmk-card__icon-fallback';
			span.textContent = iconLetter(entry ? entry.name : '?');
			wrap.appendChild(span);
		}
		return wrap;
	}

	function buildFolderIcon(folder) {
		const wrap = document.createElement('div');
		wrap.className = 'hmk-card__icon';
		wrap.setAttribute('aria-hidden', 'true');
		const stack = document.createElement('div');
		stack.className = 'hmk-card__stack';
		const kids = (folder.children || []).slice(0, 4);
		kids.forEach(function (cid) {
			const e = entriesById[cid];
			if (e && e.icon && isSafeHref(e.icon)) {
				const img = document.createElement('img');
				img.src = e.icon;
				img.alt = '';
				stack.appendChild(img);
			} else {
				const span = document.createElement('span');
				span.textContent = iconLetter(e ? e.name : cid);
				stack.appendChild(span);
			}
		});
		if (kids.length === 0) {
			const span = document.createElement('span');
			span.className = 'hmk-card__icon-fallback';
			span.textContent = 'F';
			wrap.appendChild(span);
			return wrap;
		}
		wrap.appendChild(stack);
		return wrap;
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
		details.className = 'hmk-card__menu';
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
		} else {
			if (item.type === 'app') {
				menu.appendChild(menuButton(t.newFolder, function () { details.open = false; createFolderWithApp(item.id); }));
				menu.appendChild(menuButton(t.addToFolder, function () { details.open = false; addAppToFolderFlow(item.id); }));
			} else if (item.type === 'folder') {
				menu.appendChild(menuButton(t.rename, function () { details.open = false; renameFolder(item.id); }));
				menu.appendChild(menuButton(t.deleteFolder, function () { details.open = false; deleteFolder(item.id); }));
			}
		}
		details.appendChild(menu);
		details.addEventListener('toggle', function () {
			if (details.open) {
				host.scrollIntoView({ block: 'center', behavior: 'instant' });
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
			el.folderGrid.appendChild(makeCard({ type: 'app', id: cid }, { folderId: folder.id }));
		});
	}

	function openFolder(folder, fromEl) {
		focusReturn = fromEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		paintFolderDialog(folder);
		el.folderDialog.showModal();
		el.folderClose.focus();
	}

	function makeCard(item, opts) {
		opts = opts || {};
		const card = document.createElement('div');
		card.className = 'hmk-card' + (item.type === 'folder' ? ' hmk-card--folder' : '');
		card.setAttribute('role', 'listitem');
		card.dataset.id = item.id;
		card.dataset.type = item.type;

		const launch = document.createElement('button');
		launch.type = 'button';
		launch.className = 'button-vue hmk-card__launch';

		if (item.type === 'folder') {
			launch.appendChild(buildFolderIcon(item));
			const badge = document.createElement('span');
			badge.className = 'hmk-card__badge';
			badge.textContent = String((item.children || []).length);
			card.appendChild(badge);
			const name = document.createElement('span');
			name.className = 'hmk-card__name';
			name.textContent = item.name || t.folder;
			launch.appendChild(name);
			launch.setAttribute('aria-label', (item.name || t.folder) + ', ' + t.openFolder);
			launch.addEventListener('click', function () {
				openFolder(item, launch);
			});
		} else {
			const entry = entriesById[item.id];
			launch.appendChild(buildIcon(entry));
			const name = document.createElement('span');
			name.className = 'hmk-card__name';
			name.textContent = entry ? entry.name : item.id;
			launch.appendChild(name);
			if (editing && !opts.folderId) {
				launch.disabled = true;
				launch.setAttribute('aria-disabled', 'true');
			} else if (editing && opts.folderId) {
				launch.disabled = true;
				launch.setAttribute('aria-disabled', 'true');
			} else {
				launch.addEventListener('click', function () { activateApp(entry); });
			}
		}

		card.appendChild(launch);
		attachEditMenu(card, item, opts);

		if (editing && !opts.folderId) {
			card.draggable = true;
			card.addEventListener('dragstart', function (ev) {
				dragId = item.id;
				ev.dataTransfer.setData('text/plain', item.id);
				ev.dataTransfer.effectAllowed = 'move';
			});
			card.addEventListener('dragend', function () {
				dragId = null;
			});
			card.addEventListener('dragover', function (ev) {
				ev.preventDefault();
				ev.dataTransfer.dropEffect = 'move';
			});
			card.addEventListener('drop', function (ev) {
				ev.preventDefault();
				const fromId = dragId || ev.dataTransfer.getData('text/plain');
				const toId = item.id;
				dragId = null;
				if (!fromId || fromId === toId) {
					return;
				}
				const from = findItemIndex(fromId);
				const to = findItemIndex(toId);
				if (from < 0 || to < 0) {
					return;
				}
				const items = state.layout.items.slice();
				const moved = items.splice(from, 1)[0];
				items.splice(reorderInsertIndex(from, to), 0, moved);
				state.layout.items = items;
				scheduleSave();
				render();
			});
		}

		return card;
	}

	function render() {
		const items = (state.layout && state.layout.items) ? state.layout.items : [];
		el.grid.textContent = '';
		if (items.length === 0) {
			el.empty.hidden = false;
			el.grid.hidden = true;
		} else {
			el.empty.hidden = true;
			el.grid.hidden = false;
			items.forEach(function (item) {
				el.grid.appendChild(makeCard(item));
			});
		}
		root.classList.toggle('is-editing', editing);
		if (el.editToggle) {
			el.editToggle.setAttribute('aria-pressed', editing ? 'true' : 'false');
			el.editToggle.textContent = editing ? t.done : t.edit;
			el.editToggle.classList.toggle('hmk-btn--primary', !editing);
			el.editToggle.classList.toggle('hmk-btn--ghost', editing);
		}
		if (el.newFolder) {
			el.newFolder.hidden = !editing;
		}
		if (el.subtitle) {
			el.subtitle.textContent = editing ? t.editSubtitle : t.viewSubtitle;
		}
		if (el.editBanner) {
			el.editBanner.hidden = !editing;
		}
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
	if (el.newFolder) {
		el.newFolder.addEventListener('click', function () {
			createEmptyFolder();
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
	render();
	if (state.apporderSynced === false) {
		scheduleAppOrderRetry();
	}
})();
