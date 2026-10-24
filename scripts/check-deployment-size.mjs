import {readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
let bytes=0,files=0;
function scan(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
 const path=join(directory,entry.name);
 if(entry.isDirectory())scan(path);else{bytes+=statSync(path).size;files++;}
}}
scan(root);
console.log(`Deployment files: ${files}, ${(bytes/1048576).toFixed(2)} MiB.`);
// Leave room for archive metadata within the platform's 256 MiB expanded limit.
if(bytes>255*1048576)throw Error('Deployment output exceeds the 255 MiB safety budget');
