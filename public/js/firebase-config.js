/* Green Mile Construction RD — Firebase (Firestore + Storage) Integration */
(function (global) {
  const FIREBASE_CONFIG = {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'studio-8139121026-17b90.firebaseapp.com',
    projectId: 'studio-8139121026-17b90',
    storageBucket: 'studio-8139121026-17b90.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_FIREBASE_APP_ID'
  };

  const isConfigured = Boolean(
    FIREBASE_CONFIG.apiKey &&
    !FIREBASE_CONFIG.apiKey.startsWith('YOUR_') &&
    typeof global.firebase !== 'undefined'
  );

  let db = null;
  let storage = null;

  if (isConfigured) {
    try {
      if (!global.firebase.apps.length) {
        global.firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = global.firebase.firestore();
      storage = global.firebase.storage();
    } catch (err) {
      console.warn('[Green Mile Firebase] Init error, using localStorage fallback:', err);
    }
  }

  function isReady() {
    return Boolean(db);
  }

  async function seedIfEmpty(collectionName, defaultItems) {
    if (!db || !Array.isArray(defaultItems) || !defaultItems.length) return;
    const snap = await db.collection(collectionName).limit(1).get();
    if (!snap.empty) return;

    const batch = db.batch();
    defaultItems.forEach((item) => {
      const ref = db.collection(collectionName).doc(String(item.id));
      batch.set(ref, Object.assign({}, item, {
        createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
      }));
    });
    await batch.commit();
  }

  function subscribeEquipment(onData, defaultItems) {
    if (!db) return () => {};
    seedIfEmpty('equipment', defaultItems).catch((err) => {
      console.warn('[Green Mile Firebase] Seed equipment skipped:', err.message);
    });
    return db.collection('equipment').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push(doc.data()));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Equipment listener error:', err.message)
    );
  }

  function subscribeRequests(onData, defaultItems) {
    if (!db) return () => {};
    seedIfEmpty('requests', defaultItems).catch((err) => {
      console.warn('[Green Mile Firebase] Seed requests skipped:', err.message);
    });
    return db.collection('requests').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push(doc.data()));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Requests listener error:', err.message)
    );
  }

  async function uploadEquipmentImage(file, equipmentId) {
    if (!storage || !file) return null;
    const safeName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ref = storage.ref().child(`equipment/${equipmentId}_${safeName}`);
    await ref.put(file);
    return ref.getDownloadURL();
  }

  async function saveEquipment(item, imageFile) {
    if (!db) return item;
    const copy = Object.assign({}, item);
    if (imageFile && storage) {
      try {
        const url = await uploadEquipmentImage(imageFile, copy.id);
        if (url) copy.img = url;
      } catch (err) {
        console.warn('[Green Mile Firebase] Image upload fallback:', err.message);
      }
    }
    await db.collection('equipment').doc(String(copy.id)).set(Object.assign({}, copy, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }));
    return copy;
  }

  async function saveRequest(req) {
    if (!db) return req;
    await db.collection('requests').doc(String(req.id)).set(Object.assign({}, req, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }));
    return req;
  }

  async function saveBooking(booking, equipmentId) {
    if (!db) return booking;
    await db.collection('bookings').doc(String(booking.id)).set(Object.assign({}, booking, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }));
    if (equipmentId != null) {
      await db.collection('equipment').doc(String(equipmentId)).set({ busy: true }, { merge: true });
    }
    return booking;
  }

  global.GM_FIREBASE = {
    isReady,
    subscribeEquipment,
    subscribeRequests,
    saveEquipment,
    saveRequest,
    saveBooking
  };
})(window);
