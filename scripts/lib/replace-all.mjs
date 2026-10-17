// What edit-doctor says after an Edit with replace_all succeeds. Claude Code answers "All
// occurrences were successfully replaced" and nothing more: not how many, not where, and
// not that some of them sat inside longer words. PostToolUse gets the file as it was
// before the Edit, so edit-doctor finds every replacement there and reports them.

import path from 'node:path';

const WORD = /[\p{L}\p{N}_]/u;
const MAX_LINES = 12;
const MAX_PARTIAL = 8;

function isWordChar(ch) {
  return typeof ch === 'string' && ch !== '' && WORD.test(ch);
}

function quote(text, max = 40) {
  const shown = text.length > max ? text.slice(0, max) + '...' : text;
  return JSON.stringify(shown);
}

// The 1-based line of each offset in `text`, for offsets given in ascending order.
function linesOf(text, offsets) {
  const lines = [];
  let line = 1;
  let at = 0;
  for (const offset of offsets) {
    for (; at < offset; at++) if (text.charCodeAt(at) === 10) line++;
    lines.push(line);
  }
  return lines;
}

// Every place String.prototype.replaceAll would replace `needle`: left to right, with no
// overlaps.
export function findAll(text, needle) {
  const found = [];
  if (!needle) return found;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) found.push(i);
  return found;
}

// The whole word a match sits in, when old_string starts or ends inside a longer word.
// Returns null for a match that stands on its own.
export function enclosingWord(text, start, needle) {
  const end = start + needle.length;
  const before = start > 0 && isWordChar(needle[0]) && isWordChar(text[start - 1]);
  const after = end < text.length && isWordChar(needle[needle.length - 1]) && isWordChar(text[end]);
  if (!before && !after) return null;
  let from = start;
  if (before) while (from > 0 && isWordChar(text[from - 1])) from--;
  let to = end;
  if (after) while (to < text.length && isWordChar(text[to])) to++;
  return { from, to };
}

function lineList(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  const parts = [...counts].slice(0, MAX_LINES).map(([line, n]) => (n > 1 ? line + ' (' + n + 'x)' : String(line)));
  if (counts.size > MAX_LINES) parts.push('and ' + (counts.size - MAX_LINES) + ' more lines');
  return (counts.size === 1 ? 'line ' : 'lines ') + parts.join(', ');
}

// PostToolUse for Edit. Returns the hook reply, or null when there is nothing worth saying:
// not a replace_all, or a single replacement.
export function handleReplaceAll(input) {
  if (!input || input.tool_name !== 'Edit') return null;
  const args = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const response = input.tool_response && typeof input.tool_response === 'object' ? input.tool_response : {};
  if (!args.replace_all && response.replaceAll !== true) return null;
  const original = response.originalFile;
  const oldString = typeof response.oldString === 'string' ? response.oldString : args.old_string;
  const newString = typeof response.newString === 'string' ? response.newString : args.new_string;
  if (typeof original !== 'string' || typeof oldString !== 'string' || oldString === '' || typeof newString !== 'string') return null;

  const offsets = findAll(original, oldString);
  if (offsets.length < 2) return null;
  const lines = linesOf(original, offsets);
  const name = path.basename(String(response.filePath || args.file_path || 'the file'));
  const shiftsLines = (oldString.match(/\n/g) || []).length !== (newString.match(/\n/g) || []).length;

  let text = 'edit-doctor: replace_all changed ' + offsets.length + ' occurrences of ' + quote(oldString) + ' in ' + name +
    ', on ' + lineList(lines) + (shiftsLines ? ' (line numbers from before the Edit)' : '') + '.';

  // One row per word, so "foofoo" with two matches in it is reported once.
  const words = new Map();
  let partial = 0;
  offsets.forEach((start, k) => {
    const word = enclosingWord(original, start, oldString);
    if (!word) return;
    partial++;
    if (!words.has(word.from)) words.set(word.from, { line: lines[k], word });
  });
  if (partial > 0) {
    const rows = [...words.values()].slice(0, MAX_PARTIAL).map(({ line, word }) => {
      const was = original.slice(word.from, word.to);
      return '- line ' + line + ': ' + quote(was, 60) + ' became ' + quote(was.split(oldString).join(newString), 60);
    });
    if (words.size > MAX_PARTIAL) rows.push('- and ' + (words.size - MAX_PARTIAL) + ' more');
    text += '\n' + (partial === 1 ? '1 of them was' : partial + ' of them were') +
      ' inside a longer word, which may not be what you meant:\n' + rows.join('\n') +
      '\nIf any of these should have stayed as it was, change it back with another Edit.';
  }
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } };
}
