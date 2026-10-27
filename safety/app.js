'use strict';
/* Family Safety / Firestore: status first, optional GPS second. */
const NAMES={naoya:'直也',shoko:'彰子',miori:'美織',kosuke:'こうすけ'};
const $=id=>document.getElementById(id);
const SETTING_KEY='family-safety-settings-v2';
const QUEUE_KEY='family-safety-reports-v2';
const firebaseCfg=window.FAMILY_FIREBASE||{};
const configured=!!(firebaseCfg.firebase?.apiKey && firebaseCfg.firebase?.projectId &&
  firebaseCfg.firebase?.appId && firebaseCfg.firebase?.authDomain);
function read(k,otherwise){try{return JSON.parse(localStorage.getItem(k))??otherwise}catch{return otherwise}}
const oldSettings=read('family-safety-settings-v1',{});
let settings=read(SETTING_KEY,{profile:oldSettings.profile||'naoya',phone:oldSettings.phone||''});
let pending=read(QUEUE_KEY,[]);
if(!Array.isArray(pending))pending=[];
let kids=new Set(),kidStatuses={miori:'safe',kosuke:'safe'},lastLocation=null,lastReport=null,gateway=null,user=null;
let latest={},syncStates={},sending=false,activeWriteEventId=null,selecting=settings.profile,onlineSDK=false;
function saveSettings(){localStorage.setItem(SETTING_KEY,JSON.stringify(settings))}
function saveQueue(){
 try{localStorage.setItem(QUEUE_KEY,JSON.stringify(pending));return true}
 catch(e){console.warn('Safety queue could not persist',e);return false}
}
function fmt(ms){return ms?new Date(ms).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'不明'}
function inform(message,good=false){$('notice').textContent=message;$('notice').className=message?'notice '+(good?'good':''):''}
function showNet(){
 $('dot').style.background=navigator.onLine?'#13a77b':'#c34a4a';
 $('network').textContent=navigator.onLine?
   (gateway&&user?.role?'端末登録済み・クラウド接続確認は下の時刻を参照':'通信可能・Firebase接続待ち'):'オフライン';
 const oldQueue=read('family-safety-queue-v1',[]);
 $('pending').textContent=(pending.length?'新方式の送信待ち：'+pending.length+'件。':'送信待ちなし。')+
   (oldQueue.length?' 旧Netlify方式の未送信'+oldQueue.length+'件は自動移行していません。':'');
}
function profile(p){
 if(!['naoya','shoko'].includes(p))return;
 if(user?.role && user.role!==p)return;
 settings.profile=p;saveSettings();
 for(const a of ['naoya','shoko']){
   $('profile-'+a).classList.toggle('active',a===p);
   $('profile-'+a).disabled=!!(user?.role&&user.role!==a);
 }
}
function kid(p){
 if(kids.has(p))kids.delete(p); else {kids.add(p);kidStatuses[p]='safe'}
 $('kid-'+p).classList.toggle('selected',kids.has(p));
 $('kid-'+p).setAttribute('aria-pressed',String(kids.has(p)));
 $('kid-'+p).textContent=(kids.has(p)?'✓ ':'○ ')+NAMES[p];
 $('state-'+p).classList.toggle('hide',!kids.has(p));
 kidStateLabel(p);
}
function kidStateLabel(p){
 $('state-'+p).textContent=kidStatuses[p]==='safe'?'状態：無事 ▾':'状態：要支援 ▾';
 $('state-'+p).classList.toggle('alert',kidStatuses[p]==='help');
}
function switchKidStatus(p){
 if(!kids.has(p))return;
 kidStatuses[p]=kidStatuses[p]==='safe'?'help':'safe';
 kidStateLabel(p);
}
function gps(callback){
 if(!navigator.geolocation){$('gps').textContent='📍 GPSが使えません。安否のみ保存します';return}
 navigator.geolocation.getCurrentPosition(x=>{
  const a={lat:+x.coords.latitude.toFixed(5),lon:+x.coords.longitude.toFixed(5),
    accuracy:Math.round(x.coords.accuracy),at:x.timestamp};
  if(!Number.isFinite(a.accuracy)||a.accuracy>100000)return;
  lastLocation=a;$('gps').textContent='📍 位置取得 '+fmt(a.at)+'・誤差約'+a.accuracy+'m';
  if(callback)callback(a);
 },()=>{$('gps').textContent='📍 位置情報を取得できません。安否だけ報告できます'},
 {timeout:8000,maximumAge:30000,enableHighAccuracy:false});
}
function recentLocation(){return lastLocation&&Date.now()-lastLocation.at<120000?lastLocation:null}
function eventId(){return crypto.randomUUID().replaceAll('-','')}
function enqueue(events){
 pending.push(...events);
 const durable=saveQueue();
 showNet();
 return durable;
}
function currentRole(){return user?.role||null}
async function flush(){
 if(sending || !pending.length || !gateway || !currentRole() || !navigator.onLine)return;
 sending=true;
 try {
   while(pending.length&&navigator.onLine){
     // Keep another parent's old reports, but never let them block this parent's reports.
     const index=pending.findIndex(j=>j.reporter===currentRole());
     if(index<0) {
       inform('別の端末登録者の未送信報告があります。本人の登録端末で確認してください');
       break;
     }
     const job=pending[index];
     // Firestore promises may remain pending indefinitely after losing connectivity,
     // even if navigator.onLine still says true. Never let the UI hang indefinitely.
     // Retaining the same event ID makes a later retry idempotent.
     let timer;
     activeWriteEventId=job.eventId;
     try{
       await Promise.race([
         gateway.write(job),
         new Promise((_,reject)=>{
           timer=setTimeout(()=>reject(new Error('確認期限を超えました')),10000);
         })
       ]);
     }finally{clearTimeout(timer);activeWriteEventId=null}
     pending.splice(index,1);saveQueue();showNet();
     inform('✓ Firestoreから保存確認（相手の閲覧済みではありません）',true);
   }
 }catch(e){inform('送信できません：'+messageOf(e)+'。端末に保存したまま再送します')}
 finally{sending=false;showNet()}
}
function report(status){
 const at=Date.now(),where=recentLocation(),reporter=settings.profile;
 const people=[{person:reporter,status}, ...[...kids].map(person=>({person,status:kidStatuses[person]}))];
 const jobs=people.map(({person,status:memberStatus})=>({type:'create',eventId:eventId(),
   person,reporter,status:memberStatus,observedAt:at,...(where?{location:where}:{})}));
 lastReport={at,reporter,people:people.map(x=>({...x}))};
 const persisted=enqueue(jobs);
 inform(!persisted?'⚠ 端末内への保存に失敗。アプリを閉じず、SMSで連絡してください':
   !configured?'端末に保存済み。Firebase未設定のため相手へは未送信。SMSをご利用ください':
   !currentRole()?'端末に保存済み。登録完了まで相手へは未送信':
   '端末に保存済み。Firestoreへ送信中…');
 flush();
 // Never wait for GPS to send the safety state.
 gps(loc=>{
   if(lastReport?.at!==at || Date.now()-at>30000 || where?.at===loc.at)return;
   const jobsWithLocation=jobs.map(j=>({type:'location',eventId:j.eventId,
       person:j.person,reporter,location:loc}));
   // Unsent creates receive GPS inline; already transmitted creates get a location-only patch.
   for(const p of jobsWithLocation){
     const existing=pending.find(j=>j.type==='create'&&j.eventId===p.eventId);
     if(existing && activeWriteEventId!==p.eventId){
       // A create not sent yet can include GPS without an extra cloud write.
       existing.location=loc;
     }else{
       // If a create is already in flight, its payload was read before GPS arrived.
       // Queue an independent patch so the location can never be silently lost.
       pending.push(p);
     }
   }
   saveQueue();showNet();flush();
 });
}
function card(person){
 const record=latest[person],wrap=document.createElement('article');wrap.className='person';
 const title=document.createElement('h3');title.textContent=NAMES[person];wrap.append(title);
 const stale=record && Date.now()-record.observedAt>60*60*1000;
 const status=document.createElement('div');
 status.className='status '+(stale?'unknown':record?.status==='safe'?'ok':record?.status==='help'?'danger':'unknown');
 status.textContent=record?(record.status==='safe'?(stale?'⚠ 前回：無事':'✓ 無事'):
   stale?'⚠ 前回：要支援':'! 要支援'):'— 未確認';
 wrap.append(status);
 const details=document.createElement('div');details.className='detail';
 details.textContent=record?'報告 '+fmt(record.observedAt)+' / '+NAMES[record.reporter]+(stale?'（現在は未確認）':''):'安否報告なし';
 wrap.append(details);
 if(record?.location){
   const where=document.createElement('div');where.className='detail';
   const link=document.createElement('a');
   link.href='https://maps.google.com/?q='+encodeURIComponent(record.location.lat+','+record.location.lon);
   link.target='_blank';link.rel='noopener noreferrer';link.textContent='📍 地図を開く';
   where.append(link,document.createTextNode(' GPS '+fmt(record.location.at)+
     (Date.now()-record.location.at>15*60*1000?'（古い位置）':'')));
   wrap.append(where);
 }
 if(syncStates[person]?.pending || syncStates[person]?.fromCache) {
   const local=document.createElement('div');local.className='detail';
   local.textContent=syncStates[person]?.pending?'端末内の未確定情報':'キャッシュ表示（最新未確認）';
   wrap.append(local);
 }
 return wrap;
}
function render(){ $('people').replaceChildren(...Object.keys(NAMES).map(card)) }
function messageOf(error){
 const code=error?.code||'';
 if(code==='permission-denied')return '家族用アクセス権限が未設定です';
 if(code==='auth/operation-not-allowed')return 'Firebaseで匿名認証を有効にしてください';
 if(code==='auth/network-request-failed')return '認証用ネットワークに接続できません';
 if(code==='unavailable'||code==='deadline-exceeded')return 'ネットワークまたはFirestoreが利用できません';
 return error?.message||'通信エラー';
}
function refresh(){
 render();
 const known=Object.values(syncStates);
 const server=known.length===4&&known.every(x=>!x.fromCache);
 $('lastSync').textContent=!configured?'Firebase未接続・最新情報は表示できません':
   !currentRole()?'この端末は登録待ちです。安否は端末に保存できます':
   server?'✓ クラウドから受信 '+fmt(Date.now()):'オフライン／一部キャッシュ情報（現在の安否は未確認）';
}
function showSetup(){
 $('setup').classList.remove('hide');
 selecting=settings.profile;selectSetup(selecting);
 $('phoneInput').value=settings.phone||'';
 $('setupError').textContent=!configured?
  'Firebaseは接続準備中です。安否は端末保存・SMSで共有できます。':
  user?.role?'端末登録済み：'+NAMES[user.role]+'（ログイン操作不要）':
  user?.uid?'初回登録用の端末ID：'+user.uid+'　このIDを家族管理者がFirebaseに登録してください。':
  '端末IDを準備中。初回だけインターネット接続が必要です。';
 $('setupTitle').textContent='家族の初期設定';
}
function selectSetup(p){
 selecting=p;
 for(const a of ['naoya','shoko'])$('setup-'+a).classList.toggle('active',a===p);
}
function savePhone(){
 settings.phone=$('phoneInput').value.trim().replace(/[ -]/g,'');
 saveSettings();$('setupError').textContent='SMSの宛先を端末に保存しました';
 $('setup').classList.add('hide');
}
function closeSetup() {
 settings.profile=selecting;saveSettings();
 if(user?.role)profile(user.role); else profile(settings.profile);
 $('setup').classList.add('hide');
}
function sms(){
 const number=settings.phone;
 if(!number){showSetup();$('setupError').textContent='SMSを送る相手の電話番号を登録してください';return}
 if(!lastReport){inform('先に「無事です」または「助けて」で状況を選んでください');return}
 const where=recentLocation();
 const people=lastReport.people.map(p=>NAMES[p.person]+'：'+(p.status==='safe'?'無事':'要支援')).join(' / ');
 const msg='【家族の安否】'+people+
 '　報告 '+fmt(lastReport.at)+(where?'　位置 https://maps.google.com/?q='+where.lat+','+where.lon:'（位置未取得）');
 const sep=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'&':'?';
 location.href='sms:'+encodeURIComponent(number)+sep+'body='+encodeURIComponent(msg);
}
async function prepareFirebase(){
 if(!configured){refresh();return}
 try{
  const {createFirebaseGateway}=await import('./firebase-client.js');
  gateway=createFirebaseGateway(firebaseCfg,{
    onUser:u=>{
      user=u;
      if(u?.role){
        profile(u.role);
        // Remove obsolete shared-password configuration; never transfer a password to Firebase.
        localStorage.removeItem('family-safety-settings-v1');
        $('setup').classList.add('hide');flush();
      }else if(u){
        showSetup();
        $('setupError').textContent='初回登録用の端末ID：'+u.uid+'　このIDを家族管理者がFirebaseに登録してください。登録後、アプリを再起動してください。';
      }else if(!navigator.onLine){
        inform('オフラインです。以前の端末認証がない場合は送信待ちとして保存します。');
      }
      showNet();refresh();
    },
    onSnapshot:(person,data,meta)=>{latest[person]=data;syncStates[person]=meta;refresh()},
    onMessage:msg=>inform(msg),
    onError:e=>{inform('Firebase：'+messageOf(e));refresh()}
  });
  onlineSDK=true;
 }catch(e){inform('Firebaseの起動に失敗しました：'+messageOf(e));refresh()}
}
function init(){
 render();showNet();profile(settings.profile);
 $('setup').classList.add('hide');
 for(const p of ['naoya','shoko']){
   $('profile-'+p).onclick=()=>profile(p);
   $('setup-'+p).onclick=()=>selectSetup(p);
 }
 for(const p of ['miori','kosuke']){
   $('kid-'+p).onclick=()=>kid(p);
   $('state-'+p).onclick=()=>switchKidStatus(p);
 }
 $('safe').onclick=()=>report('safe');$('help').onclick=()=>report('help');
 $('refresh').onclick=refresh;$('retry').onclick=flush;$('sms').onclick=sms;
 $('settings').onclick=showSetup;$('setupGo').onclick=closeSetup;
 $('savePhone').onclick=savePhone;
 addEventListener('online',()=>{showNet();flush();refresh()});
 addEventListener('offline',()=>{showNet();refresh()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){showNet();flush();refresh()}});
 setInterval(()=>{if(!document.hidden){refresh();flush()}},30000);
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
 // No Google login, password, or user sign-in on disaster day.
 // Enrolled devices silently restore their Firebase anonymous identity.
 if(!configured)inform('Firebaseは接続設定待ちです。安否は端末に保存でき、SMSを送信できます。');
 prepareFirebase();
 gps();
}
init();
