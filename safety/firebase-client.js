/* Firebase SDK v13.1.0; static web module imports (official CDN) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, setDoc, updateDoc, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const PEOPLE = ["naoya","shoko","miori","kosuke"];
export function createFirebaseGateway(configuration, hooks) {
  const app = initializeApp(configuration.firebase);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
  } catch (e) {
    // For browsers without IndexedDB persistence. App-level localStorage queue still protects unsent reports.
    db = initializeFirestore(app, {localCache:memoryLocalCache()});
    hooks.onMessage("Firestoreの永続キャッシュは無効です。端末内の送信待ちを使用します。");
  }
  const root = collection(db, "families", "home", "members");
  let stops = [];
  function close() { for(const stop of stops) stop(); stops=[]; }
  function myRole() {
    const uid=auth.currentUser?.uid;
    if (!uid) return null;
    if (uid===configuration.parents.naoya) return "naoya";
    if (uid===configuration.parents.shoko) return "shoko";
    return null;
  }
  onAuthStateChanged(auth, user => {
    close();
    hooks.onUser(user?{uid:user.uid, email:user.email||"", role:myRole()}:null);
    if (!user || !myRole()) return;
    for (const person of PEOPLE) {
      const q=query(collection(root,person,"reports"),orderBy("observedAt","desc"),limit(1));
      stops.push(onSnapshot(q,{includeMetadataChanges:true},snap=>{
        hooks.onSnapshot(person,snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()},
          {fromCache:snap.metadata.fromCache,pending:snap.metadata.hasPendingWrites});
      },err=>hooks.onError(err)));
    }
  },hooks.onError);
  const ref = (person, eventId)=>doc(root,person,"reports",eventId);
  return {
    login:()=>signInWithPopup(auth,new GoogleAuthProvider()),
    logout:()=>signOut(auth),
    role:()=>myRole(),
    write: async job => {
      if (!myRole()) throw new Error("家族として認証されていません");
      if(job.type==="create") {
        const {eventId, person, reporter, status, observedAt, location}=job;
        if(person!==myRole() && person!=="miori" && person!=="kosuke") throw new Error("別の大人の安否は代理登録できません");
        await setDoc(ref(person,eventId),{person,reporter,status,observedAt,...(location?{location}:{})});
      } else if(job.type==="location") {
        await updateDoc(ref(job.person,job.eventId),{location:job.location});
      } else throw new Error("不正な報告形式");
    },
    close
  };
}
