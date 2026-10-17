# Changelog

## 1.1.0 - 2026-10-17

- PostToolUse hook on Edit: after a replace_all that changed more than one place, tells Claude
  how many occurrences changed, on which lines, and which were inside a longer word (`foo` in
  `foobar`). Claude Code itself only says "All occurrences were successfully replaced".

## 1.0.0 - 2026-10-07

- PostToolBatch hook that explains Edit failures before Claude's next step.
- "String to replace not found": finds old_string again with whitespace, invisible characters and
  typography set aside, lists each difference by line and column, quotes the exact file text, and
  falls back to the closest lines when the text changed.
- "Found N matches": lists each match and the neighbouring line that makes it unique.
- "File does not exist" (Edit, Read, NotebookEdit): suggests the files that were probably meant.
