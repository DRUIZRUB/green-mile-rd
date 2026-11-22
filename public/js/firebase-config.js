/* Green Mile Construction RD — Firebase (Cloud Firestore + Optional Storage + Compressed Image Sync) */
(function (global) {
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDkN8yM76pK0kbFsbbsJrFcqcZ8tcfTmbE',
    authDomain: 'studio-8139121026-17b90.firebaseapp.com',
    projectId: 'studio-8139121026-17b90',
    storageBucket: 'studio-8139121026-17b90.firebasestorage.app',
    messagingSenderId: '960400955140',
    appId: '1:960400955140:web:ff1f9d356e8d27393fe251'
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
      if (typeof global.firebase.storage === 'function') {
        storage = global.firebase.storage();
      }
    } catch (err) {
      console.warn('[Green Mile Firebase] Init error, using localStorage fallback:', err);
    }
  }

  function isReady() {
    return Boolean(db);
  }

  async function compressImageFile(file, maxWidth = 960, quality = 0.8) {
    if (!file) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => resolve(null);
        img.onload = () => {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          let out = canvas.toDataURL('image/webp', quality);
          if (!out.startsWith('data:image/webp')) {
            out = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(out);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
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
        snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
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
        snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Requests listener error:', err.message)
    );
  }

  function subscribeBookings(onData) {
    if (!db) return () => {};
    return db.collection('bookings').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Bookings listener error:', err.message)
    );
  }

  async function getEquipmentById(id) {
    if (!db || id == null) return null;
    try {
      const snap = await db.collection('equipment').doc(String(id)).get();
      if (snap.exists) {
        return Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id });
      }
    } catch (err) {
      console.warn('[Green Mile Firebase] getEquipmentById error:', err.message);
    }
    return null;
  }

  function subscribeEquipmentById(id, onData) {
    if (!db || id == null) return () => {};
    return db.collection('equipment').doc(String(id)).onSnapshot(
      (snap) => {
        if (snap.exists) {
          onData(Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id }));
        }
      },
      (err) => console.warn('[Green Mile Firebase] Equipment doc listener error:', err.message)
    );
  }

  async function uploadEquipmentImage(file, equipmentId) {
    if (!storage || !file) return null;
    const safeName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ref = storage.ref().child(`equipment/${equipmentId}_${safeName}`);
    const uploadPromise = ref.put(file).then(() => ref.getDownloadURL());
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), 3500));
    return Promise.race([uploadPromise, timeoutPromise]);
  }

  async function saveEquipment(item, imageFile) {
    if (!db) return item;
    const copy = Object.assign({}, item);
    if (imageFile) {
      let uploadedUrl = null;
      if (storage) {
        try {
          uploadedUrl = await uploadEquipmentImage(imageFile, copy.id);
        } catch (_) {
          uploadedUrl = null;
        }
      }
      if (uploadedUrl) {
        copy.img = uploadedUrl;
      } else {
        const compressed = await compressImageFile(imageFile);
        if (compressed) copy.img = compressed;
      }
    }
    await db.collection('equipment').doc(String(copy.id)).set(Object.assign({}, copy, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return copy;
  }

  async function updateEquipmentStatus(id, busy) {
    if (!db || id == null) return;
    await db.collection('equipment').doc(String(id)).set({ busy: Boolean(busy) }, { merge: true });
  }

  async function deleteEquipment(id) {
    if (!db || id == null) return;
    await db.collection('equipment').doc(String(id)).delete();
  }

  async function saveRequest(req) {
    if (!db) return req;
    await db.collection('requests').doc(String(req.id)).set(Object.assign({}, req, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return req;
  }

  async function deleteRequest(id) {
    if (!db || id == null) return;
    await db.collection('requests').doc(String(id)).delete();
  }

  async function saveBooking(booking, equipmentId) {
    if (!db) return booking;
    await db.collection('bookings').doc(String(booking.id)).set(Object.assign({}, booking, {
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    if (equipmentId != null) {
      await db.collection('equipment').doc(String(equipmentId)).set({ busy: true }, { merge: true });
    }
    return booking;
  }

  global.GM_FIREBASE = {
    isReady,
    compressImageFile,
    subscribeEquipment,
    subscribeRequests,
    subscribeBookings,
    getEquipmentById,
    subscribeEquipmentById,
    saveEquipment,
    updateEquipmentStatus,
    deleteEquipment,
    saveRequest,
    deleteRequest,
    saveBooking
  };
})(window);
