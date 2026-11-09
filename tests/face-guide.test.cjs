const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectPoint,projectDepth,describeFace,FaceGuide}=require('../dist/face/guide.js');

function face(nose=.5){
  const points=Array.from({length:478},(_,i)=>({x:.3+(i%20)/50,y:.2+Math.floor(i/20)/40,z:0}));
  points[468]={x:.4,y:.4,z:0};points[473]={x:.6,y:.4,z:0};points[1]={x:nose,y:.5,z:-.1};return points;
}

test('overlay respects contain letterboxing and mirrors horizontally exactly once',()=>{
  assert.deepEqual(projectPoint({x:0,y:0},640,480,400,400),{x:400,y:50});
  assert.deepEqual(projectPoint({x:1,y:1},640,480,400,400),{x:0,y:350});
  assert.deepEqual(projectPoint({x:0,y:0},640,480,400,400,false),{x:0,y:50});
});

test('preview distinguishes center and both directions without treating multiple faces as a match',()=>{
  assert.equal(describeFace([face()]).action,'center');
  assert.equal(describeFace([face(.55)]).action,'turn_left');
  assert.equal(describeFace([face(.45)]).action,'turn_right');
  assert.equal(describeFace([face()]).aligned,true);
  assert.deepEqual(describeFace([]),{count:0,action:'unknown',aligned:false});
  assert.deepEqual(describeFace([face(),face()]),{count:2,action:'unknown',aligned:false});
  const invalid=face();invalid[0].x=NaN;assert.equal(describeFace([invalid]).count,0);
});

test('depth view uses the measured landmark z coordinate and stays inside the tile',()=>{
  const flat=face(),deep=face();deep[1].z=-.25;
  const a=projectDepth(flat,.75,100,100),b=projectDepth(deep,.75,100,100);
  assert.notEqual(a[1].x,b[1].x);
  assert(b.every(p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100));
});

function harness(){
  const original={document:global.document,Worker:global.Worker,createImageBitmap:global.createImageBitmap};
  const events=new EventTarget();global.document={hidden:false,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),createElement:()=>({getContext:()=>({drawImage(){}})})};
  global.Worker=class{};global.createImageBitmap=()=>{};
  const context={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
  const canvas=()=>({width:100,height:100,getContext:()=>context,getBoundingClientRect:()=>({width:100,height:100})});
  const workers=[];
  const guide=new FaceGuide({video:{isConnected:true,readyState:2,currentTime:1,videoWidth:640,videoHeight:480},canvas:canvas(),depthCanvas:canvas(),status:{textContent:''},feedback:{textContent:''},camera:{dataset:{}},workerFactory:()=>{
    const worker={posts:[],postMessage(value){this.posts.push(value)},terminate(){this.terminated=true}};workers.push(worker);return worker;
  }});
  return {guide,workers,close(){guide.stop();for(const [key,value]of Object.entries(original)){if(value===undefined)delete global[key];else global[key]=value}}};
}

test('stopping during model initialization resolves the pending start and ignores late responses',async()=>{
  const env=harness();try{
    const pending=env.guide.start(),worker=env.workers[0];
    env.guide.stop();assert.equal(await pending,false);assert.equal(worker.terminated,true);
    worker.onmessage({data:{type:'ready',edges:[]}});
    assert.equal(env.guide.available,false);assert.equal(env.guide.active,false);
  }finally{env.close()}
});

test('a bitmap completed after stop is closed without sending it to a dead worker',async()=>{
  const env=harness();try{
    const pending=env.guide.start(),worker=env.workers[0];worker.onmessage({data:{type:'ready',edges:[]}});assert.equal(await pending,true);
    let finish;env.guide.bitmapFactory=()=>new Promise(resolve=>{finish=resolve});
    const inFlight=env.guide.sendFrame();env.guide.stop();let closed=false;finish({close(){closed=true}});await inFlight;
    assert.equal(closed,true);assert.equal(worker.posts.filter(x=>x.type==='frame').length,0);
  }finally{env.close()}
});

test('tracking failure clears previously detected points and preserves animated guidance',async()=>{
  const env=harness();try{
    const pending=env.guide.start(),worker=env.workers[0];worker.onmessage({data:{type:'ready',edges:[]}});await pending;
    worker.onmessage({data:{type:'landmarks',faces:[face()]}});assert.equal(env.guide.snapshot.count,1);
    worker.onmessage({data:{type:'error'}});
    assert.equal(env.guide.snapshot.count,0);assert.equal(worker.terminated,true);
    assert.match(env.guide.feedback.textContent,/orientação animada continua/);
  }finally{env.close()}
});
