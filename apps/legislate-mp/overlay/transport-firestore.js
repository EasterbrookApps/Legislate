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
    mode: 'solo', // 'host' | 'guest' | 'solo'
    roomId: null,

    roomDoc: null,
    engineDoc: null,   // rooms/{roomId}/s/engine
    overlayDoc: null,  // rooms/{roomId}/s/overlay
    eventsCol: null,   // rooms/{roomId}/events

    async init() {
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
      this.roomId = rid;
      this.mode   = role === 'host' ? 'host' : (role === 'guest' ? 'guest' : 'solo');

      this.roomDoc   = this.db.collection('rooms').doc(this.roomId);
      const s        = this.roomDoc.collection('s');
      this.engineDoc = s.doc('engine');
      this.overlayDoc= s.doc('overlay');
      this.eventsCol = this.roomDoc.collection('events');
      return true;
    },

    // Host writes authoritative board snapshot after takeTurn/ackCard/reset.
    async writeEngine(engineState) {
      const uid = this.auth.currentUser?.uid || null;
      const players = Array.isArray(engineState.players)
        ? engineState.players.map(p => ({
            id: p.id, name: p.name, position: p.position, skipped: !!p.skipped
          }))
        : [];

      const out = {
        hostUid: uid,
        players,
        turnIndex: Number(engineState.turnIndex || 0),
        lastRoll:  Number(engineState.lastRoll  || 0),
        overlaySeatUids: Array.isArray(engineState.overlaySeatUids) ? engineState.overlaySeatUids : [],
        // Monotonic sequence: incremented once per roll by host.
        turnSeq: Number(engineState.turnSeq || 0),
        updatedAt: nowTs()
      };
      await this.engineDoc.set(out, { merge: true });
    },

    onEngine(handler) {
      return this.engineDoc.onSnapshot(snap => {
        if (!snap.exists) return;
        try { handler(snap.data()); } catch (e) { console.error(e); }
      });
    },

    async updateOverlay(partial) {
      await this.overlayDoc.set({ updatedAt: nowTs(), ...(partial || {}) }, { merge: true });
    },

    onOverlay(handler) {
      return this.overlayDoc.onSnapshot(snap => {
        if (!snap.exists) return;
        try { handler(snap.data()); } catch (e) { console.error(e); }
      });
    },

    async sendEvent(payload) {
      const uid = this.auth.currentUser?.uid || null;
      await this.eventsCol.add({ ...payload, by: uid, ts: nowTs() });
    },

    onEvents(handler) {
      // Host consumes and deletes events in order.
      const q = this.eventsCol.orderBy('ts', 'asc').limit(200);
      return q.onSnapshot(async snap => {
        const batch = this.db.batch();
        const work = [];
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return;
          const doc = ch.doc;
          const data = doc.data() || {};
          work.push((async () => {
            try { await handler(data); } finally { batch.delete(doc.ref); }
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