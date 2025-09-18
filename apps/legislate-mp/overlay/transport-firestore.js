/* global firebase */
(function () {
  const MP = (window.MP = window.MP || {});
  const CFG = (window.MP_CONFIG = window.MP_CONFIG || {});

  // ---- Tiny helpers ---------------------------------------------------------
  function nowTs() {
    return (
      (firebase.firestore &&
        firebase.firestore.FieldValue &&
        firebase.firestore.FieldValue.serverTimestamp &&
        firebase.firestore.FieldValue.serverTimestamp()) || new Date()
    );
  }

  // ---- Transport object -----------------------------------------------------
  const T = (MP.transport = {
    app: null,
    auth: null,
    db: null,
    mode: 'solo', // 'host' | 'guest' | 'solo'
    roomId: null,

    // Firestore refs
    roomDoc: null,
    engineDoc: null,   // rooms/{roomId}/s/engine
    overlayDoc: null,  // rooms/{roomId}/s/overlay
    eventsCol: null,   // rooms/{roomId}/events

    // Init (anon auth). roomId + role are read from sessionStorage (set by lobby).
    async init() {
      if (!firebase?.apps?.length) {
        if (!CFG.firebase) throw new Error('Missing window.MP_CONFIG.firebase');
        firebase.initializeApp(CFG.firebase);
      }
      this.app = firebase.app();
      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Sign in anonymously
      if (!this.auth.currentUser) {
        await this.auth.signInAnonymously().catch(err => {
          console.error('Anon auth failed:', err);
          throw err;
        });
      }

      // Resolve room + role from session
      const rid = sessionStorage.getItem('MP_ROOM') || sessionStorage.getItem('MP_ROOM_ID');
      const role = sessionStorage.getItem('MP_ROLE'); // 'host' | 'guest'
      if (!rid) throw new Error('No room id in sessionStorage (MP_ROOM)');
      this.roomId = rid;
      this.mode = role === 'host' ? 'host' : (role === 'guest' ? 'guest' : 'solo');

      // Build refs
      this.roomDoc = this.db.collection('rooms').doc(this.roomId);
      const s = this.roomDoc.collection('s');
      this.engineDoc  = s.doc('engine');
      this.overlayDoc = s.doc('overlay');
      this.eventsCol  = this.roomDoc.collection('events');

      return true;
    },

    // -------- Engine snapshot (authoritative board state) --------------------
    // Host writes the whole engine snapshot after takeTurn/ackCard/reset
    async writeEngine(engineState) {
      const uid = this.auth.currentUser?.uid || null;

      // Pick only fields we expect; never include overlay fields in engine doc.
      const players = Array.isArray(engineState.players) ? engineState.players.map(p => ({
        id: p.id, name: p.name, position: p.position, skipped: !!p.skipped
      })) : [];

      const out = {
        hostUid: uid, // who currently owns the room
        players,
        turnIndex: Number(engineState.turnIndex || 0),
        lastRoll: Number(engineState.lastRoll || 0),
        overlaySeatUids: Array.isArray(engineState.overlaySeatUids) ? engineState.overlaySeatUids : [],
        // IMPORTANT: monotonic turn sequence for ordering overlay updates
        turnSeq: Number(engineState.turnSeq || 0),
        updatedAt: nowTs(),
      };

      await this.engineDoc.set(out, { merge: true });
    },

    // Guests + host subscribe to engine doc (tokens, names, turn indicator)
    onEngine(handler) {
      return this.engineDoc.onSnapshot(snap => {
        if (!snap.exists) return;
        try { handler(snap.data()); } catch (e) { console.error(e); }
      });
    },

    // -------- Overlay signals (UI only: dice / card / gating) ----------------
    // host calls updateOverlay(partial) → merged update (never clobber whole doc).
    async updateOverlay(partial) {
      const base = { updatedAt: nowTs() };
      await this.overlayDoc.set(Object.assign(base, partial || {}), { merge: true });
    },

    // Everyone listens to overlay (for dice + card)
    onOverlay(handler) {
      return this.overlayDoc.onSnapshot(snap => {
        if (!snap.exists) return;
        try { handler(snap.data()); } catch (e) { console.error(e); }
      });
    },

    // -------- Events (guests → host) ----------------------------------------
    // Guests send events; host listens and acts, then deletes the event.
    async sendEvent(payload) {
      const uid = this.auth.currentUser?.uid || null;
      const ev = Object.assign({}, payload, { by: uid, ts: nowTs() });
      await this.eventsCol.add(ev);
    },

    onEvents(handler) {
      // Host-only: listen for new events; process in order; delete after handle
      const q = this.eventsCol.orderBy('ts', 'asc').limit(50);
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