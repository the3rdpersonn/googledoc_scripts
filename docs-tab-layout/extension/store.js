(function (root) {
  "use strict";
  class Store {
    constructor(storage, documentId) {
      this.storage = storage;
      this.prefix = `layout:v1:${documentId}:`;
    }
    async read() {
      const data = await this.storage.get(null);
      const result = Object.create(null);
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(this.prefix) && typeof value === "boolean") result[key.slice(this.prefix.length)] = value;
      }
      return result;
    }
    async set(nodes, id, value) {
      if (!nodes.some(n => n.id === id) || typeof value !== "boolean") throw new Error("Invalid tab preference.");
      // A branch toggle sets the entire subtree. Configure exceptions afterward.
      // Separate keys prevent unrelated preference writes from overwriting one another.
      const descendants = root.DocsLayoutCore.descendants(nodes, id);
      await this.storage.remove(descendants.map(child => this.prefix + child));
      await this.storage.set({[this.prefix + id]: value});
    }
    async reset() {
      const prefs = await this.read();
      await this.storage.remove(Object.keys(prefs).map(id => this.prefix + id));
    }
  }
  root.DocsLayoutStore = Store;
  if (typeof module !== "undefined") module.exports = Store;
})(globalThis);
