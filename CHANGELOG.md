# Changelog

## 1.0.0 - 2026-10-07

- PostToolBatch hook that explains Edit failures before Claude's next step.
- "String to replace not found": finds old_string again with whitespace, invisible characters and
  typography set aside, lists each difference by line and column, quotes the exact file text, and
  falls back to the closest lines when the text changed.
- "Found N matches": lists each match and the neighbouring line that makes it unique.
- "File does not exist" (Edit, Read, NotebookEdit): suggests the files that were probably meant.
