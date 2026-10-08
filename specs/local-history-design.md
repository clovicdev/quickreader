# Local document history design

## Goal

Let a visitor return to a previously opened document, continue its saved edits, and download the original or an edited export without uploading files.

## Approach

- Store each document and its editing snapshot in IndexedDB in the current browser profile.
- Keep the original file blob, document kind, filename, and last-opened time with the snapshot.
- Save DOCX HTML, PDF annotations, and image adjustments so reopening a history item restores its editing state.
- Show recent documents on the home screen, with actions to reopen, download the original, and remove an entry.
- Route the reader Home button through the existing unsaved-changes confirmation.

## Boundaries

History is local to the browser profile and this site origin. It does not identify a real person, sync between devices, or provide an account system. People sharing the same browser profile share its history. Files remain in local browser storage unless the visitor downloads them.

## Data safety

- Keep rendering paths unchanged and sanitize DOCX HTML before display or export.
- Use structured IndexedDB transactions and surface storage failures without blocking document use.
- Allow users to remove history entries. Do not send document content to a server.

## Acceptance criteria

- Opening a file adds it to local history.
- Reopening an entry restores the original and its latest saved DOCX/PDF/image edits.
- Downloading an unchanged history entry downloads the original; after edits, the regular download action exports the edited copy.
- Home navigation asks before discarding unsaved work.
- History is scoped to the current browser profile.
