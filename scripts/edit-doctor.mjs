#!/usr/bin/env node
// edit-doctor's hook entry point. The plugin's hooks.json runs it after every batch of tool
// calls (PostToolBatch). It reads the hook input as JSON on standard input and prints a
// JSON reply only when an Edit or Read in the batch failed in a way it can explain.
// Any error exits with status 1, which Claude Code reports without stopping the session.

// Most batches hold nothing to explain, so the diagnosis code loads only when one does.
const RELEVANT = /String to replace not found|matches of the string to replace|File does not exist/;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin();
  if (!RELEVANT.test(raw)) return;
  const { handleBatch } = await import('./lib/hook.mjs');
  const reply = handleBatch(JSON.parse(raw));
  if (reply) process.stdout.write(JSON.stringify(reply));
}

main().catch((err) => {
  process.stderr.write('edit-doctor: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exitCode = 1;
});
