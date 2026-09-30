const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const core = require('../extension/core.js');
const Adapter = require('../extension/adapter.js');
const Controller = require('../extension/controller.js');

// Reduced, anonymous fixture based on observed sidebar markup, not document prose.
function chapter(id, title, children = '', selected = false) {
  return `<div class="chapter-container" id="chapter-container-${id}"><div class="chapter-item">
    <div role="treeitem" aria-label="${title}" aria-selected="${selected}">
      <div class="chapter-item-arrow"><div class="chapterItemArrowContainer" role="button"
        aria-expanded="true" aria-hidden="${!children}"></div></div>
      <div class="chapter-label-content">${title}</div>
      <div role="button" aria-haspopup="true" aria-expanded="false">Options</div>
    </div><div class="updating-navigation-item-list"><div role="menu">Outline</div></div>
    </div>${children ? `<div role="group">${children}</div>` : '<div></div>'}</div>`;
}
function markup() {
  return `<div role="tree" aria-labelledby="kix-outlines-widget-header-text-chaptered">${
    chapter('', 'Parent', chapter('t.a', 'Same name', chapter('t.leaf', 'Leaf', '', true))) +
    chapter('t.b', 'Same name', chapter('t.c', 'Child'))}</div><textarea id="editor">Untouched</textarea>`;
}
function fixture(html = markup()) {
  const dom = new JSDOM(html, {url:'https://docs.google.com/document/d/demo/edit?tab=t.leaf'});
  const {document} = dom.window;
  document.addEventListener('mouseup', e => {
    if (!e.target.classList.contains('chapterItemArrowContainer')) return;
    const next = e.target.getAttribute('aria-expanded') !== 'true';
    e.target.setAttribute('aria-expanded', String(next));
    const group = [...e.target.closest('.chapter-container').children].find(x=>x.getAttribute('role')==='group');
    if (group) group.style.display = next ? '' : 'none';
  });
  return {dom, document, adapter:new Adapter(document)};
}
function run(f, preferences = {}, extras = {}) {
  return new Promise(resolve => {
    const controller = new Controller({adapter:f.adapter, resolve:core.resolve, preferences,
      document:f.document, quietMs:25, retryMs:5, timeoutMs:500, ...extras,
      onStatus: status => {if (['applied','error','paused'].includes(status.state)) resolve({controller,status});}});
    controller.start();
  });
}
const nodes = [
  {id:'root',parentId:null}, {id:'a',parentId:'root'}, {id:'aa',parentId:'a'},
  {id:'b',parentId:'root'}, {id:'other',parentId:null}
];
test('document identity ignores selected-tab and sharing query parameters',()=>{
  assert.equal(core.documentId('https://docs.google.com/document/d/abc/edit?tab=t.0'), 'abc');
  assert.equal(core.documentId('https://docs.google.com/document/u/1/d/abc/edit?usp=sharing'), 'abc');
  assert.equal(core.documentId('https://example.org/document/d/abc/edit'), null);
});
test('default closes every branch; expanded parent includes descendants',()=>{
  assert.ok(core.resolve(nodes).every(n=>!n.desired));
  assert.deepEqual(core.resolve(nodes,{root:true}).map(n=>n.desired),[true,true,true,true,false]);
});
test('collapsed subtree overrides expanded parent',()=>{
  assert.deepEqual(core.resolve(nodes,{root:true,a:false}).map(n=>n.desired),[true,false,false,true,false]);
});
test('expanded child exposes ancestors without opening sibling branches',()=>{
  assert.deepEqual(core.resolve(nodes,{aa:true}).map(n=>n.desired),[true,true,true,false,false]);
});
test('renaming, reordering and duplicate titles do not change identity',()=>{
  const reordered=[...nodes].reverse().map(n=>({...n,title:'duplicate'}));
  assert.equal(core.resolve(reordered,{a:true}).find(n=>n.id==='aa').desired,true);
});
test('new child inherits its branch; new root defaults collapsed',()=>{
  const plan=core.resolve([...nodes,{id:'new',parentId:'a'},{id:'newRoot',parentId:null}],{a:true});
  assert.equal(plan.find(n=>n.id==='new').desired,true);
  assert.equal(plan.find(n=>n.id==='newRoot').desired,false);
});
test('malformed hierarchy and duplicate IDs fail safely',()=>{
  assert.throws(()=>core.resolve([{id:'x',parentId:'x'}]),/hierarchy/);
  assert.throws(()=>core.resolve([{id:'x',parentId:'missing'}]),/hierarchy/);
  assert.throws(()=>core.resolve([{id:'x'},{id:'x'}]),/Duplicate/);
});
test('adapter finds original tab, nested hidden children, leaves and selection',()=>{
  const f=fixture(); const tabs=f.adapter.scan();
  assert.equal(tabs.length,5);
  assert.equal(tabs[0].id,'t.0');
  assert.equal(tabs.find(n=>n.id==='t.leaf').parentId,'t.a');
  assert.equal(tabs.find(n=>n.id==='t.leaf').current,true);
  assert.equal(tabs.find(n=>n.id==='t.leaf').branch,false);
  f.adapter.setExpanded('t.0',false);
  assert.equal(f.adapter.scan().length,5);
  f.dom.window.close();
});
test('collapse-all applies once, preserves selection/content, then permits manual expansion',async()=>{
  const f=fixture();
  const result=await run(f);
  assert.equal(result.status.state,'applied');
  assert.ok(f.adapter.scan().filter(n=>n.branch).every(n=>!n.expanded));
  assert.equal(f.adapter.scan().find(n=>n.current).id,'t.leaf');
  assert.equal(f.document.querySelector('#editor').value,'Untouched');
  f.adapter.setExpanded('t.0',true);
  await new Promise(r=>setTimeout(r,50));
  assert.equal(f.adapter.scan()[0].expanded,true);
  f.dom.window.close();
});
test('late sidebar is detected before applying',async()=>{
  const f=fixture(''); const task=run(f);
  setTimeout(()=>{f.document.body.innerHTML=markup();},30);
  assert.equal((await task).status.state,'applied');
  f.dom.window.close();
});
test('missing sidebar stops with an error instead of waiting forever',async()=>{
  const f=fixture('');
  assert.equal((await run(f,{}, {timeoutMs:30})).status.state,'error');
  f.dom.window.close();
});
test('unresponsive disclosure has bounded retries',async()=>{
  const f=fixture(); let clicks=0; f.adapter.setExpanded=()=>{clicks++;};
  assert.equal((await run(f)).status.state,'error');
  assert.equal(clicks,3);
  f.dom.window.close();
});
test('user interaction cancels startup immediately',async()=>{
  const f=fixture('');
  const c=new Controller({adapter:f.adapter, resolve:core.resolve, preferences:{}, document:f.document});
  c.start(); c.onInput({isTrusted:true});
  assert.equal(c.status.state,'paused'); assert.equal(c.done,true);
  f.dom.window.close();
});
test('synthetic events do not cancel startup and do not double-toggle',()=>{
  const f=fixture(); let changes=0;
  f.document.addEventListener('click',e=>{if(e.target.classList.contains('chapterItemArrowContainer')) changes++;});
  f.adapter.setExpanded('t.0',false);
  assert.equal(changes,0); // mouseup succeeded; no follow-up click
  assert.equal(f.adapter.scan()[0].expanded,false);
  f.dom.window.close();
});
