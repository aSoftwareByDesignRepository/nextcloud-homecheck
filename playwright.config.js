// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './e2e',
	timeout: 60000,
	retries: 0,
	workers: 1,
	use: {
		baseURL: process.env.HOMECHECK_BASE_URL || 'http://localhost:8081',
		trace: 'on-first-retry',
	},
});
