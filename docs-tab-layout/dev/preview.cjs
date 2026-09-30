// Local popup preview only. This server and its mock data are not packaged.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '../extension');
const allowed = new Set(['popup.html','popup.css','popup.js','core.js','icon.svg']);
http.createServer((req,res)=>{
  const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'popup.html';
  if(file==='mock.js') {
    res.setHeader('Content-Type','text/javascript');
    res.end(fs.readFileSync(path.join(__dirname,'mock.js')));return;
  }
  if(!allowed.has(file)){res.writeHead(404);res.end();return;}
  let data=fs.readFileSync(path.join(base,file));
  if(file==='popup.html') data=data.toString().replace('<script src="popup.js">','<script src="core.js"></script><script src="mock.js"></script><script src="popup.js">');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
  res.end(data);
}).listen(8876,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8876'));
