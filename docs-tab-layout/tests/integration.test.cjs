const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
require('../extension/core.js');
const Store = require('../extension/store.js');
function storage(data={}) {
  return {data, async get(){return {...data};}, async set(v){Object.assign(data,v);},
    async remove(keys){for(const key of keys) delete data[key];}};
}
test('storage isolates documents; branch changes clear child exceptions; restart restores preferences',async()=>{
  const s=storage(); const a=new Store(s,'docA'); const b=new Store(s,'docB');
  const nodes=[{id:'t.0',parentId:null},{id:'t.1',parentId:'t.0'},{id:'t.2',parentId:null}];
  await a.set(nodes,'t.0',true); await a.set(nodes,'t.1',false); await b.set(nodes,'t.0',false);
  assert.deepEqual({...await new Store(s,'docA').read()},{'t.0':true,'t.1':false});
  await a.set(nodes,'t.0',false);
  assert.deepEqual({...await a.read()},{'t.0':false});
  assert.deepEqual({...await b.read()},{'t.0':false});
  await a.reset(); assert.deepEqual({...await a.read()},{});
  assert.deepEqual({...await b.read()},{'t.0':false});
});
test('independent tab writes preserve each other',async()=>{
  const s=storage(); const a=new Store(s,'doc'); const b=new Store(s,'doc');
  const nodes=[{id:'t.a',parentId:null},{id:'t.b',parentId:null}];
  await Promise.all([a.set(nodes,'t.a',true),b.set(nodes,'t.b',false)]);
  assert.deepEqual({...await a.read()},{'t.a':true,'t.b':false});
});
test('content script messages save preferences and apply the selected layout',async()=>{
  const dom=new JSDOM(`<div role="tree" aria-labelledby="kix-outlines-widget-header-text-chaptered">
  <div class="chapter-container" id="chapter-container-"><div class="chapter-item"><div role="treeitem" aria-label="Parent" aria-selected="true"><div class="chapterItemArrowContainer" role="button" aria-expanded="true" aria-hidden="false"></div></div></div>
  <div role="group"><div class="chapter-container" id="chapter-container-t.child"><div class="chapter-item"><div role="treeitem" aria-label="Child"><div class="chapterItemArrowContainer" role="button" aria-expanded="true" aria-hidden="true"></div></div></div></div></div></div></div>`,
  {url:'https://docs.google.com/document/d/testDoc/edit',runScripts:'outside-only'});
  const w=dom.window; let receive;
  w.browser={storage:{local:storage()},runtime:{id:'test-extension',onMessage:{addListener(fn){receive=fn;}}}};
  w.document.addEventListener('mouseup',e=>{if(e.target.classList.contains('chapterItemArrowContainer')) e.target.setAttribute('aria-expanded',String(e.target.getAttribute('aria-expanded')!=='true'));});
  for(const file of ['core','adapter','controller','store','content']) w.eval(fs.readFileSync(path.join(__dirname,`../extension/${file}.js`),'utf8'));
  const send=(message)=>receive(message,{id:'test-extension'});
  assert.equal(receive({type:'layout:reset'},{id:'different-extension'}),undefined);
  let state=await send({type:'layout:get'});
  assert.equal(state.ok,true);
  state=await send({type:'layout:set',id:'t.0',expanded:true});
  assert.equal(state.nodes[0].desired,true);
  assert.equal(state.status.state,'saved');
  await send({type:'layout:apply'});
  await new Promise(r=>setTimeout(r,1000));
  state=await send({type:'layout:get'});
  assert.equal(state.status.state,'applied');
  assert.equal(state.nodes[0].expanded,true);
  await send({type:'layout:reset'});
  await new Promise(r=>setTimeout(r,1000));
  state=await send({type:'layout:get'});
  assert.equal(state.status.state,'applied');
  assert.equal(state.nodes[0].expanded,false);
  dom.window.close();
});
test('popup renders untrusted titles as text and reports save failure',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../extension/popup.html'),'utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}); const w=dom.window;
  let fail=false;
  w.browser={tabs:{async query(){return [{id:1}];},async sendMessage(id,message){
    if(fail && message.type==='layout:set') return {ok:false,error:'Storage unavailable'};
    return {ok:true,status:{state:'applied',message:'Applied'},nodes:[{id:'t.0',title:'<img src=x onerror=alert(1)>',depth:0,branch:true,current:true,desired:false}]};
  }}};
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/popup.js'),'utf8'));
  await new Promise(r=>setTimeout(r,10));
  assert.equal(w.document.querySelectorAll('img').length,0);
  assert.match(w.document.querySelector('#current').textContent,/<img/);
  assert.equal(w.document.querySelector('.toggle').textContent,'Collapsed');
  fail=true; w.document.querySelector('.toggle').click();
  await new Promise(r=>setTimeout(r,10));
  assert.match(w.document.querySelector('#status').textContent,/Storage unavailable/);
  assert.equal(w.document.querySelector('.toggle').disabled,false);
  dom.window.close();
});
