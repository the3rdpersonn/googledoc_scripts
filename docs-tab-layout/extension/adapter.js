/* Selectors observed in the live Docs sidebar on 2026-09-30.
 * No editor content, Google internal objects or network APIs are accessed. */
(function (root) {
  "use strict";
  const TREE = '[role="tree"][aria-labelledby="kix-outlines-widget-header-text-chaptered"]';
  const CONTAINER = ".chapter-container";
  const ROW = ':scope > .chapter-item > [role="treeitem"]';
  function tabId(container) {
    const prefix = "chapter-container-";
    if (!container.id.startsWith(prefix)) throw new Error("Unknown tab identifier format.");
    // The original tab has an empty DOM suffix but uses tab=t.0 in its URL.
    const id = container.id.slice(prefix.length) || "t.0";
    if (!/^t\.[\w-]+$/.test(id)) throw new Error("Unknown tab identifier format.");
    return id;
  }
  class Adapter {
    constructor(document) { this.document = document; }
    tree() { return this.document.querySelector(TREE); }
    scan() {
      const tree = this.tree();
      if (!tree) return [];
      const nodes = [...tree.querySelectorAll(CONTAINER)].map(container => {
        const row = container.querySelector(ROW);
        if (!row) throw new Error("Google Docs changed its sidebar structure.");
        const parent = container.parentElement.closest(CONTAINER);
        const arrow = row.querySelector('.chapterItemArrowContainer[role="button"]');
        const children = [...container.children].find(el => el.getAttribute("role") === "group");
        const branch = !!children?.querySelector(CONTAINER);
        const state = arrow?.getAttribute("aria-expanded");
        if (branch && (!arrow || !["true", "false"].includes(state) || arrow.getAttribute("aria-hidden") === "true")) {
          throw new Error("Tab controls are not ready or Google Docs changed them.");
        }
        let depth = 0;
        for (let p = parent; p; p = p.parentElement.closest(CONTAINER)) depth++;
        return {id: tabId(container), parentId: parent ? tabId(parent) : null,
          title: row.getAttribute("aria-label") || row.querySelector(".chapter-label-content")?.textContent || "Untitled tab",
          depth, branch, expanded: branch ? state === "true" : null,
          current: row.getAttribute("aria-selected") === "true"};
      });
      if (new Set(nodes.map(n => n.id)).size !== nodes.length) throw new Error("Duplicate tab identifiers.");
      return nodes;
    }
    setExpanded(id, expanded) {
      const tree = this.tree();
      const container = [...(tree?.querySelectorAll(CONTAINER) || [])].find(c => tabId(c) === id);
      const row = container?.querySelector(ROW);
      const button = row?.querySelector('.chapterItemArrowContainer[role="button"]');
      if (!button || button.getAttribute("aria-hidden") === "true") throw new Error("Tab disclosure control unavailable.");
      if (button.getAttribute("aria-expanded") === String(expanded)) return;
      const view = this.document.defaultView;
      // Closure goog.ui controls activate on mouseup. A click alone may do nothing.
      // Recheck state between events so controls listening on multiple events
      // cannot be toggled twice. Do not focus/select the document tab.
      for (const type of ["mousedown", "mouseup", "click"]) {
        button.dispatchEvent(new view.MouseEvent(type, {bubbles: true, cancelable: true,
          view, button: 0, buttons: type === "mousedown" ? 1 : 0}));
        if (button.getAttribute("aria-expanded") === String(expanded)) break;
      }
    }
  }
  root.DocsLayoutAdapter = Adapter;
  if (typeof module !== "undefined") module.exports = Adapter;
})(globalThis);
