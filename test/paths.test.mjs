import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { display, suggestPaths } from '../scripts/lib/paths.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-doctor-paths-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

for (const rel of [
  'src/util/format.ts',
  'src/util/format.test.ts',
  'src/components/Button.tsx',
  'docs/README.md',
  'node_modules/pkg/format.ts',
]) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x\n');
}

const names = (found) => found.map((f) => path.relative(root, f.file).split(path.sep).join('/'));

test('finds the same file name in another folder', () => {
  const found = suggestPaths(path.join(root, 'src/utils/format.ts'), root);
  assert.equal(names(found)[0], 'src/util/format.ts');
  assert.equal(found[0].why, 'same name');
});

test('skips dependency folders', () => {
  const found = suggestPaths(path.join(root, 'lib/format.ts'), root);
  assert.ok(!names(found).some((n) => n.startsWith('node_modules')));
});

test('finds a name a typo away', () => {
  const found = suggestPaths(path.join(root, 'src/util/fromat.ts'), root);
  assert.equal(names(found)[0], 'src/util/format.ts');
  assert.equal(found[0].why, 'similar name');
});

test('finds the same name with another extension or capitalisation', () => {
  assert.equal(suggestPaths(path.join(root, 'src/components/Button.jsx'), root)[0].why, 'same name, different extension');
  const caps = suggestPaths(path.join(root, 'docs/readme.md'), root);
  assert.equal(names(caps)[0], 'docs/README.md');
  assert.match(caps[0].why, /^same name/);
});

test('resolves relative paths against the session folder', () => {
  assert.equal(names(suggestPaths('src/utils/format.ts', root))[0], 'src/util/format.ts');
});

test('suggests nothing for a name nothing resembles', () => {
  assert.deepEqual(suggestPaths(path.join(root, 'src/zzzzzzzz.go'), root), []);
});

test('shows paths inside the session folder relative to it', () => {
  assert.equal(display(path.join(root, 'src', 'a.ts'), root), path.join('src', 'a.ts'));
  assert.equal(display(path.join(os.tmpdir(), 'elsewhere.ts'), root), path.join(os.tmpdir(), 'elsewhere.ts'));
});
