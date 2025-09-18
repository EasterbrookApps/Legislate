/* global firebase */
(function () {
  const MP  = (window.MP = window.MP || {});
  const CFG = (window.MP_CONFIG = window.MP_CONFIG || {});

  function nowTs() {
    return (
      (firebase.firestore &&
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp &&
        firebase.firestore.FieldValue.serverTimestamp()) || new Date()
    );
  }

  const T = (MP.transport = {
    app: null,
    auth: null,
    db: null,
    mode: 'solo',   // 'host' | 'guest' | 'solo'
    roomId: null,

    roomDoc: null,
    stateDoc: null,   // rooms/{roomId}/state
    eventsCol: null,  // rooms/{roomId}/events

    // Init (anon auth). roomId + role read from sessionStorage (set by lobby)
    async init () {
      if (!firebase?.apps?.length) {
        if (!CFG.firebase) throw new Error('Missing window.MP_CONFIG.firebase');
        firebase.initializeApp(CFG.firebase);
      }
      this.app  = firebase.app();
      this.auth = firebase.auth();
      this.db   = firebase.firestore();

      if (!this.auth.currentUser) {
        await this.auth.signInAnonymously();
      }

      const rid  = sessionStorage.getItem('MP_ROOM') || sessionStorage.getItem('MP_ROOM_ID');
      const role = sessionStorage.getItem('MP_ROLE'); // 'host' | 'guest'
      if (!rid) throw new Error('No room id in sessionStorage (MP_ROOM)');

      this.roomId  = rid;
      this.mode    = role === 'host' ? 'host' : (role === 'guest' ? 'guest' : 'solo');
      this.roomDoc = this.db.collection('rooms').doc(this.roomId);

      this.stateDoc = this.roomDoc.doc('state'); // single doc
      this.eventsCol = this.roomDoc.collection('events');

      return true;
    },

    // Host/Guests write merged game state (overlay bits included)
    async writeState (partial) {
      const base = { updatedAt: nowTs() };
      await this.stateDoc.set(Object.assign(base, partial || {}), { merge: true });
      return { ok: true };
    },

    // Everyone listens to main state
    onState (handler) {
      return this.stateDoc.onSnapshot(snap => {
        if (!snap.exists) return;
        try { handler(snap.data()); } catch (e) { console.error(e); }
      });
    },

    // Guests → host events (roll, ack, set_name, restart)
    async sendEvent (payload) {
      const uid = this.auth.currentUser?.uid || null;
      await this.eventsCol.add({ ...payload, by: uid, ts: nowTs() });
    },

    // Host consumes events FIFO and deletes them after handling
    onEvents (handler) {
      const q = this.eventsCol.orderBy('ts', 'asc').limit(200);
      return q.onSnapshot(async (snap) => {
        const batch = this.db.batch();
        const work = [];
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return;
          const doc = ch.doc;
          const data = doc.data() || {};
          work.push((async () => {
            try { await handler(data); }
            finally { batch.delete(doc.ref); }
          })());
        });
        if (work.length) {
          await Promise.all(work);
          await batch.commit();
        }
      });
    }
  });
})();