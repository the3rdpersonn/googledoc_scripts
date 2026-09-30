(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let tabId;
  let busy = false;
  let poll;
  function error(message) {
    $("status").textContent = message;
    $("status").dataset.state = "error";
  }
  async function send(type, values = {}) {
    const response = await browser.tabs.sendMessage(tabId, {type, ...values});
    if (!response?.ok) throw new Error(response?.error || "Could not read the tab layout.");
    return response;
  }
  function render(data) {
    const {nodes, status} = data;
    $("status").textContent = status.message;
    $("status").dataset.state = status.state;
    const current = nodes.find(n => n.current);
    $("current").textContent = current ? `Current tab: ${current.title}` : "";
    $("tabs").replaceChildren();
    for (const node of nodes) {
      const li = document.createElement("li");
      li.style.setProperty("--depth", node.depth);
      li.dataset.current = node.current;
      const name = document.createElement("span"); name.className = "name";
      name.textContent = node.title;
      if (node.current || node.forced) {
        const detail = document.createElement("span"); detail.className = "detail";
        detail.textContent = node.forced ? "Expanded to expose a child" : "Current tab";
        name.append(detail);
      }
      li.append(name);
      if (node.branch) {
        const button = document.createElement("button"); button.className = "toggle";
        button.textContent = node.desired ? "Expanded" : "Collapsed";
        button.setAttribute("aria-pressed", String(node.desired));
        button.setAttribute("aria-label", `${node.title}: ${button.textContent} on opening`);
        button.addEventListener("click", () => act("layout:set", {id: node.id, expanded: !node.desired}));
        li.append(button);
      } else {
        const leaf = document.createElement("span"); leaf.className = "leaf";
        leaf.textContent = "No subtabs"; li.append(leaf);
      }
      $("tabs").append(li);
    }
    $("apply").disabled = !nodes.length;
    $("reset").disabled = !nodes.length;
    clearTimeout(poll);
    if (["waiting", "applying"].includes(status.state)) {
      poll = setTimeout(() => { if (!busy) refresh(); }, 600);
    }
  }
  async function refresh() {
    try { render(await send("layout:get")); }
    catch (e) { error(e.message); }
  }
  async function act(type, values) {
    if (busy) return;
    busy = true; clearTimeout(poll);
    for (const button of document.querySelectorAll("button")) button.disabled = true;
    try { render(await send(type, values)); }
    catch (e) { await refresh(); error(`Not saved/applied: ${e.message}`); }
    finally { busy = false; }
  }
  $("apply").addEventListener("click", () => act("layout:apply"));
  $("reset").addEventListener("click", () => act("layout:reset"));
  (async () => {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    tabId = tab?.id;
    if (tabId == null) throw new Error("Open a Google Doc first.");
    try { render(await send("layout:get")); }
    catch (_) { throw new Error("Open or refresh a Google Doc. If it still cannot connect, allow this extension access to docs.google.com in Firefox’s extension settings."); }
  })().catch(e => error(e.message));
})();
