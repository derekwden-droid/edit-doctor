// What edit-doctor does after each batch of tool calls: find the Edit and Read calls that
// failed in a way it can explain, and explain them before Claude's next step.
//
// It runs on PostToolBatch because a failed match is a validation error: Claude Code
// rejects the call before PreToolUse, and PostToolUseFailure never fires for it.

import fs from 'node:fs';
import path from 'node:path';
import { diagnoseMultiple, diagnoseNotFound } from './diagnose.mjs';
import { display, suggestPaths } from './paths.mjs';
import { readText } from './text.mjs';

// Anchored to the start of the result, so a file whose text merely mentions these errors,
// such as this one, isn't mistaken for a failure.
const NOT_FOUND = /^\s*(<tool_use_error>)?\s*String to replace not found in file/;
const MULTIPLE = /^\s*(<tool_use_error>)?\s*Found \d+ matches of the string to replace/;
const MISSING = /^\s*(<tool_use_error>)?\s*File does not exist/;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit']);
const PATH_TOOLS = new Set(['Edit', 'MultiEdit', 'Read', 'NotebookEdit']);
const MAX_CONTEXT = 9000;

// The text of a tool result, whether it arrives as a string, content blocks or an object.
export function responseText(response) {
  if (typeof response === 'string') return response;
  if (Array.isArray(response)) return response.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  if (response && typeof response === 'object') {
    if (typeof response.error === 'string') return response.error;
    if (Array.isArray(response.content)) return responseText(response.content);
    if (typeof response.content === 'string') return response.content;
  }
  return '';
}

function lf(text) {
  return text.replace(/\r\n|\r/g, '\n');
}

function missingFileMessage(tool, target, cwd) {
  const matches = suggestPaths(target, cwd);
  if (matches.length === 0) return null;
  const rows = matches.map((m) => '- ' + display(m.file, cwd) + ' (' + m.why + ')');
  return 'edit-doctor: ' + tool + ' could not find ' + display(target, cwd) + '. Files that might be the one you meant:\n' +
    rows.join('\n') + '\nUse the full path of the right one.';
}

// Explains one failed call, or returns null when there is nothing useful to add.
export function diagnoseCall(call, cwd) {
  const tool = call.tool_name;
  const input = call.tool_input && typeof call.tool_input === 'object' ? call.tool_input : {};
  const text = responseText(call.tool_response);
  const target = input.file_path || input.notebook_path;
  if (!text || typeof target !== 'string' || target === '') return null;
  const file = cwd ? path.resolve(cwd, target) : target;

  if (MISSING.test(text) && PATH_TOOLS.has(tool)) return fs.existsSync(file) ? null : missingFileMessage(tool, file, cwd);
  if (!EDIT_TOOLS.has(tool) || !(NOT_FOUND.test(text) || MULTIPLE.test(text))) return null;

  const fileText = readText(file);
  if (fileText === null) return null;
  const edits = tool === 'Edit' ? [input] : Array.isArray(input.edits) ? input.edits : [];
  for (const edit of edits) {
    if (!edit || typeof edit.old_string !== 'string' || edit.old_string === '') continue;
    if (NOT_FOUND.test(text)) {
      if (lf(fileText).includes(lf(edit.old_string))) continue;
      return diagnoseNotFound(fileText, edit.old_string, file);
    }
    if (!edit.replace_all) {
      const message = diagnoseMultiple(fileText, edit.old_string, file);
      if (message) return message;
    }
  }
  return null;
}

// PostToolBatch. Returns the hook reply, or null when no call in the batch needs a note.
export function handleBatch(input) {
  const calls = input && Array.isArray(input.tool_calls) ? input.tool_calls : [];
  const notes = [];
  for (const call of calls) {
    if (!call || typeof call !== 'object' || !PATH_TOOLS.has(call.tool_name)) continue;
    const text = responseText(call.tool_response);
    if (!text || !(NOT_FOUND.test(text) || MULTIPLE.test(text) || MISSING.test(text))) continue;
    const note = diagnoseCall(call, input.cwd);
    if (note) notes.push(note);
  }
  if (notes.length === 0) return null;
  let context = notes.join('\n\n');
  if (context.length > MAX_CONTEXT) context = context.slice(0, MAX_CONTEXT) + '\n(edit-doctor output truncated)';
  return { hookSpecificOutput: { hookEventName: 'PostToolBatch', additionalContext: context } };
}
