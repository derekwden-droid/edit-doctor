import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKSLASH } from '../scripts/lib/normalize.mjs';
import { closestLines, diagnoseMultiple, diagnoseNotFound, explainDifferences, findLoose } from '../scripts/lib/diagnose.mjs';

const ch = (...cps) => String.fromCodePoint(...cps);

test('finds old_string despite different indentation and widens to the indentation', () => {
  const file = 'def f():\n\treturn compute(1, 2)\n';
  const spans = findLoose(file, '    return compute(1, 2)');
  assert.deepEqual(spans, [[9, 30]]);
  assert.equal(file.slice(9, 30), '\treturn compute(1, 2)');
});

test('explains tab and space differences with line numbers', () => {
  const { items, seen } = explainDifferences('    return x', '\treturn x', 7);
  assert.deepEqual(items, ['line 7: the leading whitespace differs. The file has 1 tab; your old_string has 4 spaces.']);
  assert.equal(seen.tabs, true);
});

test('diagnoses a tab-indented line edited with spaces, and offers a whitespace-free anchor', () => {
  const msg = diagnoseNotFound('def f():\n\treturn compute(1, 2)\n', '    return compute(1, 2)', '/repo/tabs.py');
  assert.match(msg, /^edit-doctor: the Edit to tabs\.py failed/);
  assert.match(msg, /matches line 2 once whitespace/);
  assert.match(msg, /The file has 1 tab; your old_string has 4 spaces/);
  assert.match(msg, /\n```\n\treturn compute\(1, 2\)\n```/);
  assert.match(msg, /real tabs/);
  assert.match(msg, /`return compute\(1, 2\)` appears exactly once/);
});

test('diagnoses trailing whitespace inside a multi-line old_string', () => {
  const msg = diagnoseNotFound('const a = 1;   \nconst b = 2;\n', 'const a = 1;\nconst b = 2;', 'trailing.js');
  assert.match(msg, /line 1: the file has 3 spaces at the end of the line \(`const a = 1;   `\); your old_string has nothing/);
  assert.match(msg, /Keep the whitespace at the ends of those lines/);
});

test('names invisible and look-alike characters and gives their escapes', () => {
  const file = 'const s = "hello' + ch(0xa0) + 'world";\nconst z' + ch(0x200b) + 'w = 1;\n';
  const msg = diagnoseNotFound(file, 'const s = "hello world";\nconst zw = 1;', 'x.js');
  assert.match(msg, /line 1, column 17: the file has 1x U\+00A0 NO-BREAK SPACE where your old_string has 1 space/);
  assert.match(msg, /line 2, column 8: the file has an invisible U\+200B ZERO WIDTH SPACE/);
  assert.ok(msg.includes(BACKSLASH + 'u200b for U+200B'));
  assert.ok(msg.includes(BACKSLASH + 'u00a0 for U+00A0'));
});

test('names typographic punctuation the file uses', () => {
  const msg = diagnoseNotFound('Range: 10' + ch(0x2013) + '20\n', 'Range: 10-20', 'notes.md');
  assert.match(msg, /column 10: the file has U\+2013 EN DASH where your old_string has `-`/);
  assert.match(msg, /Use the same punctuation as the file: U\+2013 EN DASH/);
});

test('works on CRLF files and reports file line numbers', () => {
  const msg = diagnoseNotFound('one\r\ntwo\r\n\tthree\r\n', '  three', 'win.txt');
  assert.match(msg, /matches line 3/);
});

test('recognises text the file spells as escapes', () => {
  const file = 'name = "caf' + BACKSLASH + 'u00e9"\n';
  const msg = diagnoseNotFound(file, 'name = "caf' + ch(0xe9) + '"', 'cfg.py');
  assert.match(msg, /writes the non-ASCII characters of your old_string as backslash-u escapes \(line 1\)/);
});

const CODE = 'function total(items) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item.price * item.qty;\n  }\n  return sum;\n}\n';

test('falls back to the closest lines when the text changed', () => {
  const msg = diagnoseNotFound(CODE, '  for (const item of items) {\n    sum += item.price * item.quantity;\n  }', 'cart.js');
  assert.match(msg, /The closest text is lines 3-5/);
  assert.match(msg, /line 4: the file has `\.\.\.ice \* item\.qty;` where your old_string has `\.\.\.ice \* item\.quantity;`/);
  assert.match(msg, /```\n  for \(const item of items\) \{\n    sum \+= item\.price \* item\.qty;\n  \}\n```/);
});

test('finds a single mistyped line inside a longer line', () => {
  const near = closestLines(CODE, 'retrun sum;');
  assert.deepEqual([near.start, near.end], [5, 5]);
});

test('says so when nothing is close, pointing at lines that share a long word', () => {
  assert.match(diagnoseNotFound(CODE, 'class Basket {}', 'cart.js'), /Nothing in the file is close to it\. The text may have been removed/);
  assert.match(diagnoseNotFound(CODE, 'const totalPrice = computeEverything(items);', 'cart.js'), /Nothing in the file is close/);
  const hint = diagnoseNotFound(CODE + '// items are counted elsewhere\n', 'items.forEach(countEverything)', 'cart.js');
  assert.match(hint, /`countEverything`|`items` appears/);
});

test('lists each duplicate with a way to make it unique', () => {
  const msg = diagnoseMultiple('x = 1\ny = 2\nx = 1\n', 'x = 1', '/repo/dupes.txt');
  assert.match(msg, /old_string appears 2 times/);
  assert.match(msg, /set replace_all to true/);
  assert.match(msg, /- line 1: unique if old_string runs 1 line further, to `y = 2`/);
  assert.match(msg, /- line 3: unique if old_string starts 1 line earlier, from `y = 2`/);
});

test('returns nothing for a duplicate count it cannot reproduce', () => {
  assert.equal(diagnoseMultiple('only once\n', 'only once', 'f.txt'), null);
  assert.equal(diagnoseNotFound('anything', '', 'f.txt'), null);
});
