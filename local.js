/* Garajım — telefonda çalışan veri katmanı (IndexedDB). Claude yapıtındaki window.claude API'sinin yerel karşılığı. */
(function(){
  var DBN='garajim',VER=1,idb=null,docs=new Map(),files=new Map(),urls=new Map(),listeners=[];
  function open(){return new Promise(function(res,rej){var r=indexedDB.open(DBN,VER);
    r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('docs'))d.createObjectStore('docs');if(!d.objectStoreNames.contains('files'))d.createObjectStore('files')};
    r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
  function tx(store,mode,fn){return new Promise(function(res,rej){var t=idb.transaction(store,mode),s=t.objectStore(store),out=fn(s);t.oncomplete=function(){res(out)};t.onerror=t.onabort=function(){rej(t.error||{code:'idb'})}})}
  function all(store){return new Promise(function(res,rej){var out=[],r=idb.transaction(store).objectStore(store).openCursor();
    r.onsuccess=function(){var c=r.result;if(c){out.push([c.key,c.value]);c.continue()}else res(out)};r.onerror=function(){rej(r.error)}})}
  var ready=open().then(function(d){idb=d;return Promise.all([all('docs'),all('files')])}).then(function(r){
    r[0].forEach(function(kv){docs.set(kv[0],kv[1])});
    r[1].forEach(function(kv){files.set(kv[0],kv[1]);urls.set(kv[0],URL.createObjectURL(kv[1].blob))});
    try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  });
  function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
  function rid(){var a='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<20;i++)s+=a[Math.floor(Math.random()*a.length)];return s}
  function parent(p){return p.slice(0,p.lastIndexOf('/'))}
  function snapDoc(p){var d=docs.get(p);return{id:p.split('/').pop(),exists:!!d,data:function(){return clone(d)}}}
  function snapCol(p){var depth=p.split('/').length+1,out=[];docs.forEach(function(v,k){if(k.indexOf(p+'/')===0&&k.split('/').length===depth)out.push(snapDoc(k))});return{docs:out,size:out.length,empty:!out.length}}
  var pend=null;
  function notify(){if(pend)return;pend=setTimeout(function(){pend=null;listeners.slice().forEach(function(l){try{l.fn(l.col?snapCol(l.path):snapDoc(l.path))}catch(e){console.error(e)}})},0)}
  function write(p,val){if(val===undefined)docs.delete(p);else docs.set(p,val);notify();
    return tx('docs','readwrite',function(s){if(val===undefined)s.delete(p);else s.put(val,p)}).catch(function(e){throw{code:'storage',cause:e}})}
  function listen(path,col,fn){var l={path:path,col:col,fn:fn};listeners.push(l);setTimeout(function(){if(listeners.indexOf(l)>-1)fn(col?snapCol(path):snapDoc(path))},0);
    return function(){var i=listeners.indexOf(l);if(i>-1)listeners.splice(i,1)}}
  function docRef(p){return{id:p.split('/').pop(),path:p,
    get:function(){return Promise.resolve(snapDoc(p))},
    set:function(d){return write(p,clone(d))},
    update:function(d){if(!docs.has(p))return Promise.reject({code:'not_found'});var n=Object.assign({},docs.get(p),clone(d));Object.keys(n).forEach(function(k){if(n[k]&&n[k].__delete__)delete n[k]});return write(p,n)},
    delete:function(){return write(p,undefined)},
    onSnapshot:function(fn){return listen(p,false,fn)},
    collection:function(c){return colRef(p+'/'+c)}}}
  function colRef(p){return{path:p,
    doc:function(id){return docRef(p+'/'+(id||rid()))},
    add:function(d){var r=docRef(p+'/'+rid());return r.set(d).then(function(){return r})},
    get:function(){return Promise.resolve(snapCol(p))},
    onSnapshot:function(fn){return listen(p,true,fn)}}}
  var db={doc:docRef,collection:colRef};
  var assets={
    upload:function(blob,o){var id=rid()+rid().slice(0,12),type=(o&&o.type)||blob.type||'application/octet-stream',b=blob.type===type?blob:new Blob([blob],{type:type});
      return tx('files','readwrite',function(s){s.put({blob:b,type:type,t:Date.now()},id)}).then(function(){files.set(id,{blob:b,type:type});urls.set(id,URL.createObjectURL(b));return{id:id,url:urls.get(id)}},
        function(e){throw{code:(e&&e.name==='QuotaExceededError')?'quota_or_state':'storage'}})},
    delete:function(id){return tx('files','readwrite',function(s){s.delete(id)}).then(function(){var u=urls.get(id);if(u)URL.revokeObjectURL(u);urls.delete(id);files.delete(id);return{deleted:true}})}
  };
  function saveFile(name,blob){
    try{var f=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]}))return navigator.share({files:[f],title:name}).catch(function(e){if(e&&e.name==='AbortError')throw e;return dl()})}catch(e){}
    return dl();
    function dl(){var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},4000);return Promise.resolve()}}
  var downloads={save:function(o){var b=o.data instanceof Blob?o.data:new Blob([o.data],{type:o.type||'application/octet-stream'});return saveFile(o.filename||'dosya',b)}};
  var user={can:function(){return Promise.resolve(true)}};

  /* yedek */
  function b64(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result).split(',')[1])};r.onerror=rej;r.readAsDataURL(blob)})}
  function unb64(s,type){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:type})}
  function exportAll(){var out={app:'garajim',v:1,tarih:new Date().toISOString(),docs:{},files:{}};docs.forEach(function(v,k){out.docs[k]=v});
    var ids=Array.from(files.keys()),ch=Promise.resolve();
    ids.forEach(function(id){ch=ch.then(function(){var f=files.get(id);return b64(f.blob).then(function(s){out.files[id]={type:f.type,data:s}})})});
    return ch.then(function(){return new Blob([JSON.stringify(out)],{type:'application/json'})})}
  function importAll(text){var j;try{j=JSON.parse(text)}catch(e){return Promise.reject({code:'json'})}
    if(!j||j.app!=='garajim'||!j.docs)return Promise.reject({code:'format'});
    return tx('docs','readwrite',function(s){s.clear();Object.keys(j.docs).forEach(function(k){s.put(j.docs[k],k)})})
      .then(function(){return tx('files','readwrite',function(s){s.clear();Object.keys(j.files||{}).forEach(function(id){var f=j.files[id];s.put({blob:unb64(f.data,f.type),type:f.type,t:Date.now()},id)})})})
      .then(function(){return{docs:Object.keys(j.docs).length,files:Object.keys(j.files||{}).length}})}
  function usage(){return navigator.storage&&navigator.storage.estimate?navigator.storage.estimate():Promise.resolve(null)}

  window.claudeLocal={ready:ready,url:function(id){return id&&urls.get(id)||''},
    getBlob:function(id){return ready.then(function(){var f=files.get(id);if(!f)throw new Error('404');return f.blob})},
    exportAll:exportAll,importAll:importAll,saveFile:saveFile,usage:usage,count:function(){return{docs:docs.size,files:files.size}}};
  window.claude={use:function(n){return ready.then(function(){return{db:db,assets:assets,user:user,downloads:downloads}[n]||null},function(){return null})}};
})();
