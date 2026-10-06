const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { headless: true },
});
