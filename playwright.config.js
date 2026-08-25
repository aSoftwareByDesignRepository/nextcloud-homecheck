// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
	testDir: './e2e',
	timeout: 90000,
	retries: 1,
	workers: 1,
	use: {
		baseURL: process.env.HOMECHECK_BASE_URL || 'http://localhost:8081',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: /capture-store-screenshots\.spec\.js/,
		},
		{
			name: 'chromium-store',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1920, height: 1040 },
				deviceScaleFactor: 1,
			},
			testMatch: /capture-store-screenshots\.spec\.js/,
		},
	],
});
