(function (root) {
  "use strict";
  // One bounded startup run. The observer and input listeners are disconnected
  // on completion, failure or user interaction; manual navigation stays manual.
  class Controller {
    constructor({adapter, resolve, preferences, document, onStatus = () => {},
      quietMs = 700, timeoutMs = 30000, retryMs = 120, maxAttempts = 3}) {
      Object.assign(this, {adapter, resolve, preferences, document, onStatus,
        quietMs, timeoutMs, retryMs, maxAttempts});
      this.status = {state: "waiting", message: "Waiting for document tabs…"};
      this.attempts = new Map();
      this.signature = "";
      this.done = false;
      this.onInput = event => {
        if (event.isTrusted) this.stop("paused", "Opening layout stopped because you started interacting. Use Apply now to retry.");
      };
    }
    report(state, message) { this.status = {state, message}; this.onStatus(this.status); }
    start() {
      const view = this.document.defaultView;
      this.observer = new view.MutationObserver(() => this.schedule());
      this.observer.observe(this.document.documentElement, {childList: true, subtree: true,
        attributes: true, attributeFilter: ["aria-expanded", "aria-hidden", "aria-selected", "class", "style"]});
      for (const event of ["pointerdown", "keydown"]) this.document.addEventListener(event, this.onInput, true);
      this.deadline = setTimeout(() => this.stop("error", "Could not finish the opening layout. Open the Docs tab sidebar, then use Apply now."), this.timeoutMs);
      this.schedule(0);
      return this;
    }
    schedule(delay = this.retryMs) {
      if (this.done || this.timer) return;
      this.timer = setTimeout(() => { this.timer = null; this.tick(); }, delay);
    }
    tick() {
      if (this.done) return;
      try {
        const nodes = this.adapter.scan();
        if (!nodes.length) { this.schedule(); return; }
        const plan = this.resolve(nodes, this.preferences);
        const signature = JSON.stringify(plan.map(n => [n.id, n.parentId, n.branch, n.expanded, n.desired]));
        if (signature !== this.signature) {
          this.signature = signature;
          this.stableSince = Date.now();
        }
        const pending = plan.filter(n => n.branch && n.expanded !== n.desired);
        if (!pending.length) {
          if (Date.now() - this.stableSince >= this.quietMs) {
            this.stop("applied", "Opening layout applied. Manual changes are now left alone.");
          } else this.schedule();
          return;
        }
        this.report("applying", "Applying opening layout…");
        // Collapse deepest first; expand parents first. Hidden descendants
        // remain in the DOM (verified in the live sidebar).
        pending.sort((a, b) => Number(a.desired) - Number(b.desired) ||
          (a.desired ? a.depth - b.depth : b.depth - a.depth));
        const next = pending[0];
        const count = this.attempts.get(next.id) || 0;
        if (count >= this.maxAttempts) {
          this.stop("error", "Google Docs did not accept a tab change. No more automatic attempts will be made."); return;
        }
        this.attempts.set(next.id, count + 1);
        this.adapter.setExpanded(next.id, next.desired);
        this.schedule();
      } catch (error) { this.stop("error", error.message); }
    }
    stop(state, message) {
      if (this.done) return;
      this.done = true;
      clearTimeout(this.timer); clearTimeout(this.deadline);
      this.observer?.disconnect();
      for (const event of ["pointerdown", "keydown"]) this.document.removeEventListener(event, this.onInput, true);
      this.report(state, message);
    }
  }
  root.DocsLayoutController = Controller;
  if (typeof module !== "undefined") module.exports = Controller;
})(globalThis);
