# edit-doctor plugin privacy policy

Last updated: October 7, 2026

The edit-doctor plugin for Claude Code collects no data. It has no servers, no accounts, no
analytics and no telemetry, and it never connects to the network.

## What the plugin accesses

After each batch of tool calls, Claude Code passes the plugin the calls in that batch and their
results. The plugin looks only for Edit and Read calls that failed. When an Edit failed because
its text didn't match, the plugin reads the file that Edit targeted from your computer. When an
Edit or Read named a file that doesn't exist, the plugin lists file names in the nearest existing
folder and in your session's folder to suggest the file that was probably meant. It reads no
other files.

## What happens to that data

The plugin compares the file with the text Claude tried to replace and returns a short note to
Claude explaining the difference, which can quote a few lines of the file and name nearby files.
It writes nothing to disk and keeps no logs, caches or copies.

The note becomes part of your conversation with Claude, like any other hook output. How Anthropic
handles your conversations is covered by Anthropic's own privacy policy, not this one.

## Retention

None. Nothing outlives the hook call that read it.

## Changes and contact

Changes to this policy are made in this file and recorded in the repository's history. Questions
go to [github.com/derekwden-droid/edit-doctor/issues](https://github.com/derekwden-droid/edit-doctor/issues).
