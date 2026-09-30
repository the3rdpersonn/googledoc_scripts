(function () {
  "use strict";
  const id = DocsLayoutCore.documentId(location.href);
  if (!id) return;
  const adapter = new DocsLayoutAdapter(document);
  const store = new DocsLayoutStore(browser.storage.local, id);
  let controller;
  let status = {state: "waiting", message: "Waiting for document tabs…"};
  let queue = Promise.resolve();

  async function apply() {
    controller?.stop("paused", "Restarting layout application…");
    const preferences = await store.read();
    controller = new DocsLayoutController({adapter, resolve: DocsLayoutCore.resolve,
      preferences, document, onStatus: value => { status = value; }}).start();
  }
  async function snapshot() {
    const nodes = adapter.scan();
    const preferences = await store.read();
    return {ok: true, documentId: id, status, nodes: DocsLayoutCore.resolve(nodes, preferences)};
  }
  async function handle(message) {
    if (DocsLayoutCore.documentId(location.href) !== id) throw new Error("Document changed. Refresh this page.");
    if (message.type === "layout:get") return snapshot();
    if (message.type === "layout:set") {
      const nodes = adapter.scan();
      controller?.stop("paused", "Opening preference changed. Use Apply now to preview it.");
      await store.set(nodes, message.id, message.expanded);
      status = {state: "saved", message: "Saved for next opening. Use Apply now to preview."};
      return snapshot();
    }
    if (message.type === "layout:reset") {
      controller?.stop("paused", "Resetting opening preferences…");
      await store.reset();
      await apply();
      return snapshot();
    }
    if (message.type === "layout:apply") { await apply(); return snapshot(); }
    throw new Error("Unknown layout request.");
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || !message?.type?.startsWith("layout:")) return;
    const result = queue.then(() => handle(message)).catch(error => ({ok: false, error: error.message}));
    queue = result.then(() => {});
    return result;
  });
  // Hydration happens before the first layout change. A storage failure must
  // never silently replace the user's preferences with collapse-all.
  queue = apply().catch(error => { status = {state: "error", message: error.message}; });
  addEventListener("pagehide", () => controller?.stop("paused", "Page closed."), {once: true});
})();
