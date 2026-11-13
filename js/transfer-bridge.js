/**
 * Bridge for the shared transfer page (apps/_shared/config-transfer):
 * exposes the window.HomeCheckApi / window.HomeCheckMessaging contract the
 * synced js/transfer.js expects, in HomeCheck's own API envelope
 * ({success:true,data} / {success:false,error,context}). App-specific —
 * not synced.
 */
(function () {
	'use strict';
	function requestToken() {
		return (window.OC && OC.requestToken) || '';
	}
	async function parse(resp) {
		const j = await resp.json().catch(() => null);
		if (!resp.ok || (j && (j.ok === false || j.success === false))) {
			const errObj = j && j.error;
			throw {
				code: (errObj && (errObj.code || errObj)) || 'SERVER_ERROR',
				context: (j && j.context) || {},
			};
		}
		return j && Object.prototype.hasOwnProperty.call(j, 'data') ? j.data : j;
	}
	window.HomeCheckApi = {
		url(path) {
			return OC.generateUrl('/apps/homecheck' + path);
		},
		async get(path, params) {
			let u = this.url(path);
			if (params) {
				const q = Object.keys(params)
					.filter((k) => params[k] !== undefined && params[k] !== null)
					.map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
					.join('&');
				if (q) u += '?' + q;
			}
			return parse(await fetch(u, { credentials: 'same-origin' }));
		},
		async post(path, body) {
			return parse(await fetch(this.url(path), {
				method: 'POST', credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json', requesttoken: requestToken() },
				body: JSON.stringify(body || {}),
			}));
		},
		async upload(path, file, extra) {
			const fd = new FormData();
			fd.append('file', file);
			if (extra) {
				Object.keys(extra).forEach((k) => fd.append(k, extra[k]));
			}
			return parse(await fetch(this.url(path), {
				method: 'POST', credentials: 'same-origin',
				headers: { requesttoken: requestToken() },
				body: fd,
			}));
		},
	};
	// Messaging: the synced transfer.js asks for .alert/.polite — route both
	// through the app-owned .hmk-toast announcer (visible, deduped) and
	// always mirror into the hmk-transfer-result-live status region the
	// synced part renders. OC.Notification is gone from NC>=31 bundles —
	// an OC.Notification-only path leaves sighted users with zero feedback
	// (dead_platform_toast_api).
	const t = (s) => (window.OC && OC.L10N && OC.L10N.translate)
		? OC.L10N.translate('homecheck', s) : s;
	let toastContainer = null;
	function ensureToastContainer() {
		if (toastContainer && document.body.contains(toastContainer)) {
			return toastContainer;
		}
		toastContainer = document.createElement('div');
		toastContainer.className = 'hmk-toasts';
		toastContainer.id = 'hmk-toasts';
		document.body.appendChild(toastContainer);
		return toastContainer;
	}
	function toast(text, kind) {
		const k = kind === 'error' ? 'error' : 'success';
		const container = ensureToastContainer();
		// Dedup on kind+text with timer reset — identical toasts must not
		// stack (rapid retries, repeated API failures).
		const dedupKey = k + '|' + String(text);
		const existing = container.querySelectorAll('.hmk-toast[data-hmk-toast-key]');
		for (const prev of existing) {
			if (prev.getAttribute('data-hmk-toast-key') === dedupKey) {
				if (prev._hmkDismissTimer) window.clearTimeout(prev._hmkDismissTimer);
				prev._hmkDismissTimer = window.setTimeout(() => prev.remove(), k === 'error' ? 7000 : 4000);
				return;
			}
		}
		const toastEl = document.createElement('div');
		toastEl.className = 'hmk-toast hmk-toast--' + k;
		toastEl.setAttribute('role', k === 'error' ? 'alert' : 'status');
		toastEl.setAttribute('data-hmk-toast-key', dedupKey);
		const content = document.createElement('span');
		content.className = 'hmk-toast__content';
		const msgText = document.createElement('span');
		msgText.className = 'hmk-toast__text';
		msgText.textContent = String(text);
		content.appendChild(msgText);
		if (k === 'error') {
			// §13 family contract: error toasts offer a "Report this
			// problem" mailto when the shared feedback pack is loaded.
			try {
				const feedback = window.SbdAppFeedback;
				if (feedback && typeof feedback.buildMailto === 'function') {
					const link = document.createElement('a');
					link.className = 'hmk-toast__report';
					link.href = feedback.buildMailto('problem', {});
					link.textContent = t('Report this problem');
					content.appendChild(link);
				}
			} catch (e) { /* never break the toast */ }
		}
		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'hmk-toast__close';
		close.setAttribute('aria-label', t('Close'));
		close.textContent = '✕';
		close.addEventListener('click', () => toastEl.remove());
		toastEl.appendChild(content);
		toastEl.appendChild(close);
		container.appendChild(toastEl);
		toastEl._hmkDismissTimer = window.setTimeout(() => toastEl.remove(), k === 'error' ? 7000 : 4000);
	}
	function live(text) {
		const el = document.getElementById('hmk-transfer-result-live');
		if (el) el.textContent = text;
	}
	function announce(text, kind) {
		try {
			toast(text, kind);
		} catch (e) { /* live-region write below still lands */ }
		live(text);
	}
	window.HomeCheckMessaging = {
		announce,
		toast,
		alert(text) { announce(text, 'error'); },
		polite(text) { announce(text, 'success'); },
	};
})();
