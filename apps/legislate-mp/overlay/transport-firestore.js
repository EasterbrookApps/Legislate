(function(){
  const q = (s)=>document.querySelector(s);

  function getParam(name){
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }
  function truthy(v){ return v === '1' || v === 'true' || v === 'yes'; }

  function readRoomFromStorage(){
    try {
      const room = sessionStorage.getItem('MP_ROOM');
      const host = sessionStorage.getItem('MP_HOST');
      return { room, host: truthy(host) };
    } catch { return { room: null, host: false }; }
  }

  // Expose a tiny transport on window.MP
  window.MP = window.MP || {};
  window.MP.transport = {
    mode: null, // 'solo' | 'host' | 'guest'
    room: null,
    db: null,
    auth: null,

    async init(){
      // Prefer lobby-provided values (sessionStorage). Fall back to URL for dev.
      const st = readRoomFromStorage();
      const urlRoom = getParam('room');
      const urlHost = truthy(getParam('host'));

      const room = st.room || urlRoom;
      const isHost = st.room ? st.host : urlHost;

      this.mode = room ? (isHost ? 'host' : 'guest') : 'solo';
      this.room = room;

      // Show the banner if present
      const banner = document.getElementById('roomBanner');
      if (banner && room) {
        banner.textContent = 'Room Code: ' + room;
      } else if (banner) {
        banner.textContent = 'Room: (not joined)';
      }

      if (this.mode === 'solo') return; // nothing else needed

      // Ensure Firebase SDKs are available
      if (!window.firebase || !window.firebase.initializeApp || !window.firebase.auth || !window.firebase.firestore) {
        console.error('Firebase SDK not loaded. Include Firebase scripts before overlay.');
        this.mode = 'solo';
        return;
      }

      // Get config: prefer overlay config, else global firebaseConfig
      const cfg = (window.MP_CONFIG && window.MP_CONFIG.firebase) || window.firebaseConfig;
      if (!cfg) {
        console.warn('No Firebase config found; overlay will run in single-player mode.');
        this.mode = 'solo';
        return;
      }

      try {
        const app = window.firebase.apps && window.firebase.apps.length
          ? window.firebase.app()
          : window.firebase.initializeApp(cfg);

        this.db = window.firebase.firestore(app);
        this.auth = window.firebase.auth(app);

        // Anonymous sign-in (needed for rules)
        if (!this.auth.currentUser) {
          await this.auth.signInAnonymously();
        }
      } catch (err) {
        console.error('Firebase init failed:', err);
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
      const by = (this.auth && this.auth.currentUser && this.auth.currentUser.uid) || null;
      return this.eventsCol().add(Object.assign({ ts: Date.now(), by }, ev));
    },

    onEvents(fn){
      if (this.mode !== 'host') return ()=>{};
      const ref = this.eventsCol();
      return ref.orderBy('ts').onSnapshot(qs=>{
        qs.docChanges().forEach(async ch=>{
          if (ch.type !== 'added') return;
          const doc  = ch.doc;
          const data = Object.assign({ id: doc.id }, doc.data());
          try {
            await fn(data);
          } finally {
            // ✅ delete processed event to avoid duplicates/backlog
            doc.ref.delete().catch(()=>{});
          }
        });
      });
    },

    writeState(state){
      if (this.mode !== 'host') return;
      const by = (this.auth && this.auth.currentUser && this.auth.currentUser.uid) || null;
      const withHost = Object.assign({ hostUid: state.hostUid || by }, state);
      // ✅ merge so partial writes don’t clobber other fields
      return this.stateDoc().set(withHost, { merge: true });
    }
  };
})();