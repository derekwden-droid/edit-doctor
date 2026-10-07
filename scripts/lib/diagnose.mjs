// Working out why an Edit's old_string didn't match the file, and what would.

import path from 'node:path';
import {
  describeChar,
  describeRun,
  escapeFor,
  isInvisible,
  isSpace,
  normalize,
  originalSpan,
  plainForm,
} from './normalize.mjs';
import { lineOf, splitLines } from './text.mjs';

const MAX_ITEMS = 8;
const MAX_SHOWN_LINES = 20;
const MAX_SHOWN_CHARS = 2000;
const FENCE = '```';

function width(cp) {
  return cp > 0xffff ? 2 : 1;
}

function leadingRun(line) {
  let i = 0;
  while (i < line.length && isSpace(line.charCodeAt(i))) i++;
  return line.slice(0, i);
}

function trailingRun(line, after) {
  let i = line.length;
  while (i > after && isSpace(line.charCodeAt(i - 1))) i--;
  return line.slice(i);
}

function lf(text) {
  return text.replace(/\r\n|\r/g, '\n');
}

// A block of file text for Claude to copy, cut down if it is long.
function block(text) {
  let shown = text;
  let note = '';
  const lines = shown.split('\n');
  if (lines.length > MAX_SHOWN_LINES) {
    shown = lines.slice(0, MAX_SHOWN_LINES).join('\n');
    note = '\n(first ' + MAX_SHOWN_LINES + ' of ' + lines.length + ' lines shown)';
  }
  if (shown.length > MAX_SHOWN_CHARS) {
    shown = shown.slice(0, MAX_SHOWN_CHARS);
    note = '\n(first ' + MAX_SHOWN_CHARS + ' characters shown)';
  }
  const fence = shown.includes(FENCE) ? FENCE + '`' : FENCE;
  return fence + '\n' + shown + '\n' + fence + note;
}

function clip(text, max = 70) {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

// ------------------------------------------------------------------ loose matching

// Finds old_string in the file once whitespace, invisible characters and typography are
// ignored. Returns the [from, to) spans in the file, widened to cover the whitespace that
// old_string itself starts or ends with.
export function findLoose(fileText, oldText) {
  const nf = normalize(fileText);
  const no = normalize(oldText);
  const spans = [];
  if (no.text.length === 0) return spans;
  const startsWithSpace = isSpace(oldText.charCodeAt(0));
  const endsWithSpace = isSpace(oldText.charCodeAt(oldText.length - 1));
  for (let at = nf.text.indexOf(no.text); at !== -1 && spans.length < 50; at = nf.text.indexOf(no.text, at + 1)) {
    let [from, to] = originalSpan(nf, fileText, at, no.text.length);
    if (startsWithSpace) while (from > 0 && isSpace(fileText.charCodeAt(from - 1))) from--;
    if (endsWithSpace) while (to < fileText.length && isSpace(fileText.charCodeAt(to))) to++;
    spans.push([from, to]);
  }
  return spans;
}

// Lists how old_string differs from the file text it loosely matches, line by line, with
// the file's line and column numbers. Also reports which kinds of difference were seen.
export function explainDifferences(oldText, actual, firstLine) {
  const oLines = oldText.split(/\r\n|\r|\n/);
  const aLines = actual.split(/\r\n|\r|\n/);
  const items = [];
  const seen = { tabs: false, trailing: false, invisible: new Set(), spaces: new Set(), typography: new Set() };
  if (oLines.length !== aLines.length) return { items, seen };

  for (let k = 0; k < oLines.length && items.length < MAX_ITEMS; k++) {
    const o = oLines[k];
    const a = aLines[k];
    if (o === a) continue;
    const n = firstLine + k;
    const oLead = leadingRun(o);
    const aLead = leadingRun(a);
    const oTrail = trailingRun(o, oLead.length);
    const aTrail = trailingRun(a, aLead.length);
    if (oLead !== aLead) {
      items.push('line ' + n + ': the leading whitespace differs. The file has ' + describeRun(aLead) + '; your old_string has ' + describeRun(oLead) + '.');
      if (aLead.includes('\t') || oLead.includes('\t')) seen.tabs = true;
    }
    if (oTrail !== aTrail) {
      const tail = a.length > 40 ? '...' + a.slice(-37) : a;
      items.push('line ' + n + ': the file has ' + describeRun(aTrail) + ' at the end of the line (`' + tail + '`); your old_string has ' + describeRun(oTrail) + '.');
      seen.trailing = true;
    }
    const oc = o.slice(oLead.length, o.length - oTrail.length);
    const ac = a.slice(aLead.length, a.length - aTrail.length);
    let i = 0;
    let j = 0;
    while ((i < ac.length || j < oc.length) && items.length < MAX_ITEMS) {
      const ca = i < ac.length ? ac.codePointAt(i) : -1;
      const co = j < oc.length ? oc.codePointAt(j) : -1;
      if (ca === co) {
        i += width(ca);
        j += width(co);
        continue;
      }
      const where = 'line ' + n + ', column ' + (aLead.length + i + 1) + ': ';
      if (ca >= 0 && isInvisible(ca)) {
        items.push(where + 'the file has an invisible ' + describeChar(ca) + ' that your old_string lacks.');
        seen.invisible.add(ca);
        i += width(ca);
        continue;
      }
      if (co >= 0 && isInvisible(co)) {
        items.push(where + 'your old_string has an invisible ' + describeChar(co) + ' that the file lacks.');
        j += width(co);
        continue;
      }
      if ((ca >= 0 && isSpace(ca)) || (co >= 0 && isSpace(co))) {
        let ia = i;
        while (ia < ac.length && isSpace(ac.charCodeAt(ia))) ia++;
        let jo = j;
        while (jo < oc.length && isSpace(oc.charCodeAt(jo))) jo++;
        const runA = ac.slice(i, ia);
        const runO = oc.slice(j, jo);
        if (runA !== runO) {
          items.push(where + 'the file has ' + describeRun(runA) + ' where your old_string has ' + describeRun(runO) + '.');
          if (runA.includes('\t') || runO.includes('\t')) seen.tabs = true;
          for (const ch of runA) if (ch !== ' ' && ch !== '\t') seen.spaces.add(ch.codePointAt(0));
        }
        i = ia;
        j = jo;
        continue;
      }
      const pa = ca >= 0 ? plainForm(ca) : null;
      const po = co >= 0 ? plainForm(co) : null;
      items.push(where + 'the file has ' + (ca >= 0 ? describeChar(ca) : 'nothing') + ' where your old_string has ' + (co >= 0 ? describeChar(co) : 'nothing') + '.');
      if (pa !== null) seen.typography.add(ca);
      if (pa !== null && po === null) {
        i += width(ca);
        j += pa.length;
      } else if (po !== null && pa === null) {
        j += width(co);
        i += po.length;
      } else {
        i += ca >= 0 ? width(ca) : 1;
        j += co >= 0 ? width(co) : 1;
      }
    }
  }
  return { items, seen };
}

function advice(seen, oldText, fileText, onlyEdges) {
  const tips = [];
  if (seen.tabs) {
    tips.push('The file uses tab characters there. Copy the text above exactly, with real tabs, in old_string and new_string.');
  }
  if (seen.trailing) {
    tips.push('Keep the whitespace at the ends of those lines exactly as the file has it (the text above includes it), or end old_string before that line ends.');
  }
  const typed = [...seen.invisible, ...seen.spaces];
  if (typed.length > 0) {
    const examples = typed.slice(0, 3).map((cp) => escapeFor(cp) + ' for ' + describeChar(cp)).join(', ');
    tips.push('Invisible and look-alike characters are easy to lose when copying. Type them in old_string as backslash-u escapes, which Claude Code turns into the real characters: ' + examples + '.');
  }
  if (seen.typography.size > 0) {
    tips.push('Use the same punctuation as the file: ' + [...seen.typography].map(describeChar).join(', ') + '.');
  }
  if (onlyEdges && !oldText.includes('\n')) {
    const core = oldText.trim();
    const lfText = lf(fileText);
    if (core && lfText.indexOf(core) !== -1 && lfText.indexOf(core) === lfText.lastIndexOf(core)) {
      tips.push('Simplest fix: drop the leading and trailing whitespace. `' + clip(core, 120) + '` appears exactly once in the file, so it works as old_string as it stands.');
    }
  }
  return tips;
}

// ------------------------------------------------------------------ fuzzy matching

function tokens(line) {
  const found = line.toLowerCase().match(/[a-z0-9_$]{3,}/g);
  return found ? [...new Set(found)] : [];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Edit distance from `pattern` to the closest substring of `text` (Sellers' algorithm).
function substringDistance(pattern, text) {
  let prev = new Array(text.length + 1).fill(0);
  let curr = new Array(text.length + 1);
  for (let i = 1; i <= pattern.length; i++) {
    curr[0] = i;
    const cp = pattern.charCodeAt(i - 1);
    for (let j = 1; j <= text.length; j++) {
      const cost = cp === text.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return Math.min(...prev);
}

function similarity(a, b) {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  if (longest > 600) {
    const ta = new Set(tokens(a));
    const tb = new Set(tokens(b));
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared++;
    return ta.size + tb.size === 0 ? 0 : (2 * shared) / (ta.size + tb.size);
  }
  return 1 - levenshtein(a, b) / longest;
}

// Lines of the file ranked by how many words they share with `line`.
function rankByTokens(index, line, limit) {
  const scores = new Map();
  for (const t of tokens(line)) {
    for (const n of index.get(t) || []) scores.set(n, (scores.get(n) || 0) + 1);
  }
  return [...scores.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, limit).map(([n]) => n);
}

// The lines of old_string without blank lines at either end.
function oldStringLines(oldText) {
  const lines = oldText.split(/\r\n|\r|\n/);
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  while (lines.length > 1 && lines[0].trim() === '') lines.shift();
  return lines;
}

// Finds the run of file lines most like old_string. Returns { start, end, score } with
// 0-based inclusive line indexes, or null when nothing is reasonably close.
export function closestLines(fileText, oldText) {
  const fileLines = splitLines(fileText);
  const oldLines = oldStringLines(oldText);
  if (fileLines.length === 0 || oldLines.length === 0) return null;
  const nf = fileLines.map((l) => (l.length > 4000 ? '' : normalize(l).text));
  const no = oldLines.map((l) => normalize(l).text);

  const index = new Map();
  nf.forEach((line, n) => {
    for (const t of tokens(line)) {
      const list = index.get(t);
      if (!list) index.set(t, [n]);
      else if (list.length < 300) list.push(n);
    }
  });

  if (no.length === 1) {
    const pattern = no[0];
    if (pattern.length < 3) return null;
    let best = null;
    let candidates = rankByTokens(index, pattern, 40);
    if (candidates.length === 0 && nf.length <= 5000) candidates = nf.map((_, n) => n);
    for (const n of candidates) {
      if (nf[n].length === 0 || pattern.length * nf[n].length > 4e6) continue;
      const score = 1 - substringDistance(pattern, nf[n]) / pattern.length;
      if (!best || score > best.score) best = { start: n, end: n, score };
    }
    return best && best.score >= 0.6 ? best : null;
  }

  const k = Math.min(no.length, nf.length);
  const starts = new Set();
  no.forEach((line, j) => {
    if (line.length < 4) return;
    for (const n of rankByTokens(index, line, 6)) {
      const s = Math.max(0, Math.min(n - j, nf.length - k));
      starts.add(s);
    }
  });
  if (starts.size === 0 && nf.length * k <= 50000) for (let s = 0; s + k <= nf.length; s++) starts.add(s);
  let best = null;
  for (const s of starts) {
    let total = 0;
    for (let j = 0; j < k; j++) total += similarity(no[j], nf[s + j]);
    const score = total / no.length;
    if (!best || score > best.score) best = { start: s, end: s + k - 1, score };
  }
  return best && best.score >= 0.55 ? best : null;
}

// The part of two lines that differs, after trimming what they share at each end.
function middleDifference(fileLine, oldLine) {
  const a = fileLine.trim();
  const b = oldLine.trim();
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const from = Math.max(0, p - 12);
  return {
    file: (from > 0 ? '...' : '') + a.slice(from, a.length - s + Math.min(s, 12)),
    yours: (from > 0 ? '...' : '') + b.slice(from, b.length - s + Math.min(s, 12)),
  };
}

// The longest word in old_string, and the lines of the file that contain it.
function anchorHint(fileText, oldText) {
  const words = (oldText.match(/[A-Za-z_$][A-Za-z0-9_$]{4,}/g) || []).sort((x, y) => y.length - x.length);
  const lines = splitLines(fileText);
  for (const word of words.slice(0, 3)) {
    const hits = [];
    lines.forEach((line, n) => {
      if (hits.length < 6 && line.includes(word)) hits.push(n + 1);
    });
    if (hits.length > 0) return '`' + word + '` appears on line' + (hits.length > 1 ? 's ' : ' ') + hits.join(', ') + '.';
  }
  return '';
}

// ------------------------------------------------------------------ reports

// Explains an Edit that failed with "String to replace not found in file".
export function diagnoseNotFound(fileText, oldText, filePath) {
  const name = path.basename(filePath);
  const head = 'edit-doctor: the Edit to ' + name + ' failed because old_string is not in the file as written.';
  if (typeof oldText !== 'string' || oldText.length === 0) return null;
  const text = lf(fileText);
  const old = lf(oldText);

  const spans = findLoose(text, old);
  if (spans.length > 0) {
    const [from, to] = spans[0];
    const actual = text.slice(from, to);
    const firstLine = lineOf(text, from);
    const lastLine = firstLine + actual.split('\n').length - 1;
    const { items, seen } = explainDifferences(old, actual, firstLine);
    const onlyEdges = items.length > 0 && items.every((s) => /leading whitespace|at the end of the line/.test(s));
    const parts = [
      head + ' It matches ' + (firstLine === lastLine ? 'line ' + firstLine : 'lines ' + firstLine + '-' + lastLine) +
        ' once whitespace, invisible characters and typography are ignored' + (spans.length > 1 ? ' (and ' + (spans.length - 1) + ' other place' + (spans.length > 2 ? 's' : '') + ')' : '') + '. The differences:',
      items.length > 0 ? items.map((s) => '- ' + s).join('\n') : '- none that edit-doctor can name; compare with the text below.',
      'The exact text in the file:',
      block(actual),
      ...advice(seen, old, text, onlyEdges),
    ];
    return parts.join('\n');
  }

  for (const upper of [false, true]) {
    let escaped = '';
    let changed = false;
    for (const ch of old) {
      const cp = ch.codePointAt(0);
      if (cp > 0x7e) {
        const esc = escapeFor(cp);
        escaped += upper ? esc.replace(/[a-f]/g, (c) => c.toUpperCase()) : esc;
        changed = true;
      } else {
        escaped += ch;
      }
    }
    if (changed && text.includes(escaped)) {
      const at = text.indexOf(escaped);
      return head + ' The file writes the non-ASCII characters of your old_string as backslash-u escapes (line ' + lineOf(text, at) + '), ' +
        'but Claude Code decoded the escapes you typed into real characters, so they cannot match. Choose an old_string that stops before ' +
        'the escaped text, or make this change with a short script.';
    }
  }

  const near = closestLines(text, old);
  if (near) {
    const fileLines = splitLines(text);
    const oldLines = oldStringLines(old);
    const shown = fileLines.slice(near.start, near.end + 1).join('\n');
    const diffs = [];
    for (let j = 0; j < oldLines.length && diffs.length < MAX_ITEMS; j++) {
      const fileLine = fileLines[near.start + j];
      if (fileLine === undefined) break;
      if (normalize(fileLine).text === normalize(oldLines[j]).text) continue;
      const d = middleDifference(fileLine, oldLines[j]);
      diffs.push('- line ' + (near.start + j + 1) + ': the file has `' + clip(d.file) + '` where your old_string has `' + clip(d.yours) + '`');
    }
    const range = near.start === near.end ? 'line ' + (near.start + 1) : 'lines ' + (near.start + 1) + '-' + (near.end + 1);
    return [
      head + ' The closest text is ' + range + ' (about ' + Math.round(near.score * 100) + '% similar). ' +
        'The file may have changed since you read it, or old_string has a typo.',
      diffs.length > 0 ? diffs.join('\n') : '',
      'The current text of ' + range + ':',
      block(shown),
      'Build old_string from this text.',
    ].filter(Boolean).join('\n');
  }

  const hint = anchorHint(text, old);
  return head + ' Nothing in the file is close to it' + (hint ? '. ' + hint : '.') +
    ' The text may have been removed or rewritten; read the part of the file you want to change before trying again.';
}

// Explains an Edit that failed because old_string matches more than once.
export function diagnoseMultiple(fileText, oldText, filePath) {
  if (typeof oldText !== 'string' || oldText.length === 0) return null;
  const text = lf(fileText);
  const old = lf(oldText);
  const positions = [];
  for (let at = text.indexOf(old); at !== -1; at = text.indexOf(old, at + old.length)) positions.push(at);
  if (positions.length < 2) return null;
  const count = (s) => {
    let n = 0;
    for (let at = text.indexOf(s); at !== -1 && n < 2; at = text.indexOf(s, at + 1)) n++;
    return n;
  };
  const rows = positions.slice(0, MAX_ITEMS).map((at) => {
    const line = lineOf(text, at);
    const lineStart = text.lastIndexOf('\n', at - 1) + 1;
    const lineEnd = (() => {
      const e = text.indexOf('\n', at + old.length);
      return e === -1 ? text.length : e;
    })();
    for (let extra = 1; extra <= 3; extra++) {
      let start = lineStart;
      for (let k = 0; k < extra && start > 0; k++) start = text.lastIndexOf('\n', start - 2) + 1;
      const above = text.slice(start, at + old.length);
      if (start < lineStart && count(above) === 1) {
        return '- line ' + line + ': unique if old_string starts ' + extra + ' line' + (extra > 1 ? 's' : '') + ' earlier, from `' + clip(text.slice(start, lineStart).split('\n')[0].trim()) + '`';
      }
      let end = lineEnd;
      for (let k = 0; k < extra && end < text.length; k++) {
        const e = text.indexOf('\n', end + 1);
        end = e === -1 ? text.length : e;
      }
      const below = text.slice(at, end);
      if (end > lineEnd && count(below) === 1) {
        const tail = text.slice(lineEnd + 1, end).split('\n').pop().trim();
        return '- line ' + line + ': unique if old_string runs ' + extra + ' line' + (extra > 1 ? 's' : '') + ' further, to `' + clip(tail) + '`';
      }
    }
    return '- line ' + line + ': `' + clip(text.slice(lineStart, lineEnd).trim()) + '`';
  });
  const more = positions.length > MAX_ITEMS ? '\n- and ' + (positions.length - MAX_ITEMS) + ' more' : '';
  return 'edit-doctor: the Edit to ' + path.basename(filePath) + ' failed because old_string appears ' + positions.length +
    ' times. To change every occurrence, set replace_all to true. To change one, widen old_string (and new_string to match) until it is unique:\n' +
    rows.join('\n') + more;
}
