import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export function createSiteSnapshotStore({ directory, freshMs=10000, maxAgeMs=300000,
  maxEntries=128, maxBytes=512*1024, maxTotalBytes=16*1024*1024, now=Date.now }={}) {
  const entries=new Map(),pending=new Map();let writes=Promise.resolve(),epoch=0;
  mkdirSync(directory,{recursive:true,mode:0o700});
  for(const file of readdirSync(directory)) {
    if(!/^[a-f0-9]{64}\.json$/.test(file))continue;
    try {const record=JSON.parse(readFileSync(join(directory,file),'utf8'));
      if(now()-record.at<maxAgeMs && record.at<=now())entries.set(file.slice(0,-5),record);
      else unlinkSync(join(directory,file));
    } catch {try {unlinkSync(join(directory,file));}catch {}}
  }
  function trim(){
    for(const [key,value]of entries)if(now()-value.at>=maxAgeMs){entries.delete(key);try{unlinkSync(join(directory,key+'.json'));}catch{}}
    while(entries.size>maxEntries || [...entries.values()].reduce((sum,record)=>sum+Buffer.byteLength(JSON.stringify(record)),0)>maxTotalBytes){const key=entries.keys().next().value;entries.delete(key);try{unlinkSync(join(directory,key+'.json'));}catch{}}
  }
  trim();
  const cleanup=setInterval(trim,60000);cleanup.unref?.();
  return {
    key(context){return createHash('sha256').update(JSON.stringify([epoch,context])).digest('hex');},
    get(key){trim();const record=entries.get(key);return record?{...record,fresh:now()-record.at<freshMs}:null;},
    begin(key){if(pending.has(key))return{owner:false,promise:pending.get(key).promise};
      let resolve;const promise=new Promise(done=>resolve=done);pending.set(key,{promise,resolve,epoch});return{owner:true,promise};},
    finish(key,value,error=null){
      if(!error&&value&&!value.error&&pending.get(key)?.epoch===epoch){const record={at:now(),value},bytes=JSON.stringify(record);
        if(Buffer.byteLength(bytes)<=maxBytes){entries.delete(key);entries.set(key,record);trim();
          writes=writes.then(async()=>{if(entries.get(key)!==record)return;const file=join(directory,key+'.json'),temp=file+'.'+randomUUID()+'.tmp';
            await writeFile(temp,bytes,{mode:0o600});await rename(temp,file);trim();
          }).catch(error=>console.warn('[SITE CONSULTAS] Falha ao salvar:',error.code||error.name));}}
      pending.get(key)?.resolve({value,error});pending.delete(key);
    },
    invalidate(){epoch++;entries.clear();writes=writes.then(()=>{for(const file of readdirSync(directory))
      if(/^[a-f0-9]{64}\.json$/.test(file))try{unlinkSync(join(directory,file));}catch{}
    }).catch(error=>console.warn('[SITE CONSULTAS]',error.code||error.name));},
    async flush(){await writes;},close(){clearInterval(cleanup);},size(){return entries.size;}
  };
}
