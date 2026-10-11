import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawingSurface} from '../strumenti.js';
function setup(preferStylusTouch=true,options={}){
 const listeners=new Map();
 const ctx=new Proxy({}, {get:(obj,key)=>obj[key]??(()=>{})});
 const canvas={width:1000,height:1000,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000}),addEventListener(type,fn){listeners.set(type,fn);},setPointerCapture(){throw Error('Touch identifiers must not capture Pointer Events');}};
 const s=new DrawingSurface(canvas,{preferStylusTouch,...options});
 const pointer=(type,id=1,pointerType='pen')=>listeners.get(type)?.({pointerType,pointerId:id,clientX:100,clientY:100,pressure:.5,preventDefault(){}});
 const touch=(type,id=1,x=100,y=100,touchType='stylus')=>listeners.get(type)?.({changedTouches:[{identifier:id,clientX:x,clientY:y,touchType,force:.5}],preventDefault(){}});
 return {s,pointer,touch};
}
test('Apple Pencil touch: dot and immediately following letter are separate saved strokes',async()=>{
 const changes=[];const {s,touch}=setup(true,{onChange:els=>changes.push(els)});
 touch('touchstart',1);touch('touchmove',1,130,160);touch('touchend',1,130,160);
 touch('touchstart',2,150,80);touch('touchend',2,150,80);
 touch('touchstart',3,170,100);touch('touchmove',3,200,160);touch('touchend',3,200,160);
 await Promise.resolve();assert.equal(s.elements.length,3);assert.equal(changes.length,3);assert.equal(s.active,null);assert.equal(s.elements[1].punti.length,2);
});
test('iPad Pencil pointer duplicates never draw, finger Touch Events never draw',()=>{
 const {s,pointer,touch}=setup();pointer('pointerdown');touch('touchstart');pointer('pointerup');touch('touchend');
 touch('touchstart',4,20,20,'direct');touch('touchend',4,20,20,'direct');assert.equal(s.elements.length,1);
});
test('fingers still reach navigation through Pointer Events',()=>{
 const gestures=[];const {s,pointer}=setup(true,{onTouchGesture:phase=>gestures.push(phase)});
 pointer('pointerdown',9,'touch');pointer('pointermove',9,'touch');pointer('pointerup',9,'touch');assert.deepEqual(gestures,['start','move','end']);assert.equal(s.elements.length,0);
});
test('touch highlighter, eraser and undo preserve the existing tools',()=>{
 const {s,touch}=setup();s.render=()=>{};s.setTool('evidenziatore');touch('touchstart');touch('touchmove',1,200,100);touch('touchend',1,200,100);assert.equal(s.elements[0].tipo,'evidenziatore');
 const before=structuredClone(s.elements);s.setTool('gomma');touch('touchstart',2,150,100);touch('touchend',2,150,100);assert.notDeepEqual(s.elements,before);s.undo();assert.deepEqual(s.elements,before);
});
test('Pencil touch can navigate in read-only mode',()=>{
 const phases=[];const {s,touch}=setup(true,{onTouchGesture:phase=>phases.push(phase)});s.setReadOnly(true);touch('touchstart');touch('touchmove',1,200,100);touch('touchend',1,200,100);assert.equal(s.elements.length,0);assert.deepEqual(phases,['start','move','end']);assert.equal(s.gesto.touches.size,0);
});
test('other devices keep Pointer Events and ignore duplicate stylus Touch Events',()=>{
 const {s,pointer,touch}=setup(false);pointer('pointerdown');touch('touchstart');pointer('pointerup');touch('touchend');assert.equal(s.elements.length,1);
});
