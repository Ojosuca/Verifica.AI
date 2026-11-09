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
  w.Blob=global.Blob;w.File=global.File;w.FormData=global.FormData;
  let exported;
  w.URL.createObjectURL=blob=>{exported=blob;return 'blob:test'};
  w.URL.revokeObjectURL=()=>{};
  let sessionResponse=null;let subjectResponse=null;let enrollmentResponse=null;
  const respond=value=>({ok:true,status:200,json:async()=>value});
  w.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/api/v1/subjects')&&(!options.method||options.method==='GET'))return subjectResponse?await subjectResponse():respond({subjects:[{subject_id:'employee',display_name:'Test Employee',created:1}],has_more:false});
    if(url.endsWith('/api/v1/subjects')&&options.method==='POST'&&enrollmentResponse)return await enrollmentResponse();
    if(url.includes('/verify'))return respond({decision:'review_required'});
    if(url.endsWith('/api/v1/health'))return respond({face_engine:'ready',liveness:'configured_unvalidated'});
    if(url.endsWith('/api/v1/sessions'))return sessionResponse?await sessionResponse():respond({session_id:'session-test',nonce:'nonce',expires_at:Date.now()/1000+120,challenge:['center','turn_left','turn_right']});
    if(url.endsWith('/api/v1/events'))return respond({events:[{id:'real-event',subject:'employee',status:'review_required',created:1,elapsed:50}]});
    return respond({status:'enrolled'});
  };
  w.eval(readFileSync(resolve(root,'dist/app.js'),'utf8')+'\nwindow.testState=()=>({activeSession,records,identities});');
  return {w,calls,exported:()=>exported,setSessionResponse:f=>{sessionResponse=f},setSubjectResponse:f=>{subjectResponse=f},setEnrollmentResponse:f=>{enrollmentResponse=f},close:()=>w.close()};
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
    assert(!w.testState().identities.some(x=>x.id==='test_person'));assert(w.testState().identities.every(x=>x.backend==='https://api-b.example'));
    await navigate(w,'api');
    assert.match(w.document.querySelector('pre').textContent,/-H "Authorization: Bearer \$VERIFICA_ADMIN_KEY"/);
  }finally{env.close()}
});

function fakeCamera(w,{denied=false,mp4=false}={}){
  const track={readyState:'live',stop(){this.readyState='ended'}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  Object.defineProperty(w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
    if(denied){const error=new Error('Permission denied');error.name='NotAllowedError';throw error}
    return stream;
  }}});
  w.HTMLMediaElement.prototype.play=async()=>{};
  Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{configurable:true,get:()=>640});
  Object.defineProperty(w.HTMLVideoElement.prototype,'videoHeight',{configurable:true,get:()=>480});
  w.MediaRecorder=class{
    static isTypeSupported(type){return mp4?type==='video/mp4':type==='video/webm'}
    constructor(stream,options){this.state='inactive';this.type=options.mimeType}
    start(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['video'],{type:this.type})});this.onstop()}
  };
  const schedule=w.setTimeout.bind(w);
  w.setTimeout=(callback,delay,...args)=>schedule(callback,delay===6000?1:delay,...args);
  return track;
}

test('record button explains missing authorization instead of doing nothing',async()=>{
  const env=setup(),{w,calls}=env;
  try{
    await connect(w);await navigate(w,'verify');
    const button=w.document.querySelector('#capture');
    assert.equal(button.disabled,false);
    button.click();await tick();
    assert.match(w.document.querySelector('#verify-result').textContent,/Marque a autorização/);
    assert.equal(button.disabled,false);
    assert(!calls.some(x=>x.url.includes('/sessions')));
  }finally{env.close()}
});

test('one click starts the camera, creates the session and sends an MP4 on supported browsers',async()=>{
  const env=setup(),{w,calls}=env;
  try{
    await connect(w);await navigate(w,'verify');fakeCamera(w,{mp4:true});
    assert.equal(w.document.querySelector('#verify-subject').value,'employee');
    w.document.querySelector('#verify-consent').checked=true;
    w.document.querySelector('#capture').click();await tick();await tick();
    assert.equal(calls.filter(x=>x.url.endsWith('/api/v1/sessions')).length,1);
    const sent=calls.find(x=>x.url.endsWith('/session-test/verify'));
    assert(sent);assert.equal(sent.options.body.get('video').type,'video/mp4');
    assert.equal(sent.options.body.get('nonce'),'nonce');
    assert.match(w.document.querySelector('#verify-result').textContent,/Revisão humana necessária/);
    assert.equal(w.document.querySelector('#capture').disabled,false);
  }finally{env.close()}
});

test('camera permission denial stays visible and the record button can retry',async()=>{
  const env=setup(),{w,calls}=env;
  try{
    await connect(w);await navigate(w,'verify');fakeCamera(w,{denied:true});
    w.document.querySelector('#verify-consent').checked=true;
    w.document.querySelector('#capture').click();await tick();
    assert.match(w.document.querySelector('#verify-result').textContent,/Permita a câmera/);
    assert.equal(w.document.querySelector('#capture').disabled,false);
    assert(!calls.some(x=>x.url.endsWith('/api/v1/sessions')));
    fakeCamera(w);w.document.querySelector('#capture').click();await tick();await tick();
    assert(calls.some(x=>x.url.endsWith('/session-test/verify')));
  }finally{env.close()}
});

test('expired sessions are replaced automatically before recording',async()=>{
  const env=setup(),{w,calls}=env;
  try{
    await connect(w);await navigate(w,'verify');fakeCamera(w);
    let count=0;
    env.setSessionResponse(async()=>({ok:true,status:201,json:async()=>({session_id:'session-'+(++count),nonce:'n',expires_at:Date.now()/1000+(count===1?-1:120),challenge:['center','turn_left','turn_right']})}));
    w.document.querySelector('#verify-consent').checked=true;
    w.document.querySelector('#create-session').click();await tick();
    w.document.querySelector('#capture').click();await tick();await tick();
    assert.equal(count,2);assert(calls.some(x=>x.url.endsWith('/session-2/verify')));
  }finally{env.close()}
});

test('enrollment selects the saved identity and moves to verification without granting consent',async()=>{
  const env=setup(),{w,calls}=env;
  try{
    await connect(w);await navigate(w,'identities');w.document.querySelector('#add-identity').click();
    const form=w.document.querySelector('#identity-form');
    form.elements.namedItem('name').value='Ana Silva';form.elements.namedItem('id').value='ana_001';form.elements.namedItem('consent').checked=true;
    Object.defineProperty(form.elements.namedItem('reference'),'files',{configurable:true,value:[new w.File(['image'],'ref.jpg',{type:'image/jpeg'})]});
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
    assert.equal(w.location.hash,'#verify');
    assert.equal(w.document.querySelector('#verify-subject').value,'ana_001');
    assert.equal(w.document.querySelector('#verify-consent').checked,false);
    const saved=calls.find(x=>x.url.endsWith('/api/v1/subjects')&&x.options.method==='POST');
    assert.equal(saved.options.body.get('display_name'),'Ana Silva');
  }finally{env.close()}
});

test('enrollment errors stay inside the dialog and preserve the form',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'identities');w.document.querySelector('#add-identity').click();
    const form=w.document.querySelector('#identity-form');
    form.elements.namedItem('name').value='Ana';form.elements.namedItem('id').value='ana';form.elements.namedItem('consent').checked=true;
    Object.defineProperty(form.elements.namedItem('reference'),'files',{configurable:true,value:[new w.File(['image'],'ref.jpg',{type:'image/jpeg'})]});
    env.setEnrollmentResponse(async()=>({ok:false,status:422,json:async()=>({detail:'A captura deve conter exatamente um rosto.'})}));
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.match(w.document.querySelector('#identity-error').textContent,/exatamente um rosto/);
    assert.equal(w.document.querySelector('#identity-dialog').open,true);
    assert.equal(form.elements.namedItem('id').value,'ana');
    assert.equal(form.querySelector('[type=submit]').disabled,false);
  }finally{env.close()}
});

test('pending camera permission cannot attach a stream after navigation',async()=>{
  const env=setup(),{w}=env;
  try{
    await connect(w);await navigate(w,'verify');fakeCamera(w);
    let release;w.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{release=resolve});
    w.document.querySelector('#verify-consent').checked=true;w.document.querySelector('#capture').click();await tick();
    await navigate(w,'identities');
    let stopped=false;release({getTracks:()=>[{stop(){stopped=true}}]});await tick();
    assert.equal(stopped,true);assert.equal(w.testState().activeSession,null);
  }finally{env.close()}
});
