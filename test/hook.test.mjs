// Runs scripts/edit-doctor.mjs the way Claude Code does: PostToolBatch input as JSON on
// stdin, reply as JSON on stdout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { responseText } from '../scripts/lib/hook.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/edit-doctor.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-doctor-hook-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function file(name, text) {
  const p = path.join(root, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

function run(input) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot },
  });
  return { status: result.status, stderr: result.stderr, reply: result.stdout ? JSON.parse(result.stdout) : null };
}

function batch(...calls) {
  return { hook_event_name: 'PostToolBatch', cwd: root, tool_calls: calls };
}

const notFound = (s) => '<tool_use_error>String to replace not found in file.\nString: ' + s + '</tool_use_error>';

test('explains an Edit whose old_string has the wrong indentation', () => {
  const target = file('tabs.py', 'def f():\n\treturn 1\n');
  const old = '    return 1';
  const { status, reply } = run(batch({
    tool_name: 'Edit',
    tool_use_id: 'toolu_1',
    tool_input: { file_path: target, old_string: old, new_string: '    return 2', replace_all: false },
    tool_response: notFound(old),
  }));
  assert.equal(status, 0);
  assert.equal(reply.hookSpecificOutput.hookEventName, 'PostToolBatch');
  assert.match(reply.hookSpecificOutput.additionalContext, /The file has 1 tab; your old_string has 4 spaces/);
});

test('explains an Edit whose old_string matches more than once', () => {
  const target = file('dupes.txt', 'a = 1\nb = 2\na = 1\n');
  const { reply } = run(batch({
    tool_name: 'Edit',
    tool_input: { file_path: target, old_string: 'a = 1', new_string: 'a = 3' },
    tool_response: '<tool_use_error>Found 2 matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true.\nString: a = 1</tool_use_error>',
  }));
  assert.match(reply.hookSpecificOutput.additionalContext, /appears 2 times/);
});

test('suggests the file a Read or Edit probably meant', () => {
  file('src/util/format.ts', 'export {};\n');
  const missing = 'File does not exist. Note: your current working directory is ' + root + '.';
  const { reply } = run(batch(
    { tool_name: 'Read', tool_input: { file_path: path.join(root, 'src/utils/format.ts') }, tool_response: missing },
    { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src/util/fromat.ts'), old_string: 'a', new_string: 'b' }, tool_response: '<tool_use_error>' + missing + '</tool_use_error>' },
  ));
  const context = reply.hookSpecificOutput.additionalContext;
  assert.match(context, /Read could not find src[\\/]utils[\\/]format\.ts/);
  assert.match(context, /Edit could not find src[\\/]util[\\/]fromat\.ts/);
  assert.match(context, /- src[\\/]util[\\/]format\.ts \(same name\)/);
  assert.match(context, /- src[\\/]util[\\/]format\.ts \(similar name\)/);
});

test('handles results that arrive as content blocks', () => {
  const target = file('blocks.js', 'let x = 1;   \n');
  const { reply } = run(batch({
    tool_name: 'Edit',
    tool_input: { file_path: target, old_string: 'let x = 1;\n', new_string: 'let x = 2;\n' },
    tool_response: [{ type: 'text', text: notFound('let x = 1;') }],
  }));
  assert.match(reply.hookSpecificOutput.additionalContext, /3 spaces at the end of the line/);
  assert.equal(responseText({ content: [{ type: 'text', text: 'hi' }] }), 'hi');
  assert.equal(responseText({ error: 'boom' }), 'boom');
});

test('stays quiet for successful calls and for files that only mention the errors', () => {
  const doc = file('notes.md', 'If you see "File does not exist" or "String to replace not found in file", read on.\n');
  const { status, reply } = run(batch(
    { tool_name: 'Read', tool_input: { file_path: doc }, tool_response: '1\tIf you see "File does not exist" ...' },
    { tool_name: 'Edit', tool_input: { file_path: doc, old_string: 'read on', new_string: 'keep reading' }, tool_response: 'The file ' + doc + ' has been updated successfully.' },
    { tool_name: 'Bash', tool_input: { command: 'cat missing' }, tool_response: 'File does not exist' },
  ));
  assert.equal(status, 0);
  assert.equal(reply, null);
});

test('stays quiet when the path exists after all or nothing resembles it', () => {
  const real = file('real.txt', 'x\n');
  const missing = 'File does not exist.';
  assert.equal(run(batch({ tool_name: 'Read', tool_input: { file_path: real }, tool_response: missing })).reply, null);
  assert.equal(run(batch({ tool_name: 'Read', tool_input: { file_path: path.join(root, 'qqqqqqqq.zz') }, tool_response: missing })).reply, null);
});

test('stays quiet for a batch without tool calls', () => {
  assert.equal(run({ hook_event_name: 'PostToolBatch', cwd: root, tool_calls: [] }).reply, null);
});

test('fails open with status 1 on unreadable input that looks relevant', () => {
  const bad = run('{ "tool_response": "File does not exist"');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^edit-doctor: /);
});
