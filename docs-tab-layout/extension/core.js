/* Pure layout rules, independent of Google Docs and WebExtension APIs. */
(function (root) {
  "use strict";
  function documentId(url) {
    const u = new URL(url);
    if (u.origin !== "https://docs.google.com") return null;
    return u.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/)?.[1] || null;
  }
  function resolve(nodes, preferences = {}) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    if (byId.size !== nodes.length) throw new Error("Duplicate tab identifiers; layout was not applied.");
    const inherited = new Map();
    const visiting = new Set();
    function mode(id) {
      if (inherited.has(id)) return inherited.get(id);
      if (visiting.has(id)) throw new Error("Invalid tab hierarchy; layout was not applied.");
      visiting.add(id);
      const node = byId.get(id);
      if (!node) throw new Error("Incomplete tab hierarchy; layout was not applied.");
      // Resolve parents even with an override, to validate the hierarchy.
      const parent = node.parentId ? mode(node.parentId) : false;
      const value = typeof preferences[id] === "boolean" ? preferences[id] : parent;
      inherited.set(id, value);
      visiting.delete(id);
      return value;
    }
    nodes.forEach(n => mode(n.id));
    const desired = new Map(inherited);
    // An explicitly expanded descendant must be reachable. Do not propagate
    // this forced expansion to its siblings.
    for (const n of nodes) {
      if (!inherited.get(n.id)) continue;
      let parent = n.parentId;
      while (parent) {
        desired.set(parent, true);
        parent = byId.get(parent).parentId;
      }
    }
    return nodes.map(n => ({...n, desired: desired.get(n.id),
      inherited: !Object.hasOwn(preferences, n.id),
      forced: desired.get(n.id) !== inherited.get(n.id)}));
  }
  function descendants(nodes, id) {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) if (ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id); changed = true;
      }
    }
    ids.delete(id);
    return [...ids];
  }
  root.DocsLayoutCore = {documentId, resolve, descendants};
  if (typeof module !== "undefined") module.exports = root.DocsLayoutCore;
})(globalThis);
