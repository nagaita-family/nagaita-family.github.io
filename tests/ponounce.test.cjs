"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("ponounce/index.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture({pack,offline=false,record=true,cache=null}={}){
  const elements=new Map(),spoken=[],audios=[],requests=[],storage=new Map();
  if(cache)storage.set("ponounce-school-pack-v1",JSON.stringify(cache));
  function element(){
    return {textContent:"",className:"",style:{},children:[],hidden:false,disabled:false,attributes:{},
      classList:{toggle(){}},
      append(...children){this.children.push(...children);},
      appendChild(child){this.children.push(child);return child;},
      replaceChildren(...children){this.children=[...children];},
      setAttribute(key,value){this.attributes[key]=value;},
      addEventListener(){}};
  }
  function el(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}
  const document={
    getElementById:el,
    createElement:()=>element(),
    querySelectorAll:selector=>selector===".word-row"?el("wordList").children:[],
    addEventListener(){}
  };
  const speech={getVoices:()=>[{lang:"en-US",name:"Google US English"}],
    addEventListener(){},cancel(){},speak(u){spoken.push(u);}};
  class Utterance{constructor(text){this.text=text;}}
  class Audio{
    constructor(){this.playbackRate=1;this.defaultPlaybackRate=1;this.preload="auto";audios.push(this);}
    pause(){this.paused=true;}
    play(){this.onloadedmetadata?.();this.onplaying?.();return Promise.resolve();}
  }
  const fetch=async url=>{
    requests.push(String(url));
    if(String(url).includes("word-packs/current.json")){
      if(offline)throw Error("Offline");
      return {ok:true,json:async()=>pack};
    }
    if(record){
      const word=decodeURIComponent(String(url).split("/").pop());
      return {ok:true,json:async()=>[{word,phonetics:[{audio:"//ssl.gstatic.com/dictionary/"+word+"--_us_1.mp3"}]}]};
    }
    return {ok:false,status:404,json:async()=>[]};
  };
  const context={window:{speechSynthesis:speech,addEventListener(){}},document,navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    SpeechSynthesisUtterance:Utterance,Audio,fetch,AbortController,Date,URL,Map,Set,
    setTimeout,clearTimeout,console};
  vm.runInNewContext(script,context);
  return {elements,el,spoken,audios,requests,storage};
}
const pack={weekId:"2026-11-05-unit-7a",weekName:"Nov 5 · Unit 7a",
  words:[{word:"hour",chunks:["h","our"],phonicsSilent:[0],pictureEmoji:"🕒",meaningEn:"a measure of time"},
    {word:"time zone",chunks:["time","zone"],pictureEmoji:"🌍",meaningEn:"one of 24 areas"}]};
const flush=()=>new Promise(done=>setTimeout(done,15));
test("Weekly words come from Word Garden, with no hardcoded weekly vocabulary",async()=>{
 const env=fixture({pack});await flush();
 assert.equal(env.el("wordList").children.length,2);
 assert.equal(env.el("weekTitle").textContent,pack.weekName);
 assert.equal(env.el("practiceWord").textContent,"hour");
 assert.match(env.requests[0],/\/miori-word-garden\/word-packs\/current\.json\?v=/);
 assert.match(env.el("sourceStatus").textContent,/Synced with Word Garden/);
 assert.match(env.el("cambridgeLink").href,/\/hour$/);
 env.el("nextBtn").onclick();
 assert.equal(env.el("practiceWord").textContent,"time zone");
 assert.match(env.el("cambridgeLink").href,/\/time-zone$/);
});
test("Both recorded audio speeds are actually assigned, and slow is 0.6x",async()=>{
 const env=fixture({pack});await flush();
 env.el("playNormal").onclick();
 assert.equal(env.audios.length,1);
 assert.equal(env.audios[0].playbackRate,1);
 env.el("playSlow").onclick();
 assert.equal(env.audios.length,2);
 assert.equal(env.audios[1].playbackRate,0.6);
 assert.equal(env.audios[0].paused,true);
 assert.match(env.el("audioStatus").textContent,/0\.6×/);
});
test("Phrase and unavailable recording use speech with different normal and slow rates",async()=>{
 const env=fixture({pack,record:false});await flush();
 env.el("nextBtn").onclick();
 env.el("playNormal").onclick();
 env.el("playSlow").onclick();
 assert.equal(env.spoken.length,2);
 assert.equal(env.spoken[0].text,"time zone");
 assert.equal(env.spoken[0].rate,0.94);
 assert.equal(env.spoken[1].rate,0.5);
});
test("Hide spellings still provides one-tap playback and previous/next practice",async()=>{
 const env=fixture({pack});await flush();
 env.el("hideBtn").onclick();
 assert.equal(env.el("practiceWord").textContent,"••••••");
 assert.equal(env.el("wordList").children.length,2);
 assert.equal(env.el("hideBtn").attributes["aria-pressed"],"true");
 env.el("nextBtn").onclick();
 assert.equal(env.el("practiceWord").textContent,"••••••");
});
test("Cached valid school pack survives offline while clearly reporting stale state",async()=>{
 const env=fixture({pack,offline:true,cache:pack});await flush();
 assert.equal(env.el("weekTitle").textContent,pack.weekName);
 assert.match(env.el("sourceStatus").textContent,/Offline copy/);
 assert.equal(env.el("wordList").children.length,2);
});
test("No previous pack is silently displayed as current when both network and cache fail",async()=>{
 const env=fixture({pack,offline:true});await flush();
 assert.equal(env.el("errorBanner").hidden,false);
 assert.match(env.el("sourceStatus").textContent,/Not connected/);
});

test("Google pronunciation link targets American English with US search region",async()=>{
 const env=fixture({pack});await flush();
 const first=new URL(env.el("googleLink").href);
 assert.equal(first.searchParams.get("gl"),"us");
 assert.equal(first.searchParams.get("hl"),"en");
 assert.equal(first.searchParams.get("q"),"how to pronounce hour in American English");
 env.el("nextBtn").onclick();
 const second=new URL(env.el("googleLink").href);
 assert.equal(second.searchParams.get("q"),"how to pronounce time zone in American English");
});
