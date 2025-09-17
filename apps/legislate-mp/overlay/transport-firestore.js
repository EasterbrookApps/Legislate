(function(){
  const q = (s)=>document.querySelector(s);
  function getParam(name){
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }
  function truthy(name){
    const v = getParam(name);
    return v === '1' || v === 'true' || v === 'yes';
  }

  // Expose a tiny transport on window.MP
  window.MP = window.MP || {};
  window.MP.transport = {
    mode: null, // 'solo' | 'host' | 'guest'
    room: null,
    db: null,
    auth: null,
    init: async function(){
      const room = getParam('room');
      const hostFlag = truthy('host');
      this.mode = room ? (hostFlag ? 'host' : 'guest') : 'solo';
      this.room = room;

      if (this.mode === 'solo') return;

      // Ensure Firebase SDKs are available
      if (!window.firebase || !window.firebase.firestore || !window.firebase.auth || !window.firebase.initializeApp) {
        console.error('Firebase SDK not loaded. Include Firebase scripts before overlay.');
        return;
      }

      const cfg = (window.MP_CONFIG && window.MP_CONFIG.firebase) || window.firebaseConfig;
      if (!cfg) {
        console.warn('No Firebase config found; overlay will not activate.');
        this.mode = 'solo';
        return;
      }
      try{
        const app = window.firebase.initializeApp(cfg);
        this.db = window.firebase.firestore(app);
        this.auth = window.firebase.auth(app);
        await this.auth.signInAnonymously();
      }catch(err){
        console.error('Firebase init failed', err);
        this.mode = 'solo';
      }
    },
    stateDoc(){ return this.db.collection('rooms').doc(this.room).collection('sync').doc('state'); },
    eventsCol(){ return this.db.collection('rooms').doc(this.room).collection('events'); },
    onState(fn){
      if (this.mode === 'solo') return ()=>{};
      const ref = this.stateDoc();
      return ref.onSnapshot(snap=>{ if(snap.exists){ fn(snap.data()); } });
    },
    sendEvent(ev){
      if (this.mode === 'solo') return;
      return this.eventsCol().add(Object.assign({ ts: Date.now() }, ev));
    },
    onEvents(fn){
      if (this.mode !== 'host') return ()=>{};
      return this.eventsCol().orderBy('ts').onSnapshot(qs=>{
        qs.docChanges().forEach(ch=>{
          if (ch.type === 'added') fn(Object.assign({ id: ch.doc.id }, ch.doc.data()));
        });
      });
    },
    writeState(state){
      if (this.mode !== 'host') return;
      return this.stateDoc().set(state);
    }
  };
})();