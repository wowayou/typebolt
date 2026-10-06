'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../src/shared/storage.js');
const P = require('../../src/shared/starter-pack.js');
const E = require('../../src/shared/engine.js');

test('applyUsage: accumulates per snippet and total, does not mutate input', () => {
  const s0 = S.defaultStats();
  const s1 = S.applyUsage(s0, 'a', 10, 100);
  const s2 = S.applyUsage(s1, 'a', 5, 200);
  const s3 = S.applyUsage(s2, 'b', -4, 300);
  assert.deepEqual(s0, S.defaultStats());
  assert.deepEqual(s3.total, { uses: 3, charsSaved: 15 });
  assert.deepEqual(s3.bySnippet.a, { uses: 2, charsSaved: 15, lastUsedAt: 200 });
  assert.deepEqual(s3.bySnippet.b, { uses: 1, charsSaved: 0, lastUsedAt: 300 });
});

test('applyUsage: tolerates garbage stats', () => {
  const s = S.applyUsage({ total: 'x' }, 'a', 3, 1);
  assert.equal(s.total.uses, 1);
  assert.equal(S.applyUsage(undefined, 'a', 3, 1).total.charsSaved, 3);
});

test('AC29 buildInstallPatch: fresh install writes starter pack + defaults', () => {
  const patch = S.buildInstallPatch({}, 'install', P.getPack('en-US'), 123);
  assert.equal(patch.snippets.length, P.EN.length);
  assert.equal(patch.snippets[0].shortcut, ';thx');
  assert.ok(patch.snippets.every((s) => s.id && s.createdAt === 123 && s.updatedAt === 123));
  assert.deepEqual(patch.settings, { enabled: true, disabledSites: [] });
  assert.deepEqual(patch.stats, { total: { uses: 0, charsSaved: 0 }, bySnippet: {} });
  assert.deepEqual(patch.meta, { schemaVersion: 1, installedAt: 123 });
  assert.equal(new Set(patch.snippets.map((s) => s.id)).size, patch.snippets.length);
});

test('AC29 buildInstallPatch: zh pack chosen by language', () => {
  assert.equal(P.getPack('zh-CN')[0].shortcut, P.ZH[0].shortcut);
  assert.equal(P.getPack('zh')[0].shortcut, P.ZH[0].shortcut);
  assert.equal(P.getPack('fr')[0].shortcut, P.EN[0].shortcut);
});

test('AC29 buildInstallPatch: never overwrites existing data', () => {
  const existing = {
    snippets: [{ id: 'x', name: 'Mine', shortcut: ';mine', content: 'm', createdAt: 1, updatedAt: 1 }],
    settings: { enabled: false, disabledSites: ['a.com'] },
    stats: { total: { uses: 9, charsSaved: 99 }, bySnippet: {} },
    meta: { schemaVersion: 1, installedAt: 5 },
  };
  assert.deepEqual(S.buildInstallPatch(existing, 'install', P.getPack('en'), 1), {});
  assert.deepEqual(S.buildInstallPatch(existing, 'update', null, 1), {});
});

test('AC29 buildInstallPatch: update never injects starter snippets, install keeps user snippets', () => {
  const patch = S.buildInstallPatch({}, 'update', P.getPack('en'), 1);
  assert.deepEqual(patch.snippets, []);
  const kept = S.buildInstallPatch({ snippets: [{ id: 'x' }] }, 'install', P.getPack('en'), 1);
  assert.equal(kept.snippets, undefined);
});

for (const [name, pack] of [['en', P.EN], ['zh', P.ZH]]) {
  test(`starter pack ${name}: valid, prefix-free, ; prefix, has AI templates`, () => {
    assert.ok(pack.length >= 8 && pack.length <= 12);
    const accepted = [];
    for (const s of pack) {
      assert.ok(s.shortcut.startsWith(';'), s.shortcut);
      assert.deepEqual(E.validateSnippet(s, accepted), [], s.shortcut);
      accepted.push(s);
    }
    assert.ok(pack.some((s) => E.getInputFields(s.content).length > 0 && s.content.includes('{cursor}')));
    assert.ok(pack.some((s) => /\{(date|time)/.test(s.content)));
  });
}

test('normalizeSettings / normalizeStats fill defaults', () => {
  assert.deepEqual(S.normalizeSettings({ enabled: false }), { enabled: false, disabledSites: [] });
  assert.deepEqual(S.normalizeSettings(null), { enabled: true, disabledSites: [] });
  assert.deepEqual(S.normalizeStats(null), S.defaultStats());
});
