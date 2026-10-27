'use strict';
const API='https://miori-word-garden.netlify.app/api/family-safety';
const NAMES={naoya:'直也',shoko:'彰子',miori:'美織',kosuke:'こうすけ'};
const $=id=>document.getElementById(id);
const configKey='family-safety-settings-v1',queueKey='family-safety-queue-v1';
function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}}
let cfg=read(configKey,{profile:'naoya',key:'',phone:''});
let queue=read(queueKey,[]);
let kids=new Set(),loc=null,latest={},working=false,lastPacket=null,setupProfile=cfg.profile;
function saveCfg(){localStorage.setItem(configKey,JSON.stringify(cfg))}
function saveQueue(){localStorage.setItem(queueKey,JSON.stringify(queue))}
function fmt(ms){if(!ms)return '未確認';return new Date(ms).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function notify(s,good=false){$('notice').textContent=s;$('notice').className=s?'notice '+(good?'good':''):''}
function net(){const online=navigator.onLine;$('network').textContent=online?'ネットワーク接続あり（サーバーとは別）':'オフライン：端末に保存';$('dot').style.background=online?'#13a77b':'#c34a4a';$('pending').textContent=queue.length?'未送信の報告：'+queue.length+'件':'未送信なし'}
function profile(p){if(!['naoya','shoko'].includes(p))return;cfg.profile=p;saveCfg();for(const x of ['naoya','shoko'])$('profile-'+x).classList.toggle('active',x===p)}
function kid(p){if(kids.has(p))kids.delete(p);else kids.add(p);$('kid-'+p).classList.toggle('selected',kids.has(p));$('kid-'+p).setAttribute('aria-pressed',String(kids.has(p)));$('kid-'+p).textContent=(kids.has(p)?'✓ ':'○ ')+NAMES[p]}
function getGps(callback){if(!navigator.geolocation){$('gps').textContent='📍 GPSに非対応。安否のみ送信できます';return}
 navigator.geolocation.getCurrentPosition(p=>{
 const a={lat:+p.coords.latitude.toFixed(5),lon:+p.coords.longitude.toFixed(5),accuracy:Math.round(p.coords.accuracy),at:p.timestamp};
 if(a.accuracy>100000||!Number.isFinite(a.accuracy))return;
 loc=a;$('gps').textContent='📍 位置取得済・誤差 約'+a.accuracy+'m';if(callback)callback(a)
 },()=>{$('gps').textContent='📍 位置情報なし。安否だけ送れます'},{timeout:8000,maximumAge:30000,enableHighAccuracy:false})}
function recentLoc(){return loc&&Date.now()-loc.at<120000?loc:null}
function uuid(){return crypto.randomUUID().replaceAll('-','')}
function add(packet){queue.push(packet);saveQueue();net()}
async function api(method,packet){const res=await fetch(API,{method,headers:{'X-Family-Key':cfg.key,...(packet?{'Content-Type':'application/json'}:{})},cache:'no-store',body:packet?JSON.stringify(packet):undefined,signal:AbortSignal.timeout(10000)});
 let data;try{data=await res.json()}catch{throw new Error('サーバーから応答を取得できません')}
 if(!res.ok)throw new Error(data.error||'サーバーエラー '+res.status);
 return data}
async function flush(){if(working||!queue.length||!cfg.key)return;working=true;
 try{while(queue.length){const resp=await api('POST',queue[0]);if(!resp.ok)throw new Error('受信確認に失敗');queue.shift();saveQueue();notify('✓ クラウドに保存しました（相手の閲覧済みとは限りません）',true)}
 await refresh()}catch(e){notify((e.message||'通信エラー')+'。端末に保管し、再送します')}
 finally{working=false;net()}}
function report(state){if(!cfg.key){showSetup();return}
 const at=Date.now(),where=recentLoc(),people=[cfg.profile,...kids];
 const packet={reporter:cfg.profile,updates:people.map(person=>({person,state,eventId:uuid(),observedAt:at,...(where?{location:where}:{})}))};
 lastPacket={packet,at};add(packet);notify('端末に保存しました。クラウドへ送信中…');flush();
 // Do not delay status registration while waiting for GPS.
 getGps(p=>{if(!lastPacket||lastPacket.packet!==packet||Date.now()-at>30000||where?.at===p.at)return;
   // The backend enriches reports with the SAME event IDs; this is not a second safety report.
   add({...packet,updates:packet.updates.map(u=>({...u,location:p}))});flush();
 })}
function card(p){const record=latest[p];const box=document.createElement('article');box.className='person';
 const title=document.createElement('h3');title.textContent=NAMES[p];box.append(title);
 const state=document.createElement('div');
 const stale=record&&Date.now()-record.observedAt>3600000;
 state.className='status '+(stale?'unknown':record?.state==='safe'?'ok':record?.state==='help'?'danger':'unknown');
 state.textContent=record?.state==='safe'?(stale?'⚠ 前回：無事':'✓ 無事'):record?.state==='help'?(stale?'⚠ 前回：要支援':'! 要支援'):'— 未確認';
 box.append(state);
 const detail=document.createElement('div');detail.className='detail';
 detail.textContent=record?'報告 '+fmt(record.observedAt)+' / '+(NAMES[record.reporter]||'不明')+(stale?'（現在の安否とは限りません）':''):'報告なし';box.append(detail);
 if(record?.location){const d=document.createElement('div');d.className='detail';const link=document.createElement('a');
 link.href='https://www.google.com/maps?q='+record.location.lat+','+record.location.lon;link.target='_blank';link.rel='noopener noreferrer';link.textContent='📍 地図で見る';d.append(link,document.createElement('br'),document.createTextNode('取得 '+fmt(record.location.at)+(Date.now()-record.location.at>900000?'・15分以上前':'')));box.append(d)}
 return box}
function render(){const e=$('people');e.replaceChildren(...Object.keys(NAMES).map(card))}
async function refresh(){if(!cfg.key)return;try{const data=await api('GET');latest=data.people||{};render();$('lastSync').textContent='クラウド確認 '+fmt(data.serverAt)}
 catch(e){$('lastSync').textContent='⚠ 最新の状況を取得できません（以前の表示かもしれません）：'+(e.message||'通信エラー')}}
function showSetup(){setupProfile=cfg.profile;$('keyInput').value=cfg.key||'';$('phoneInput').value=cfg.phone||'';selectSetup(setupProfile);$('setup').classList.remove('hide')}
function selectSetup(p){setupProfile=p;for(const x of ['naoya','shoko'])$('setup-'+x).classList.toggle('active',x===p)}
async function setupGo(){const key=$('keyInput').value.trim(),phone=$('phoneInput').value.trim();
 if(key.length<16){$('setupError').textContent='合言葉を入力してください';return}
 const old={...cfg};cfg={profile:setupProfile,key,phone};$('setupError').textContent='通信を確認中…';
 try{await api('GET');saveCfg();profile(setupProfile);$('setup').classList.add('hide');$('setupError').textContent='';refresh();flush();getGps()}
 catch(e){cfg=old;$('setupError').textContent='接続・認証に失敗しました：'+(e.message||'通信エラー')}}
function sms(){if(!cfg.phone){alert('相手の電話番号を端末設定で登録してください');showSetup();return}
 const names=[cfg.profile,...kids].map(x=>NAMES[x]).join('、'),state=lastPacket?.packet?.updates[0]?.state==='help'?'要支援':'無事（内容を確認）';
 const p=recentLoc();const content='【家族の安否】'+names+'：'+state+'。'+new Date().toLocaleString('ja-JP')+(p?' 現在地 https://maps.google.com/?q='+p.lat+','+p.lon:'（位置情報なし）');
 const sep=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'&':'?';
 location.href='sms:'+encodeURIComponent(cfg.phone)+sep+'body='+encodeURIComponent(content)}
function init(){render();net();profile(cfg.profile);
 for(const p of ['naoya','shoko']){$('profile-'+p).onclick=()=>profile(p);$('setup-'+p).onclick=()=>selectSetup(p)}
 for(const p of ['miori','kosuke'])$('kid-'+p).onclick=()=>kid(p);
 $('safe').onclick=()=>report('safe');$('help').onclick=()=>report('help');
 $('refresh').onclick=refresh;$('retry').onclick=flush;$('sms').onclick=sms;$('settings').onclick=showSetup;$('setupGo').onclick=setupGo;
 addEventListener('online',()=>{net();flush();refresh()});addEventListener('offline',net);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){flush();refresh()}});
 if(!cfg.key)showSetup();else{$('setup').classList.add('hide');refresh();flush();getGps()}
 setInterval(()=>{if(!document.hidden){flush();refresh()}},30000);
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init();