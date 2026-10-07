// Suggesting the file Claude probably meant when it names one that doesn't exist.

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'vendor', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.cache', '.gradle', '.idea', '.vs',
]);
const MAX_FILES = 30000;
const TIME_BUDGET_MS = 400;

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Edit distance where swapping two neighbouring letters counts as one edit, since
// "fromat" for "format" is as much a typo as "formt".
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Lists files under `root` breadth first, nearest first, skipping dependency and build
// folders, until the depth, file count or time budget runs out.
function listFiles(root, maxDepth, deadline, found) {
  const queue = [[root, 0]];
  while (queue.length > 0 && found.size < MAX_FILES && Date.now() < deadline) {
    const [dir, depth] = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(entry.name)) queue.push([full, depth + 1]);
      } else if (entry.isFile()) {
        found.add(full);
      }
    }
  }
}

// Ranks existing files by how likely they are to be the one Claude meant: the same name
// in another folder, the same name with another extension or capitalisation, or a name a
// typo or two away. Folders the paths share near the file count in a candidate's favour.
export function suggestPaths(missing, cwd) {
  const base = cwd && isDir(cwd) ? cwd : null;
  const target = base ? path.resolve(base, missing) : path.resolve(missing);
  const wanted = path.basename(target);
  const want = wanted.toLowerCase();
  const wantExt = path.extname(want);
  const wantStem = want.slice(0, want.length - wantExt.length);
  if (!want) return [];

  let anchor = path.dirname(target);
  while (!isDir(anchor)) {
    const up = path.dirname(anchor);
    if (up === anchor) break;
    anchor = up;
  }

  const deadline = Date.now() + TIME_BUDGET_MS;
  const found = new Set();
  if (isDir(anchor)) listFiles(anchor, 4, deadline, found);
  if (base && base !== anchor) listFiles(base, 8, deadline, found);

  const targetParts = target.toLowerCase().split(/[\\/]+/);
  const scored = [];
  for (const file of found) {
    const name = path.basename(file);
    const lower = name.toLowerCase();
    let score = 0;
    let why = '';
    if (lower === want) {
      score = 100;
      why = name === wanted ? 'same name' : 'same name, different capitalisation';
    } else {
      const ext = path.extname(lower);
      const stem = lower.slice(0, lower.length - ext.length);
      if (stem === wantStem && stem.length > 0) {
        score = 75;
        why = 'same name, different extension';
      } else if (want.length >= 4 && Math.abs(lower.length - want.length) <= 3) {
        const d = editDistance(lower, want);
        if (d <= Math.max(1, Math.floor(want.length / 6))) {
          score = 80 - 10 * d;
          why = 'similar name';
        }
      }
    }
    if (score === 0) continue;
    const parts = file.toLowerCase().split(/[\\/]+/);
    for (let k = 2; k <= Math.min(parts.length, targetParts.length); k++) {
      if (parts[parts.length - k] !== targetParts[targetParts.length - k]) break;
      score += 5;
    }
    scored.push({ file, score, why });
  }
  scored.sort((a, b) => b.score - a.score || a.file.length - b.file.length || (a.file < b.file ? -1 : 1));
  return scored.slice(0, 5);
}

// Shows a path relative to the session's folder when it is inside it.
export function display(file, cwd) {
  if (!cwd) return file;
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}
