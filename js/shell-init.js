/**
 * SPDX-FileCopyrightText: 2026 Alexander Mäule <info@software-by-design.de>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Apply design-system shell root class (NC 32–33: #app-content; NC 34+: #content.app-*).
 */
(function () {
	'use strict';
	function shellRoot() {
		var legacy = document.getElementById('app-content');
		if (legacy) {
			return legacy;
		}
		return document.querySelector('#content[class*="app-homecheck"]');
	}
	function apply() {
		var node = shellRoot();
		if (node) {
			node.classList.add('hmk-app');
			return true;
		}
		return false;
	}
	if (!apply()) {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', apply, { once: true });
		} else {
			requestAnimationFrame(apply);
		}
	}
})();
