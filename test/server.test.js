const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('bundle output exists and is non-empty', () => {
  const distPath = path.join(__dirname, '..', 'dist', 'extension.js');
  assert.ok(fs.existsSync(distPath), 'dist/extension.js should exist');
  const content = fs.readFileSync(distPath, 'utf8');
  assert.ok(content.length > 1000, 'dist/extension.js should have content');
  assert.ok(content.includes('LanguageClient'), 'bundle should include LanguageClient');
});

test('package.json contains all required activation events and configurations', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.strictEqual(pkg.name, 'vscode-htmx');
  assert.strictEqual(pkg.main, './dist/extension.js');
  assert.ok(pkg.activationEvents.includes('onLanguage:html'));
  assert.ok(pkg.activationEvents.includes('onLanguage:jinja'));
  assert.ok(pkg.activationEvents.includes('onLanguage:blade'));
  assert.ok(pkg.activationEvents.includes('onLanguage:templ'));
  assert.ok(pkg.activationEvents.includes('onLanguage:astro'));
  assert.ok(pkg.activationEvents.includes('onLanguage:svelte'));

  assert.ok(pkg.contributes.configuration.properties['htmx.server.path']);
  assert.ok(pkg.contributes.configuration.properties['htmx.diagnostics.enable']);
});
