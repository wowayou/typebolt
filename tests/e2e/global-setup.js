'use strict';
// Build the real-editor fixture bundles once before the E2E run (output is gitignored).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  execFileSync('node', ['scripts/build-fixtures.mjs'], { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' });
};
