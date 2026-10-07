// What "the same text apart from whitespace, invisible characters and typography" means,
// and names for the characters that make two texts differ.
//
// Code points are written as numbers. Claude Code decodes backslash-u escapes in the text
// of Write and Edit calls, so this source never spells one out.

export const BACKSLASH = String.fromCharCode(92);

function range(first, last) {
  const out = [];
  for (let cp = first; cp <= last; cp++) out.push(cp);
  return out;
}

// Horizontal whitespace, including the spaces that look like an ordinary space.
const SPACES = new Set([0x09, 0x20, 0xa0, 0x1680, ...range(0x2000, 0x200a), 0x202f, 0x205f, 0x3000]);

// Characters that render as nothing at all.
const INVISIBLE = new Set([
  0xad, 0x34f, 0x61c, 0x180e, ...range(0x200b, 0x200f), ...range(0x202a, 0x202e), ...range(0x2060, 0x2064),
  ...range(0x2066, 0x2069), 0xfeff,
]);

const SINGLE_QUOTES = new Set([0x2018, 0x2019, 0x201a, 0x201b, 0x2032]);
const DOUBLE_QUOTES = new Set([0x201c, 0x201d, 0x201e, 0x201f, 0x2033]);
const DASHES = new Set([...range(0x2010, 0x2015), 0x2212]);
const ELLIPSIS = 0x2026;

const NAMES = new Map([
  [0x09, 'TAB'],
  [0x20, 'SPACE'],
  [0xa0, 'NO-BREAK SPACE'],
  [0xad, 'SOFT HYPHEN'],
  [0x34f, 'COMBINING GRAPHEME JOINER'],
  [0x61c, 'ARABIC LETTER MARK'],
  [0x1680, 'OGHAM SPACE MARK'],
  [0x180e, 'MONGOLIAN VOWEL SEPARATOR'],
  [0x2000, 'EN QUAD'],
  [0x2001, 'EM QUAD'],
  [0x2002, 'EN SPACE'],
  [0x2003, 'EM SPACE'],
  [0x2004, 'THREE-PER-EM SPACE'],
  [0x2005, 'FOUR-PER-EM SPACE'],
  [0x2006, 'SIX-PER-EM SPACE'],
  [0x2007, 'FIGURE SPACE'],
  [0x2008, 'PUNCTUATION SPACE'],
  [0x2009, 'THIN SPACE'],
  [0x200a, 'HAIR SPACE'],
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200d, 'ZERO WIDTH JOINER'],
  [0x200e, 'LEFT-TO-RIGHT MARK'],
  [0x200f, 'RIGHT-TO-LEFT MARK'],
  [0x2010, 'HYPHEN'],
  [0x2011, 'NON-BREAKING HYPHEN'],
  [0x2012, 'FIGURE DASH'],
  [0x2013, 'EN DASH'],
  [0x2014, 'EM DASH'],
  [0x2015, 'HORIZONTAL BAR'],
  [0x2018, 'LEFT SINGLE QUOTATION MARK'],
  [0x2019, 'RIGHT SINGLE QUOTATION MARK'],
  [0x201a, 'SINGLE LOW-9 QUOTATION MARK'],
  [0x201b, 'SINGLE HIGH-REVERSED-9 QUOTATION MARK'],
  [0x201c, 'LEFT DOUBLE QUOTATION MARK'],
  [0x201d, 'RIGHT DOUBLE QUOTATION MARK'],
  [0x201e, 'DOUBLE LOW-9 QUOTATION MARK'],
  [0x201f, 'DOUBLE HIGH-REVERSED-9 QUOTATION MARK'],
  [0x2026, 'HORIZONTAL ELLIPSIS'],
  [0x202a, 'LEFT-TO-RIGHT EMBEDDING'],
  [0x202b, 'RIGHT-TO-LEFT EMBEDDING'],
  [0x202c, 'POP DIRECTIONAL FORMATTING'],
  [0x202d, 'LEFT-TO-RIGHT OVERRIDE'],
  [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
  [0x202f, 'NARROW NO-BREAK SPACE'],
  [0x2032, 'PRIME'],
  [0x2033, 'DOUBLE PRIME'],
  [0x205f, 'MEDIUM MATHEMATICAL SPACE'],
  [0x2060, 'WORD JOINER'],
  [0x2061, 'FUNCTION APPLICATION'],
  [0x2062, 'INVISIBLE TIMES'],
  [0x2063, 'INVISIBLE SEPARATOR'],
  [0x2064, 'INVISIBLE PLUS'],
  [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
  [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
  [0x2068, 'FIRST STRONG ISOLATE'],
  [0x2069, 'POP DIRECTIONAL ISOLATE'],
  [0x2212, 'MINUS SIGN'],
  [0x3000, 'IDEOGRAPHIC SPACE'],
  [0xfeff, 'ZERO WIDTH NO-BREAK SPACE'],
]);

export function isSpace(cp) {
  return SPACES.has(cp);
}

export function isInvisible(cp) {
  return INVISIBLE.has(cp);
}

// The ASCII stand-in for a typographic quote, dash or ellipsis, or null for anything else.
export function plainForm(cp) {
  if (SINGLE_QUOTES.has(cp)) return "'";
  if (DOUBLE_QUOTES.has(cp)) return '"';
  if (DASHES.has(cp)) return '-';
  if (cp === ELLIPSIS) return '...';
  return null;
}

export function hex(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

// Names a character the way it should appear in a message: printable ASCII in backticks,
// anything else by code point and name.
export function describeChar(cp) {
  if (cp === 0x09) return 'a tab';
  if (cp === 0x20) return 'a space';
  if (cp > 0x20 && cp < 0x7f) return '`' + String.fromCharCode(cp) + '`';
  const name = NAMES.get(cp);
  return 'U+' + hex(cp) + (name ? ' ' + name : '');
}

// Describes a run of whitespace by what it holds, such as "1 tab" or "4 spaces".
export function describeRun(run) {
  if (run.length === 0) return 'nothing';
  const counts = new Map();
  for (const ch of run) {
    const cp = ch.codePointAt(0);
    counts.set(cp, (counts.get(cp) || 0) + 1);
  }
  const parts = [];
  for (const [cp, n] of counts) {
    if (cp === 0x09) parts.push(n + (n === 1 ? ' tab' : ' tabs'));
    else if (cp === 0x20) parts.push(n + (n === 1 ? ' space' : ' spaces'));
    else parts.push(n + 'x ' + describeChar(cp));
  }
  return parts.join(' and ');
}

// Normalizes text for comparison: line endings become LF; whitespace at the start and end
// of each line is dropped; other whitespace runs become one space; invisible characters
// are dropped; typographic quotes, dashes and ellipses become ASCII. `map[k]` is the index
// in the original text of the character that produced normalized character k, and
// `map[text.length]` is the original length, so a match maps back to an exact span.
export function normalize(text) {
  let out = '';
  const map = [];
  let lineStart = true;
  let spaceAt = -1;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const width = cp > 0xffff ? 2 : 1;
    if (cp === 13 || cp === 10) {
      if (cp === 13 && text.charCodeAt(i + 1) === 10) {
        i += 1;
        continue;
      }
      out += '\n';
      map.push(i);
      lineStart = true;
      spaceAt = -1;
      i += 1;
      continue;
    }
    if (INVISIBLE.has(cp)) {
      i += width;
      continue;
    }
    if (SPACES.has(cp)) {
      if (!lineStart && spaceAt < 0) spaceAt = i;
      i += width;
      continue;
    }
    if (spaceAt >= 0) {
      out += ' ';
      map.push(spaceAt);
      spaceAt = -1;
    }
    lineStart = false;
    const plain = plainForm(cp);
    const piece = plain !== null ? plain : text.slice(i, i + width);
    for (let k = 0; k < piece.length; k++) map.push(i);
    out += piece;
    i += width;
  }
  map.push(text.length);
  return { text: out, map };
}

// The original span [from, to) behind `length` normalized characters starting at `start`.
export function originalSpan(norm, original, start, length) {
  const from = norm.map[start];
  const last = norm.map[start + length - 1];
  const to = last + (original.codePointAt(last) > 0xffff ? 2 : 1);
  return [from, to];
}

// Spells a code point as the backslash-u escape Claude Code decodes in Edit text.
export function escapeFor(cp) {
  if (cp > 0xffff) {
    const v = cp - 0x10000;
    return escapeFor(0xd800 + (v >> 10)) + escapeFor(0xdc00 + (v & 0x3ff));
  }
  return BACKSLASH + 'u' + cp.toString(16).padStart(4, '0');
}
