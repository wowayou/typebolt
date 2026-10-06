'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../src/shared/engine.js');

// Fixed local-time date: Wed 2026-03-04 05:06:07
const NOW = new Date(2026, 2, 4, 5, 6, 7);

test('parseTemplate: recognises placeholders and keeps other braces literal', () => {
  const t = E.parseTemplate('a{cursor}b{date}{time:HH}{input:Name} function() { x }');
  assert.deepEqual(t.map((x) => x.type), ['text', 'cursor', 'text', 'date', 'time', 'input', 'text']);
  assert.equal(t[3].format, 'YYYY-MM-DD');
  assert.equal(t[4].format, 'HH');
  assert.equal(t[5].label, 'Name');
  assert.equal(t[6].value, ' function() { x }');
});

test('parseTemplate: unknown/empty placeholders stay literal', () => {
  const r = E.renderTemplate('{foo} {input:} {x:1} {}', { now: NOW });
  assert.equal(r.text, '{foo} {input:} {x:1} {}');
});

test('getInputFields: unique, first-occurrence order', () => {
  assert.deepEqual(E.getInputFields('{input:Name} {input:Day} {input:Name}'), ['Name', 'Day']);
  assert.deepEqual(E.getInputFields('none'), []);
});

test('AC5 formatDate: default and custom formats', () => {
  assert.equal(E.renderTemplate('{date}', { now: NOW }).text, '2026-03-04');
  assert.equal(E.renderTemplate('{time}', { now: NOW }).text, '05:06');
  assert.equal(E.formatDate(NOW, 'YYYY年MM月DD日', 'zh-CN'), '2026年03月04日');
  assert.equal(E.formatDate(NOW, 'YY/M/D H:mm:ss', 'en'), '26/3/4 5:06:07');
  assert.equal(E.formatDate(NOW, 'dddd', 'en'), 'Wednesday');
  assert.equal(E.formatDate(NOW, 'dddd', 'zh-CN'), '星期三');
  assert.equal(E.formatDate(NOW, 'dddd, YYYY', 'en'), 'Wednesday, 2026');
  // Non-token characters stay as they are; longest token wins.
  assert.equal(E.formatDate(NOW, 'MMM', 'en'), '033');
  assert.equal(E.formatDate(NOW, 'YYYYY', 'en'), '2026Y');
});

test('renderTemplate: cursor offset, only first cursor counts', () => {
  const r = E.renderTemplate('Hi {cursor}there{cursor}!', { now: NOW });
  assert.equal(r.text, 'Hi there!');
  assert.equal(r.cursorOffset, 3);
  assert.equal(E.renderTemplate('plain', {}).cursorOffset, null);
});

test('renderTemplate: cursor offset accounts for earlier expansions', () => {
  const r = E.renderTemplate('{date} {cursor}', { now: NOW });
  assert.equal(r.cursorOffset, '2026-03-04 '.length);
});

test('renderTemplate: inputs shared by label, missing -> empty, formatter for previews', () => {
  const r = E.renderTemplate('{input:A}-{input:B}-{input:A}', { inputs: { A: 'x', B: 'y' } });
  assert.equal(r.text, 'x-y-x');
  assert.equal(E.renderTemplate('{input:A}', {}).text, '');
  assert.equal(E.renderTemplate('{input:A}', { inputFormatter: (l) => `[${l}]` }).text, '[A]');
});

const snip = (id, shortcut, content = 'c') => ({ id, name: id, shortcut, content });

test('AC6/AC7 findMatch: longest match, boundary rule', () => {
  const idx = E.buildIndex([snip('a', ';thx'), snip('b', 'x;ty'), snip('c', ';a;b')]);
  assert.equal(E.findMatch('hello ;thx', idx).snippet.id, 'a');
  assert.equal(E.findMatch(';thx', idx).snippet.id, 'a');
  assert.equal(E.findMatch('你好;thx', idx).snippet.id, 'a');
  assert.equal(E.findMatch('hi\n;thx', idx).snippet.id, 'a');
  assert.equal(E.findMatch('abc;thx', idx), null);
});

test('findMatch: boundary char is the one before the shortcut (underscore blocks)', () => {
  const idx = E.buildIndex([snip('a', ';thx')]);
  assert.equal(E.findMatch('_;thx', idx), null);
  assert.equal(E.findMatch('9;thx', idx), null);
  assert.equal(E.findMatch('.;thx', idx).snippet.id, 'a');
});

test('findMatch: picks the longest candidate that satisfies boundary', () => {
  // ";bc" and "c;bc" cannot coexist by validation, but the engine must still be longest-first.
  const idx = E.buildIndex([snip('s', 'bc'), snip('l', 'abc')]);
  assert.equal(E.findMatch('xx abc', idx).snippet.id, 'l');
  assert.equal(E.findMatch('xx bc', idx).snippet.id, 's');
});

test('findMatch: case sensitive, empty index, no match', () => {
  const idx = E.buildIndex([snip('a', ';Thx')]);
  assert.equal(E.findMatch(';thx', idx), null);
  assert.equal(E.findMatch(';Thx', E.buildIndex([])), null);
  assert.equal(E.findMatch('', idx), null);
});

test('findMatch: astral-plane shortcuts', () => {
  const idx = E.buildIndex([snip('e', ';😀')]);
  assert.equal(E.findMatch('ok ;😀', idx).snippet.id, 'e');
});

test('AC6 validateSnippet: error codes', () => {
  const all = [snip('1', ';thx'), snip('2', ';brb')];
  const ok = { shortcut: ';new', content: 'x' };
  assert.deepEqual(E.validateSnippet(ok, all), []);
  assert.deepEqual(E.validateSnippet({ shortcut: '', content: 'x' }, all), ['shortcut_empty']);
  assert.deepEqual(E.validateSnippet({ shortcut: 'x', content: 'x' }, all), ['shortcut_too_short']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';' + 'a'.repeat(32), content: 'x' }, all), ['shortcut_too_long']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';' + 'a'.repeat(31), content: 'x' }, all), []);
  assert.deepEqual(E.validateSnippet({ shortcut: ';a b', content: 'x' }, all), ['shortcut_whitespace']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';thx', content: 'x' }, all), ['shortcut_duplicate']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';th', content: 'x' }, all), ['prefix_conflict']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';thxx', content: 'x' }, all), ['prefix_conflict']);
  assert.deepEqual(E.validateSnippet({ shortcut: ';new', content: '  \n' }, all), ['content_empty']);
  assert.deepEqual(E.validateSnippet({ shortcut: '', content: '' }, all), ['shortcut_empty', 'content_empty']);
});

test('validateSnippet: editing a snippet ignores itself', () => {
  const all = [snip('1', ';thx'), snip('2', ';brb')];
  assert.deepEqual(E.validateSnippet({ id: '1', shortcut: ';thx', content: 'y' }, all), []);
  assert.deepEqual(E.validateSnippet({ id: '1', shortcut: ';thxx', content: 'y' }, all), []);
  assert.deepEqual(E.validateSnippet({ id: '1', shortcut: ';brb', content: 'y' }, all), ['shortcut_duplicate']);
});

test('validateSnippet: shortcut length counts code points', () => {
  assert.deepEqual(E.validateSnippet({ shortcut: ';😀', content: 'x' }, []), []);
  assert.deepEqual(E.validateSnippet({ shortcut: '😀', content: 'x' }, []), ['shortcut_too_short']);
});

test('AC25 validateImport', () => {
  const existing = [snip('1', ';thx')];
  const file = {
    format: 'typebolt', version: 1, exportedAt: 'x',
    snippets: [
      { name: 'New', shortcut: ';new', content: 'n' },
      { name: 'Dup', shortcut: ';thx', content: 'd' },
      { name: 'Pref', shortcut: ';ne', content: 'p' }, // conflicts with just-added ;new
      { name: 'Empty', shortcut: ';emp', content: '' },
      { shortcut: ';noname', content: 'z' },
      'junk',
      { shortcut: 5, content: 'x' },
    ],
  };
  const r = E.validateImport(file, existing);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.toAdd.map((s) => s.shortcut), [';new', ';noname']);
  assert.equal(r.toAdd[1].name, ';noname');
  assert.deepEqual(r.skipped.map((s) => s.reason), [
    'shortcut_duplicate', 'prefix_conflict', 'content_empty', 'invalid_item', 'invalid_item',
  ]);
});

test('validateImport: errors for invalid JSON / format', () => {
  assert.equal(E.validateImport('{not json', []).error, 'invalid_json');
  assert.equal(E.validateImport('{"format":"other","version":1,"snippets":[]}', []).error, 'invalid_format');
  assert.equal(E.validateImport({ format: 'typebolt', version: 2, snippets: [] }, []).error, 'invalid_format');
  assert.equal(E.validateImport({ format: 'typebolt', version: 1 }, []).error, 'invalid_format');
  assert.equal(E.validateImport([], []).error, 'invalid_format');
  assert.equal(E.validateImport(null, []).error, 'invalid_format');
  assert.equal(E.validateImport('{"format":"typebolt","version":1,"snippets":[]}', []).error, undefined);
});

test('buildExport shape', () => {
  const out = E.buildExport([{ id: 'x', name: 'N', shortcut: ';n', content: 'c', createdAt: 1, updatedAt: 2 }], new Date('2026-01-02T03:04:05Z'));
  assert.deepEqual(out, {
    format: 'typebolt', version: 1, exportedAt: '2026-01-02T03:04:05.000Z',
    snippets: [{ name: 'N', shortcut: ';n', content: 'c' }],
  });
});

test('AC26 normalizeSite', () => {
  assert.equal(E.normalizeSite('https://www.Example.com/path'), 'www.example.com');
  assert.equal(E.normalizeSite('  Example.COM  '), 'example.com');
  assert.equal(E.normalizeSite('example.com:8080/x?y#z'), 'example.com');
  assert.equal(E.normalizeSite('*.example.com'), 'example.com');
  assert.equal(E.normalizeSite('localhost'), 'localhost');
  assert.equal(E.normalizeSite('http://127.0.0.1:3000/a'), '127.0.0.1');
  assert.equal(E.normalizeSite(''), null);
  assert.equal(E.normalizeSite('a b'), null);
  assert.equal(E.normalizeSite('chrome://extensions'), null);
  assert.equal(E.normalizeSite('ftp://example.com'), null);
  assert.equal(E.normalizeSite('exa mple'), null);
  assert.equal(E.normalizeSite('bad_host!.com'), null);
  assert.equal(E.normalizeSite(null), null);
});

test('AC26 isSiteDisabled: exact + subdomain, not suffix lookalikes', () => {
  const list = ['example.com', 'https://Foo.org/x'];
  assert.equal(E.isSiteDisabled('example.com', list), true);
  assert.equal(E.isSiteDisabled('mail.example.com', list), true);
  assert.equal(E.isSiteDisabled('notexample.com', list), false);
  assert.equal(E.isSiteDisabled('foo.org', list), true);
  assert.equal(E.isSiteDisabled('bar.org', list), false);
  assert.equal(E.isSiteDisabled('', list), false);
  assert.equal(E.isSiteDisabled('example.com', []), false);
  assert.equal(E.isSiteDisabled('www.example.com', ['www.example.com']), true);
  assert.equal(E.isSiteDisabled('example.com', ['www.example.com']), false);
});

test('misc helpers', () => {
  assert.equal(E.charsSaved('hello world', ';hw'), 8);
  assert.equal(E.charsSaved('ab', ';thx'), 0);
  assert.equal(E.minutesSaved(500), 3);
  assert.equal(E.minutesSaved(0), 0);
  const list = [snip('a', ';thx', 'Thanks a lot'), { id: 'b', name: 'Meeting', shortcut: ';mt', content: 'x' }];
  assert.deepEqual(E.filterSnippets(list, 'LOT').map((s) => s.id), ['a']);
  assert.deepEqual(E.filterSnippets(list, 'meet').map((s) => s.id), ['b']);
  assert.deepEqual(E.filterSnippets(list, ';mt').map((s) => s.id), ['b']);
  assert.equal(E.filterSnippets(list, '').length, 2);
});
