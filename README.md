# edit-doctor

When Claude Code's Edit tool can't find the text it was asked to replace, it fails with `String to replace not found in file.` and nothing else. The usual causes are invisible: the file indents with tabs and Claude typed spaces, a line ends in spaces Claude didn't copy, a no-break space or zero-width character sits where Claude typed a plain space, or the file changed since Claude read it. Claude usually reads the whole file again and guesses. `Found 2 matches of the string to replace` and `File does not exist` are just as bare.

edit-doctor reads the file the moment an Edit fails and tells Claude, before its next step, exactly what differs and what to use instead:

- **Text not found.** It finds old_string in the file again with whitespace, invisible characters and typography set aside, then lists every difference by line and column: a tab where Claude has spaces, trailing spaces, a no-break space, a zero-width character, an en dash where Claude typed a hyphen. It quotes the exact text from the file to copy. When the text really changed, it shows the closest lines and what differs in them.
- **Several matches.** It lists where each one is and which neighbouring line makes each unique, so Claude can widen old_string instead of guessing.
- **File does not exist.** For Edit and Read, it suggests the files Claude probably meant: the same name in another folder, the same name with another extension or capitalisation, or a name a typo away.
- **replace_all changed more than you think.** An Edit with `replace_all` reports only "All occurrences were successfully replaced". edit-doctor tells Claude how many places changed and on which lines, and points out any that were inside a longer word, such as `foo` inside `foobar`, so a too-broad replacement gets caught right away.

Here is what Claude saw, in a real session, after an Edit that indented two lines of a Go file with spaces:

````
edit-doctor: the Edit to live.go failed because old_string is not in the file as written. It matches lines 5-6 once whitespace, invisible characters and typography are ignored. The differences:
- line 5: the leading whitespace differs. The file has 1 tab; your old_string has 4 spaces.
- line 6: the leading whitespace differs. The file has 2 tabs; your old_string has 8 spaces.
The exact text in the file:
```
	for _, x := range xs {
		sum += x
```
The file uses tab characters there. Copy the text above exactly, with real tabs, in old_string and new_string.
````

The next Edit succeeded without reading the file again.

## Try it

1. "Create `total.go` with a small tab-indented function that sums a slice. Then change its loop body with an Edit whose old_string is indented with spaces, and show me what happens."
2. "Make a file where the line `retries = 3` appears twice, then change the second one using just `retries = 3` as old_string."
3. "Read `READMEE.md`." (Any typo of a real file name works.)
4. "Make a file that uses `id` as a variable and also has `userId` and `valid`, then rename `id` to `key` everywhere with one replace_all Edit."

## What's included

- **Two hooks.** PostToolBatch, which Claude Code runs once after each batch of tool calls; it runs `node scripts/edit-doctor.mjs` and says nothing unless an Edit or Read in the batch failed in one of the ways above. PostToolUse on Edit, which runs `node scripts/edit-doctor.mjs replace-all` and says nothing unless the Edit used replace_all and changed more than one place.

It uses PostToolBatch because a failed match is a validation error: Claude Code rejects the call before PreToolUse hooks run, and PostToolUseFailure never fires for it. PostToolBatch still sees the call and its error.

## What it reads, runs and sends

- **Reads** the file a failed Edit targeted, up to 8 MB, once, to find the closest match. For replace_all it reads nothing from disk: Claude Code hands the hook the file as it was before the Edit. For a missing file it lists file names in the nearest existing folder and in the session's folder, skipping dependency and build folders, for at most 400 ms.
- **Writes** nothing, and keeps no logs or state.
- **Runs** `node scripts/edit-doctor.mjs` after each batch of tool calls and after each successful Edit. When the batch has no failure it can explain, which is nearly always, it exits after reading its input, about 20 ms on top of starting Node.
- **Sends** nothing over the network. There is no telemetry and no account. See [PRIVACY.md](PRIVACY.md).

Its notes go into your conversation with Claude, like any other hook output.

## Limits

- It explains failures; it never changes a call or retries one itself, so Claude stays in charge of the fix.
- It reads the file as it is when the hook runs, a moment after the failure.
- Claude Code already matches curly quotes to straight ones, and escaped text to the characters it stands for, so edit-doctor doesn't report those.
- It covers Edit (and MultiEdit, where present) for text that doesn't match, and Edit, Read and NotebookEdit for missing files. The replace_all report covers Edit only.
- It reports what replace_all did; it doesn't undo it. Claude decides whether a change inside a longer word was wanted.

## Requirements

- A Claude Code version with the PostToolBatch hook event. Verified on 2.1.281 and 2.1.299 on Windows 11.
- Node.js 20 or later on your `PATH`.

## Development

`node --test` runs the tests. They need nothing beyond Node.

## License

MIT. See [LICENSE](LICENSE).
