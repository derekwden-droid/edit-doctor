import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKSLASH,
  describeChar,
  describeRun,
  escapeFor,
  normalize,
  originalSpan,
  plainForm,
} from '../scripts/lib/normalize.mjs';

// Strings are built from code points so this file never holds the characters it tests.
const ch = (...cps) => String.fromCodePoint(...cps);

test('collapses whitespace runs and drops it at line edges', () => {
  assert.equal(normalize('  a \t b  \n\tc  ').text, 'a b\nc');
  assert.equal(normalize('x' + ch(0xa0) + 'y').text, 'x y');
});

test('turns CRLF and lone CR into LF', () => {
  assert.equal(normalize('a\r\nb\rc').text, 'a\nb\nc');
});

test('drops invisible characters', () => {
  assert.equal(normalize('a' + ch(0x200b) + 'b' + ch(0xfeff) + ch(0x202e) + 'c').text, 'abc');
});

test('maps typographic quotes, dashes and ellipses to ASCII', () => {
  const text = ch(0x201c) + 'it' + ch(0x2019) + 's' + ch(0x201d) + ' 1' + ch(0x2013) + '2' + ch(0x2026);
  assert.equal(normalize(text).text, '"it\'s" 1-2...');
});

test('maps every normalized character back to its source', () => {
  const text = '\tfoo  ' + ch(0x2026) + '\r\nbar';
  const norm = normalize(text);
  assert.equal(norm.text, 'foo ...\nbar');
  assert.deepEqual(originalSpan(norm, text, 0, 3), [1, 4]);
  assert.deepEqual(originalSpan(norm, text, 4, 3), [6, 7]);
  assert.deepEqual(originalSpan(norm, text, 0, norm.text.length), [1, text.length]);
});

test('keeps characters above U+FFFF intact', () => {
  const text = 'a ' + ch(0x1f600) + ' b';
  const norm = normalize(text);
  assert.equal(norm.text, text);
  assert.deepEqual(originalSpan(norm, text, 2, 2), [2, 4]);
});

test('describes characters and whitespace runs', () => {
  assert.equal(describeChar(9), 'a tab');
  assert.equal(describeChar(0x41), '`A`');
  assert.equal(describeChar(0xa0), 'U+00A0 NO-BREAK SPACE');
  assert.equal(describeRun('\t'), '1 tab');
  assert.equal(describeRun('    '), '4 spaces');
  assert.equal(describeRun('\t\t  '), '2 tabs and 2 spaces');
  assert.equal(describeRun(''), 'nothing');
  assert.equal(describeRun(ch(0xa0)), '1x U+00A0 NO-BREAK SPACE');
});

test('spells escapes the way Claude Code decodes them', () => {
  assert.equal(escapeFor(0xa0), BACKSLASH + 'u00a0');
  assert.equal(escapeFor(0x1f600), BACKSLASH + 'ud83d' + BACKSLASH + 'ude00');
  assert.equal(plainForm(0x2014), '-');
  assert.equal(plainForm(0x41), null);
});
