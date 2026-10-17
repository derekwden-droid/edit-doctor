// The note edit-doctor adds after an Edit with replace_all, unit-level and through the
// hook script the way Claude Code runs it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enclosingWord, findAll, handleReplaceAll } from '../scripts/lib/replace-all.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/edit-doctor.mjs', import.meta.url));

// PostToolUse input shaped like Claude Code 2.1.299's, measured live.
function edit(originalFile, oldString, newString, replaceAll = true) {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: '/repo/app.js', old_string: oldString, new_string: newString, replace_all: replaceAll },
    tool_response: { filePath: '/repo/app.js', oldString, newString, originalFile, structuredPatch: [], userModified: false, replaceAll },
  };
}

function note(input) {
  const reply = handleReplaceAll(input);
  return reply ? reply.hookSpecificOutput.additionalContext : null;
}

test('findAll matches the way replaceAll does: left to right, no overlaps', () => {
  assert.deepEqual(findAll('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(findAll('foo bar foo', 'foo'), [0, 8]);
  assert.deepEqual(findAll('abc', ''), []);
});

test('enclosingWord finds the word around a match inside a longer word', () => {
  assert.deepEqual(enclosingWord('x = foobar;', 4, 'foo'), { from: 4, to: 10 });
  assert.equal(enclosingWord('x = foo(1);', 4, 'foo'), null);
  assert.equal(enclosingWord('a.foo.b', 2, 'foo'), null);
  // An old_string that starts or ends with punctuation can't be part of a word on that side.
  assert.deepEqual(enclosingWord('xfoo(1)', 1, 'foo('), { from: 0, to: 5 });
  assert.equal(enclosingWord('x(foo)y', 1, '(foo)'), null);
});

test('reports the count and lines, and words that changed inside longer words', () => {
  const text = note(edit('const a = foo(1);\nconst b = foo(2);\n// foo\nconst c = foobar(3);\n', 'foo', 'bar'));
  assert.match(text, /replace_all changed 4 occurrences of "foo" in app\.js, on lines 1, 2, 3, 4\./);
  assert.match(text, /1 of them was inside a longer word/);
  assert.match(text, /- line 4: "foobar" became "barbar"/);
});

test('counts repeats on one line and says nothing about words when all stand alone', () => {
  const text = note(edit('x(1) + x(2)\ny = x\n', 'x', 'z'));
  assert.equal(text, 'edit-doctor: replace_all changed 3 occurrences of "x" in app.js, on lines 1 (2x), 2.');
});

test('reports a word with two matches in it once', () => {
  const text = note(edit('foo foofoo\n', 'foo', 'baz'));
  assert.match(text, /changed 3 occurrences/);
  assert.match(text, /2 of them were inside a longer word/);
  assert.match(text, /- line 1: "foofoo" became "bazbaz"/);
  assert.equal(text.match(/- line/g).length, 1);
});

test('treats letters outside ASCII as word characters', () => {
  const text = note(edit('nom = 1\nnombre = nom\n', 'nom', 'name'));
  assert.match(text, /"nombre" became "namebre"/);
  // Built from a code point so this file stays plain ASCII.
  const cafe = 'caf' + String.fromCharCode(0xe9);
  const accented = note(edit('caf = 1\n' + cafe + ' = caf\n', 'caf', 'shop'));
  assert.match(accented, /1 of them was inside a longer word/);
});

test('notes when line numbers refer to the file before the Edit', () => {
  const text = note(edit('a\nTODO\nb\nTODO\n', 'TODO', 'one\ntwo'));
  assert.match(text, /on lines 2, 4 \(line numbers from before the Edit\)\./);
});

test('lists at most twelve lines', () => {
  const original = Array.from({ length: 20 }, (_, i) => 'v' + i + ' = old').join('\n');
  const text = note(edit(original, 'old', 'new'));
  assert.match(text, /changed 20 occurrences/);
  assert.match(text, /lines 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, and 8 more lines\./);
});

test('stays quiet for a single replacement, a plain Edit, other tools and odd input', () => {
  assert.equal(note(edit('only foo here\n', 'foo', 'bar')), null);
  assert.equal(note(edit('foo foo\n', 'foo', 'bar', false)), null);
  assert.equal(note({ ...edit('foo foo\n', 'foo', 'bar'), tool_name: 'Write' }), null);
  assert.equal(note({ tool_name: 'Edit', tool_input: { replace_all: true }, tool_response: 'ok' }), null);
  assert.equal(note(null), null);
});

test('the hook script prints the note for replace_all and nothing otherwise', () => {
  const run = (input) => spawnSync(process.execPath, [SCRIPT, 'replace-all'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot },
  });
  const hit = run(edit('foo\nfoobar\n', 'foo', 'bar'));
  assert.equal(hit.status, 0);
  const reply = JSON.parse(hit.stdout);
  assert.equal(reply.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(reply.hookSpecificOutput.additionalContext, /changed 2 occurrences/);

  const quiet = run(edit('foo\nfoobar\n', 'foo', 'bar', false));
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
});
