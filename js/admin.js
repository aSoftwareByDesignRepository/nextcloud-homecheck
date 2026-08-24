/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function () {
	'use strict';
	const root = document.getElementById('hmk-admin');
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

	const t = Object.assign({
		saving: 'Saving…',
		saved: 'Saved',
		saveFailed: 'Save failed',
		invalidJson: 'Invalid JSON',
	}, readJsonScript('hmk-admin-i18n', {}));

	let initial = null;
	try {
		initial = JSON.parse(root.getAttribute('data-hmk-template') || 'null');
	} catch (e) {
		initial = null;
	}
	const ta = document.getElementById('hmk-admin-json');
	const err = document.getElementById('hmk-admin-error');
	const status = document.getElementById('hmk-admin-status');
	const saveBtn = document.getElementById('hmk-admin-save');
	const clearBtn = document.getElementById('hmk-admin-clear');

	ta.value = initial ? JSON.stringify(initial, null, 2) : '';

	function token() {
		return (window.OC && window.OC.requestToken) ? window.OC.requestToken : '';
	}
	function url(path) {
		return (window.OC && window.OC.generateUrl)
			? window.OC.generateUrl(path)
			: '/index.php' + path;
	}

	async function put(template) {
		err.textContent = '';
		status.textContent = t.saving;
		const body = { requesttoken: token(), template: template };
		const res = await fetch(url('/apps/homecheck/api/admin/template'), {
			method: 'PUT',
			credentials: 'same-origin',
			headers: {
				requesttoken: token(),
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
		});
		const data = await res.json().catch(function () { return { ok: false }; });
		if (!data.ok) {
			err.textContent = (data.error && data.error.message) || t.saveFailed;
			status.textContent = '';
			return;
		}
		status.textContent = t.saved;
		ta.value = data.data.template ? JSON.stringify(data.data.template, null, 2) : '';
	}

	saveBtn.addEventListener('click', function () {
		let parsed;
		try {
			parsed = JSON.parse(ta.value || '{}');
		} catch (e) {
			err.textContent = t.invalidJson;
			return;
		}
		put(parsed);
	});
	clearBtn.addEventListener('click', function () {
		put(null);
	});
})();
