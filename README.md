# Google Docs Message Board Archive Script

This folder contains a ready-to-paste Apps Script file:

- `Code.gs`

Use it as a container-bound script inside the Google Doc that contains your manually created tabs.

## Quick Customization

Edit the `CONFIG` block at the top of `Code.gs` to customize the script. You can change the Google Docs tab names, collaborator names, collaborator archive colors, timezone, daily trigger hour, archive font size, Done row label, unchecked marker, and the three message-board category labels. Any collaborator name or category label changed in `CONFIG` must also be changed in the Google Docs table, because the script uses those labels to find the correct cells.

## Required Google Doc Setup

Create two Google Docs tabs:

- `Message Board`
- `Archive`

If you use different tab names, edit the `CONFIG` block at the top of `Code.gs`.

## Message Board Layout

The `Message Board` tab needs one shared table.

The first column must contain the category labels exactly as configured in `Code.gs`.
The user names must appear in the header row exactly as configured.
The final row must be named `Done`.

Example:

| Category | Collaborator 1 | Collaborator 2 |
| --- | --- | --- |
| Ideas for collaboration today |  |  |
| Questions about the other person's project |  |  |
| Part of my project I want feedback on |  |  |
| Done | [ ] | [ ] |

When both collaborators are ready to archive the board, both should replace `[ ]` with `[x]`.

Accepted Done markers:

- `[x]`
- `x`
- `done`
- `true`
- `yes`
- `y`
- `checked`
- `1`

Google Docs visual checklist boxes are not reliable for Apps Script automation, so the Done row should contain readable text.

## Archive Format

The archive is compact plain text.

Each successful archive appends:

```text
2026-06-27 05:00:00 CEST
Collaborator 1: Ideas: none. Question: what should I do with X? Feedback: good job with Y.
Collaborator 2: Ideas: let's try Z. Question: none. Feedback: can you review A?
```

The timestamp and collaborator paragraphs use small text.
Each collaborator paragraph uses the color configured for that collaborator in `Code.gs`.

## Install Steps

1. Open the Google Doc.
2. Go to `Extensions` > `Apps Script`.
3. Paste `Code.gs` into the editor.
4. Edit `CONFIG.COLLABORATORS` with the two real collaborator names and colors.
5. Save the script.
6. Run `validateBoardStructure` once and authorize the script.
7. Reload the Google Doc.
8. Use `Message Board` > `Validate Board Structure`.
9. Use `Message Board` > `Install 5AM Trigger`.

## Daily Behavior

At about 5AM in `Europe/Budapest`, the script checks the Done row.

If both collaborators are marked done:

- Appends one compact archive entry to the `Archive` tab.
- Copies both collaborators' three category responses.
- Clears both collaborators' board cells.
- Resets both Done markers to `[ ]`.

If either collaborator is not marked done, nothing is archived or cleared.

## Customization

Most behavior is controlled from the `CONFIG` block at the top of `Code.gs`. You can change the tab names, collaborator names, collaborator colors, timezone, 5AM trigger hour, archive font size, Done row label, unchecked marker, and the three category labels. If you rename collaborators or categories in `CONFIG`, make the same change in the Google Docs table; the script matches those labels to find the right cells.

Set each collaborator's archive color like this:

```js
COLLABORATORS: Object.freeze([
  Object.freeze({
    name: 'Collaborator 1',
    color: '#1a73e8',
  }),
  Object.freeze({
    name: 'Collaborator 2',
    color: '#c5221f',
  }),
]),
```

Use any valid hex color. The collaborator paragraph in the archive will use that color, and the `Ideas:`, `Question:`, and `Feedback:` labels will be bold.
