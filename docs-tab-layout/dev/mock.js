/* Synthetic preview data only; not a live document connection. */
const previewNodes = [
  {id:'t.0',parentId:null,depth:0,title:'Research',branch:true},
  {id:'t.a',parentId:'t.0',depth:1,title:'Experiments',branch:true},
  {id:'t.b',parentId:'t.a',depth:2,title:'Results',branch:false,current:true},
  {id:'t.c',parentId:'t.0',depth:1,title:'Archive',branch:true},
  {id:'t.d',parentId:'t.c',depth:2,title:'Older notes',branch:false},
  {id:'t.e',parentId:null,depth:0,title:'Draft',branch:true},
  {id:'t.f',parentId:'t.e',depth:1,title:'Introduction',branch:false},
  {id:'t.g',parentId:null,depth:0,title:'References',branch:false}
];
let previewPrefs = JSON.parse(localStorage.getItem('previewPrefs') || '{}');
let previewStatus = {state:'applied',message:'Preview only — no live document is connected.'};
window.browser = {tabs:{async query(){return [{id:1}];},async sendMessage(id,message){
  if(message.type==='layout:set') {
    for(const child of DocsLayoutCore.descendants(previewNodes,message.id)) delete previewPrefs[child];
    previewPrefs[message.id]=message.expanded;
    previewStatus={state:'saved',message:'Saved for next opening. Use Apply now to preview.'};
  }
  if(message.type==='layout:reset') previewPrefs={};
  if(['layout:apply','layout:reset'].includes(message.type)) previewStatus={state:'applied',message:'Opening layout applied. Manual changes are now left alone.'};
  localStorage.setItem('previewPrefs',JSON.stringify(previewPrefs));
  return {ok:true,status:previewStatus,nodes:DocsLayoutCore.resolve(previewNodes,previewPrefs)};
}}};
