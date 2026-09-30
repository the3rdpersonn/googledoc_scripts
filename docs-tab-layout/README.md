# Docs Tab Layout for Firefox

Google Docs opens with its tab branches collapsed. A small extension popup lets
you choose which branches start expanded for each document.

## Try it

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Select **Load Temporary Add-on…**.
3. Choose `docs-tab-layout/extension/manifest.json` from your local copy of this repository.
4. Refresh your Google Doc. Allow access to `docs.google.com` if Firefox requests it.
5. Open **Docs Tab Layout** from Firefox's extensions button (pin it if useful).

Temporary installation ends when Firefox exits. The ZIP in `dist` is an unsigned
source package, not a permanently installable add-on. Normal permanent Firefox
installation requires Mozilla signing; it can be signed as an unlisted personal
extension without a public listing. Do not disable Firefox signature checks.
Version 0.1.0 has been approved for unlisted distribution by Mozilla. The signed
XPI is distributed separately; this repository contains source code. For permanent
installation of that file, follow [INSTALL.txt](INSTALL.txt).

## Controls

- The list shows each document tab and highlights the currently selected tab.
- **Collapsed / Expanded** is the saved opening state, not its live appearance.
- Changing a branch resets its descendant exceptions. Set parents first, then
  configure children. Expanded opens the entire subtree unless a child has an exception.
- An expanded child exposes its ancestor path without expanding sibling branches.
- Tabs without subtabs show **No subtabs**; they have nothing to fold.
- **Apply now** previews saved preferences without reopening.
- **Reset to all collapsed** clears this document's preferences and applies the default.
- Manual opening/closing after initialization does not change your saved preferences.
- Heading outlines inside individual tabs are unchanged. This version controls subtabs.

If you interact with the document while its opening layout is still being applied,
the extension stops rather than fighting your navigation. Use **Apply now** to retry.
If the sidebar is hidden or loads too slowly, open it and use **Apply now**.

## Scope and privacy

Runs only on Google Docs document pages. Uses the visible sidebar's DOM and its
existing disclosure controls. No document-content edits, Google API credentials,
server, analytics, external requests or cloud sync. Preferences contain only document
IDs, tab IDs and booleans, stored in extension-local storage in this Firefox profile.
Tab titles are read for display but not saved. Settings do not alter collaborators'
views. Firefox's host permission describes broader page access than this code uses.

## Validation status

Automatic collapse and per-tab settings have been confirmed working in Firefox.
The sidebar structure was also inspected in a live Google Doc. Automated tests
cover layout rules, startup behavior, storage, messaging, and popup rendering.
Mozilla extension validation passed with no errors or warnings.

## Development

Plain JavaScript, no runtime dependencies and no build step for loading the source.

```text
pnpm install --frozen-lockfile
pnpm test
pnpm lint:extension
pnpm build
```

`core.js`: layout policy. `adapter.js`: Google sidebar selectors and input events.
`controller.js`: bounded startup lifecycle. `store.js`: local persistence.
`content.js`: Firefox messaging. `popup.*`: list interface.

Selectors were observed on 2026-09-30. A future Google UI change may require an
adapter update. The extension stops with an error if it cannot recognize the controls.
Initialization waits up to 30 seconds and stops after a stable result; extremely
late content can need a manual retry. A short flash of the original layout is possible.

`dev/preview.cjs` serves a synthetic popup preview on localhost port 8876. It is not
part of the packaged extension. Tests use anonymous fixtures; no document prose is bundled.

## Final Firefox acceptance check

1. Open the document via both its sharing link and a link to a nested tab. Expect
   only parent tabs by default, with the selected content unchanged.
2. Set one parent to Expanded and one of its child branches to Collapsed. Refresh.
3. Expand a branch manually and wait: it should stay expanded.
4. Reopen the popup: its labels must still show the saved opening preferences.
5. Test a second document: it should use independent defaults.
6. On a disposable test document, rename/reorder a tab and add a new one. Existing
   preferences should follow IDs; the new tab inherits its parent.
7. After a signed installation, restart Firefox and repeat the opening check.

References:
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
- https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
