# Safari saves again; "Back up now" is the safety

**Decided 2026-09-23, Darren.** Replaces the 2026-09-19 rule that a browser with
no folder picker is a reader.

Read-only Safari broke the thing that made Q good: saving was instant because it
went into the browser's own storage. That storage is the fastest, hottest place
to work, so it is where work goes again, on every browser that has it (Safari on
Mac, iPhone and iPad; Firefox).

The risk is unchanged and is now answered by one button instead of a wall:

- Safari clears a site not opened for **seven days**, and any "clear website
  data" clears it sooner.
- **Back up now** (header, and on Keys → folder) takes the whole vault out as one
  zip — every locked file, the manifest and `ucan/` tokens. Share sheet on a
  phone or tablet (Save to Files → iCloud Drive); a download on a computer.
- **Restore** takes that zip, or the folder it was unzipped into. Files are named
  by their contents, so restoring over the top is always safe.
- The button carries a dot when there is something new since the last backup,
  and turns amber only after five days. Nothing else interrupts.

Chrome and Edge with a real folder are unchanged and show no button.

Code: `q-core/browser.ts` (`backup` flag), `folder.ts` (`backupNow`,
`restoreVault`, `watchBackup`), `zip.ts` (`unzip`), `keeping.ts` (risk now turns
on the age of the last backup), `apps/q/.../BackupButton.svelte`,
`VaultTransfer.svelte`.

Same change, for latency: `listItems` and the ledger keep what they read per
file version (a locked file's name is its hash) and read in parallel;
overlapping ledger refreshes coalesce into one; notifications poll only while
the tab is visible and online.
