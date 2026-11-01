// Local preview of the public static artifact only. No model/environment service.
import fs from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../release/pages/',import.meta.url));
const port=Number(process.env.PORT||8090);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer between 1 and 65535.');
if(!fs.existsSync(root+'index.html')){console.error('请先运行 npm run build，再运行 npm run preview。');process.exit(1);}
const routes=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/version.json',['version.json','application/json; charset=utf-8']],['/THIRD_PARTY_NOTICES.txt',['THIRD_PARTY_NOTICES.txt','text/plain; charset=utf-8']]]);
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const item=routes.get(new URL(req.url,'http://localhost').pathname);
 if(!item||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
 try{const data=fs.readFileSync(root+item[0]);res.writeHead(200,{'Content-Type':item[1]});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(503);res.end('请重新运行 npm run build。');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'预览端口已占用，请关闭原预览或设置其他PORT。':error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('照影问剑 · 10版公开候选本机预览\nhttp://127.0.0.1:'+port+'/\n按 Control+C 停止；不调用模型、不读取密钥。'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
