const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const tick=()=>new Promise(r=>setTimeout(r,10));

function setup(){
  const dom=new JSDOM(readFileSync(resolve(root,'dist/index.html'),'utf8'),{url:'https://console.example/#overview',runScripts:'outside-only'});
  const w=dom.window,calls=[];
  w.confirm=()=>true;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.Blob=global.Blob;
  let exported;
  w.URL.createObjectURL=blob=>{exported=blob;return 'blob:test'};
  w.URL.revokeObjectURL=()=>{};
  let sessionResponse=null;
  const respond=value=>({ok:true,status:200,json:async()=>value});
  w.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/api/v1/health'))return respond({face_engine:'ready',liveness:'configured_unvalidated'});
    if(url.endsWith('/api/v1/sessions'))return sessionResponse?await sessionResponse():respond({session_id:'session-test',nonce:'nonce',expires_at:Date.now()/1000+120,challenge:['center','turn_left','turn_right']});
    if(url.endsWith('/api/v1/events'))return respond({events:[{id:'real-event',subject:'employee',status:'review_required',created:1,elapsed:50}]});
    return respond({status:'enrolled'});
  };
  w.eval(readFileSync(resolve(root,'dist/app.js'),'utf8')+'\nwindow.testState=()=>({activeSession,records,identities});');
  return {w,calls,exported:()=>exported,setSessionResponse:f=>{sessionResponse=f},close:()=>w.close()};
}

async function navigate(w,route){w.location.hash=route;await tick()}
async function connect(w,url='https://api-a.example'){
  await navigate(w,'settings');
  const form=w.document.querySelector('#connection-form');
  form.elements.namedItem('base').value=url;
  form.elements.namedItem('token').value='test-secret';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await tick();
  assert.match(w.document.querySelector('#connection-result').textContent,/Conectado/);
}

test('connected synthetic data stays synthetic; fetched events have API provenance',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'overview');
    w.document.querySelector('#export').click();
    assert.match(await env.exported().text(),/;demonstracao/);
    assert.doesNotMatch(await env.exported().text(),/;api/);
    w.document.querySelector('#refresh-events').click();await tick();
    assert.match(w.document.querySelector('#row-count').textContent,/eventos da API/);
    w.document.querySelector('#export').click();
    assert.match(await env.exported().text(),/;api/);
  }finally{env.close()}
});

test('session invalidates when subject or consent changes and on navigation',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'verify');
    w.document.querySelector('#verify-consent').checked=true;
    w.document.querySelector('#create-session').click();await tick();
    assert.equal(w.testState().activeSession.session_id,'session-test');
    const subject=w.document.querySelector('#verify-subject');
    subject.value='different-person';subject.dispatchEvent(new w.Event('input'));
    assert.equal(w.testState().activeSession,null);
    w.document.querySelector('#create-session').click();await tick();
    w.document.querySelector('#verify-consent').checked=false;
    w.document.querySelector('#verify-consent').dispatchEvent(new w.Event('input'));
    assert.equal(w.testState().activeSession,null);
    await navigate(w,'api');await navigate(w,'verify');
    assert.equal(w.testState().activeSession,null);
    assert.equal(w.document.querySelector('#verify-consent').checked,false);
  }finally{env.close()}
});

test('pending session response cannot reactivate a departed form',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'verify');
    let release;
    env.setSessionResponse(()=>new Promise(r=>{release=r}));
    w.document.querySelector('#verify-consent').checked=true;
    w.document.querySelector('#create-session').click();
    assert.equal(w.document.querySelector('#verify-subject').disabled,true);
    assert.equal(w.document.querySelector('#verify-consent').disabled,true);
    await navigate(w,'api');
    release({ok:true,status:201,json:async()=>({session_id:'stale',nonce:'n'})});await tick();
    await navigate(w,'verify');
    assert.equal(w.testState().activeSession,null);
  }finally{env.close()}
});

test('enrolled identity is cleared on backend switch; cURL expands shell secret',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'identities');
    const form=w.document.querySelector('#identity-form');
    form.elements.namedItem('name').value='Test Person';
    form.elements.namedItem('id').value='test_person';
    form.elements.namedItem('consent').checked=true;
    Object.defineProperty(form.elements.namedItem('reference'),'files',{configurable:true,value:[new w.File(['image'],'ref.png',{type:'image/png'})]});
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert(w.testState().identities.some(x=>x.real&&x.id==='test_person'));
    await connect(w,'https://api-b.example');
    assert(!w.testState().identities.some(x=>x.real));
    await navigate(w,'api');
    assert.match(w.document.querySelector('pre').textContent,/-H "Authorization: Bearer \$VERIFICA_ADMIN_KEY"/);
  }finally{env.close()}
});
