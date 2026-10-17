#!/usr/bin/env node
// edit-doctor's hook entry point. The plugin's hooks.json runs it after every batch of tool
// calls (PostToolBatch) and after every successful Edit (PostToolUse). It reads the hook
// input as JSON on standard input and prints a JSON reply only when there is something to
// say: an Edit or Read in the batch failed in a way it can explain, or an Edit with
// replace_all changed more than one place.
// Any error exits with status 1, which Claude Code reports without stopping the session.

// Most inputs hold nothing to explain, so the code that explains them loads only when one does.
const FAILURE = /String to replace not found|matches of the string to replace|File does not exist/;
const REPLACE_ALL = /"replaceAll"\s*:\s*true|"replace_all"\s*:\s*true/;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin();
  let reply = null;
  if (process.argv[2] === 'replace-all') {
    if (!REPLACE_ALL.test(raw)) return;
    const { handleReplaceAll } = await import('./lib/replace-all.mjs');
    reply = handleReplaceAll(JSON.parse(raw));
  } else {
    if (!FAILURE.test(raw)) return;
    const { handleBatch } = await import('./lib/hook.mjs');
    reply = handleBatch(JSON.parse(raw));
  }
  if (reply) process.stdout.write(JSON.stringify(reply));
}

main().catch((err) => {
  process.stderr.write('edit-doctor: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exitCode = 1;
});
