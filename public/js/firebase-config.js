/* Green Mile Construction RD — Firebase (Cloud Firestore + Owner Accounts + Multi-Photo Sync) */
(function (global) {
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDkN8yM76pK0kbFsbbsJrFcqcZ8tcfTmbE',
    authDomain: 'studio-8139121026-17b90.firebaseapp.com',
    projectId: 'studio-8139121026-17b90',
    storageBucket: 'studio-8139121026-17b90.firebasestorage.app',
    messagingSenderId: '960400955140',
    appId: '1:960400955140:web:ff1f9d356e8d27393fe251'
  };

  const OWNER_SESSION_KEY = 'gm_rd_owner_session_v1';
  const LOCAL_OWNERS_KEY = 'gm_rd_local_owners_v1';
  const GUEST_BOOKINGS_KEY = 'gm_rd_guest_booking_ids_v1';
  const VALID_ROLES = new Set(['contractor', 'owner', 'both']);

  function normalizeRole(role, fallback = 'owner') {
    const r = String(role || '').trim().toLowerCase();
    return VALID_ROLES.has(r) ? r : fallback;
  }

  function rememberGuestBookingId(bookingId) {
    if (bookingId == null) return;
    try {
      const list = getGuestBookingIds();
      const idStr = String(bookingId);
      if (!list.includes(idStr)) {
        list.unshift(idStr);
        localStorage.setItem(GUEST_BOOKINGS_KEY, JSON.stringify(list.slice(0, 60)));
      }
    } catch (_) {}
  }

  function getGuestBookingIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GUEST_BOOKINGS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

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

  async function hashPassword(password, saltDigits) {
    const raw = `gm_rd_2026:${saltDigits}:${String(password || '')}`;
    if (global.crypto && global.crypto.subtle) {
      const buf = new TextEncoder().encode(raw);
      const digest = await global.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (let i = 0; i < raw.length; i++) {
      h = ((h << 5) - h) + raw.charCodeAt(i);
      h |= 0;
    }
    return 'fb_' + Math.abs(h).toString(16);
  }

  function getCurrentOwner() {
    try {
      const raw = localStorage.getItem(OWNER_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      parsed.role = normalizeRole(parsed.role, 'owner');
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function setCurrentOwner(owner) {
    if (!owner) {
      localStorage.removeItem(OWNER_SESSION_KEY);
      return null;
    }
    const safeSession = {
      id: owner.id || owner.rncDigits,
      rncDigits: owner.rncDigits,
      rncFormatted: owner.rncFormatted,
      name: owner.name,
      email: owner.email || '',
      phone: owner.phone || '',
      city: owner.city || 'Santo Domingo',
      role: normalizeRole(owner.role, 'owner')
    };
    localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify(safeSession));
    return safeSession;
  }

  function logoutOwner() {
    localStorage.removeItem(OWNER_SESSION_KEY);
  }

  function getLocalOwnersMap() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_OWNERS_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveLocalOwner(docData) {
    const map = getLocalOwnersMap();
    map[docData.rncDigits] = docData;
    localStorage.setItem(LOCAL_OWNERS_KEY, JSON.stringify(map));
  }

  async function registerOwnerAccount({ rncDigits, rncFormatted, name, email, phone, city, password, role = 'contractor' }) {
    const cleanId = String(rncDigits || '').replace(/\D/g, '');
    if (!cleanId) throw new Error('RNC o Cédula inválido');

    const safeRole = normalizeRole(role, 'contractor');
    const passwordHash = await hashPassword(password, cleanId);
    const ownerDoc = {
      id: cleanId,
      rncDigits: cleanId,
      rncFormatted: rncFormatted || cleanId,
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      phone: String(phone || '').trim(),
      city: city || 'Santo Domingo',
      role: safeRole,
      passwordHash,
      verifiedDgii: true
    };

    if (db) {
      const ref = db.collection('owners').doc(cleanId);
      const existing = await ref.get();
      if (existing.exists) {
        throw new Error('Ya existe una cuenta registrada con este RNC/Cédula. Inicia sesión.');
      }
      await ref.set(Object.assign({}, ownerDoc, {
        createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
      }));
    } else {
      const map = getLocalOwnersMap();
      if (map[cleanId]) {
        throw new Error('Ya existe una cuenta registrada con este RNC/Cédula. Inicia sesión.');
      }
    }

    saveLocalOwner(ownerDoc);
    return setCurrentOwner(ownerDoc);
  }

  async function loginOwnerAccount({ identifier, password }) {
    const raw = String(identifier || '').trim();
    const digits = raw.replace(/\D/g, '');
    const emailLower = raw.toLowerCase();

    let found = null;

    if (db) {
      if (digits.length === 9 || digits.length === 11) {
        const snap = await db.collection('owners').doc(digits).get();
        if (snap.exists) found = snap.data();
      } else if (raw.includes('@')) {
        const qSnap = await db.collection('owners').where('email', '==', emailLower).limit(1).get();
        if (!qSnap.empty) found = qSnap.docs[0].data();
      }
    }

    if (!found) {
      const map = getLocalOwnersMap();
      if (digits && map[digits]) {
        found = map[digits];
      } else if (raw.includes('@')) {
        found = Object.values(map).find((o) => o.email === emailLower) || null;
      }
    }

    if (!found) {
      throw new Error('No encontramos una cuenta con ese RNC/Cédula o correo. Regístrate primero.');
    }

    const expectedHash = await hashPassword(password, found.rncDigits);
    if (found.passwordHash !== expectedHash) {
      throw new Error('Contraseña incorrecta.');
    }

    found.role = normalizeRole(found.role, 'owner');
    saveLocalOwner(found);
    return setCurrentOwner(found);
  }

  async function updateAccountRole(newRole) {
    const cur = getCurrentOwner();
    if (!cur) throw new Error('Debes iniciar sesión primero.');
    const safeRole = normalizeRole(newRole, cur.role || 'both');
    const updated = Object.assign({}, cur, { role: safeRole });

    if (db && cur.rncDigits) {
      await db.collection('owners').doc(String(cur.rncDigits)).set({
        role: safeRole,
        updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    const map = getLocalOwnersMap();
    if (map[cur.rncDigits]) {
      map[cur.rncDigits].role = safeRole;
      localStorage.setItem(LOCAL_OWNERS_KEY, JSON.stringify(map));
    }
    return setCurrentOwner(updated);
  }

  /* Compress image so up to 5 HD photos fit well inside Firestore's 1 MiB document limit (~95 KB each) */
  async function compressImageFile(file, maxWidth = 860, quality = 0.74) {
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

  async function saveEquipment(item) {
    if (!db) return item;
    const copy = Object.assign({}, item);
    if (Array.isArray(copy.images) && copy.images.length > 0) {
      copy.img = copy.images[0];
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
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    if (equipmentId != null) {
      await db.collection('equipment').doc(String(equipmentId)).set({ busy: true }, { merge: true });
    }
    return booking;
  }

  async function updateBooking(bookingId, fullOrPatchDoc) {
    if (!db || bookingId == null) return fullOrPatchDoc;
    await db.collection('bookings').doc(String(bookingId)).set(Object.assign({}, fullOrPatchDoc, {
      updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return fullOrPatchDoc;
  }

  function subscribeOwners(onData) {
    if (!db) return () => {};
    return db.collection('owners').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Owners listener error:', err.message)
    );
  }

  function subscribePayouts(onData) {
    if (!db) return () => {};
    return db.collection('payouts').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
        list.sort((a, b) => Number(b.id) - Number(a.id));
        onData(list);
      },
      (err) => console.warn('[Green Mile Firebase] Payouts listener error:', err.message)
    );
  }

  async function savePayout(payout) {
    if (!db || !payout || payout.id == null) return payout;
    await db.collection('payouts').doc(String(payout.id)).set(Object.assign({}, payout, {
      updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return payout;
  }

  function subscribeAdminConfig(onData) {
    if (!db) return () => {};
    return db.collection('admin_config').doc('main').onSnapshot(
      (snap) => {
        if (snap.exists) onData(snap.data());
      },
      (err) => console.warn('[Green Mile Firebase] Admin config listener error:', err.message)
    );
  }

  async function saveAdminConfig(cfg) {
    if (!db || !cfg) return cfg;
    await db.collection('admin_config').doc('main').set(Object.assign({}, cfg, {
      updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return cfg;
  }

  async function saveReview(review) {
    if (!db || !review) return review;
    await db.collection('reviews').doc(String(review.id)).set(Object.assign({}, review, {
      equipmentId: String(review.equipmentId),
      createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return review;
  }

  function subscribeReviews(equipmentId, onData) {
    if (!db || equipmentId == null) return () => {};
    return db.collection('reviews')
      .where('equipmentId', '==', String(equipmentId))
      .onSnapshot(
        (snap) => {
          const list = [];
          snap.forEach((doc) => list.push(Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id })));
          onData(list);
        },
        (err) => console.warn('[Green Mile Firebase] Reviews listener error:', err.message)
      );
  }

  function subscribeAllReviews(onData) {
    if (!db) return () => {};
    return db.collection('reviews').onSnapshot(
      (snap) => {
        const grouped = {};
        snap.forEach((doc) => {
          const r = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id });
          const k = String(r.equipmentId || '');
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(r);
        });
        onData(grouped);
      },
      (err) => console.warn('[Green Mile Firebase] All reviews listener error:', err.message)
    );
  }

  const LOCAL_TRACKING_KEY = 'gm_rd_tracking_v1';
  const TRACKING_CHANNEL_NAME = 'gm_rd_tracking_channel_v1';
  const VALID_TRACKING_STATUSES = new Set(['scheduled', 'en_route', 'arrived', 'operating', 'completed']);

  function getLocalTrackingMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_TRACKING_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getLocalTracking(bookingId) {
    if (bookingId == null) return null;
    const map = getLocalTrackingMap();
    return map[String(bookingId)] || null;
  }

  function saveLocalTracking(bookingId, docData) {
    if (bookingId == null || !docData) return;
    try {
      const map = getLocalTrackingMap();
      map[String(bookingId)] = docData;
      localStorage.setItem(LOCAL_TRACKING_KEY, JSON.stringify(map));
    } catch (_) {}
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(TRACKING_CHANNEL_NAME);
        ch.postMessage({ type: 'tracking_update', bookingId: String(bookingId), data: docData });
        ch.close();
      }
    } catch (_) {}
  }

  async function getBookingById(id) {
    if (!db || id == null) return null;
    try {
      const snap = await db.collection('bookings').doc(String(id)).get();
      if (snap.exists) {
        return Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id });
      }
    } catch (err) {
      console.warn('[Green Mile Firebase] getBookingById error:', err.message);
    }
    return null;
  }

  function subscribeBookingById(id, onData) {
    if (!db || id == null) return () => {};
    return db.collection('bookings').doc(String(id)).onSnapshot(
      (snap) => {
        if (snap.exists) {
          onData(Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id }));
        }
      },
      (err) => console.warn('[Green Mile Firebase] Booking doc listener error:', err.message)
    );
  }

  function subscribeTracking(bookingId, onData, onError) {
    if (bookingId == null) return () => {};
    const key = String(bookingId);
    const cached = getLocalTracking(key);
    if (cached) {
      setTimeout(() => onData(cached, { source: 'local' }), 0);
    }

    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(TRACKING_CHANNEL_NAME);
        channel.onmessage = (ev) => {
          const msg = ev && ev.data;
          if (msg && msg.type === 'tracking_update' && String(msg.bookingId) === key && msg.data) {
            onData(msg.data, { source: 'broadcast' });
          }
        };
      }
    } catch (_) {}

    const onStorage = (ev) => {
      if (ev.key === LOCAL_TRACKING_KEY) {
        const latest = getLocalTracking(key);
        if (latest) onData(latest, { source: 'storage' });
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    let unsubCloud = () => {};
    if (db) {
      unsubCloud = db.collection('tracking').doc(key).onSnapshot(
        (snap) => {
          if (snap.exists) {
            const data = Object.assign({}, snap.data(), { bookingId: key });
            try {
              const map = getLocalTrackingMap();
              map[key] = data;
              localStorage.setItem(LOCAL_TRACKING_KEY, JSON.stringify(map));
            } catch (_) {}
            onData(data, { source: 'cloud' });
          }
        },
        (err) => {
          console.warn('[Green Mile Firebase] Tracking listener error:', err.message);
          if (typeof onError === 'function') onError(err);
        }
      );
    }

    return () => {
      try { unsubCloud(); } catch (_) {}
      try { if (channel) channel.close(); } catch (_) {}
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }

  function subscribeAllTracking(onData) {
    const emitLocal = () => onData(getLocalTrackingMap());
    setTimeout(emitLocal, 0);

    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(TRACKING_CHANNEL_NAME);
        channel.onmessage = () => emitLocal();
      }
    } catch (_) {}

    const onStorage = (ev) => {
      if (ev.key === LOCAL_TRACKING_KEY) emitLocal();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    let unsubCloud = () => {};
    if (db) {
      unsubCloud = db.collection('tracking').onSnapshot(
        (snap) => {
          const merged = Object.assign({}, getLocalTrackingMap());
          snap.forEach((doc) => {
            const d = Object.assign({}, doc.data(), { bookingId: doc.id });
            const prev = merged[doc.id];
            if (!prev || (d.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
              merged[doc.id] = d;
            }
          });
          onData(merged);
        },
        (err) => console.warn('[Green Mile Firebase] All tracking listener error:', err.message)
      );
    }

    return () => {
      try { unsubCloud(); } catch (_) {}
      try { if (channel) channel.close(); } catch (_) {}
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }

  async function upsertTracking(bookingId, patch) {
    if (bookingId == null) return { ok: false, cloudSynced: false, error: 'bookingId requerido' };
    const key = String(bookingId);
    const existing = getLocalTracking(key) || {};
    const nextStatus = VALID_TRACKING_STATUSES.has(patch && patch.status)
      ? patch.status
      : (VALID_TRACKING_STATUSES.has(existing.status) ? existing.status : 'scheduled');

    const merged = Object.assign({}, existing, patch || {}, {
      bookingId: key,
      status: nextStatus,
      updatedAtMs: Date.now()
    });

    // Clean undefined keys before Firestore write
    const cleanPayload = {};
    Object.keys(merged).forEach((k) => {
      if (merged[k] !== undefined) cleanPayload[k] = merged[k];
    });

    saveLocalTracking(key, cleanPayload);

    if (!db) {
      return { ok: true, cloudSynced: false, data: cleanPayload };
    }

    try {
      await db.collection('tracking').doc(key).set(
        Object.assign({}, cleanPayload, {
          updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      return { ok: true, cloudSynced: true, data: cleanPayload };
    } catch (err) {
      console.warn('[Green Mile Firebase] upsertTracking cloud fallback:', err.message);
      return { ok: true, cloudSynced: false, data: cleanPayload, error: err.message };
    }
  }

  const LOCAL_PROPOSALS_KEY = 'gm_rd_proposals_v1';

  function getLocalProposals() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_PROPOSALS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalProposals(list) {
    try {
      localStorage.setItem(LOCAL_PROPOSALS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function subscribeProposals(onData) {
    setTimeout(() => onData(getLocalProposals()), 0);
    if (!db) return () => {};
    return db.collection('proposals').onSnapshot(
      (snap) => {
        const cloudMap = new Map();
        snap.forEach((doc) => {
          const d = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id, cloudSynced: true });
          cloudMap.set(String(d.id), d);
        });
        // Mantener solo postulaciones locales aún pendientes de sincronizar en la nube
        getLocalProposals().forEach((lp) => {
          if (lp && lp.cloudSynced === false && !cloudMap.has(String(lp.id))) {
            cloudMap.set(String(lp.id), lp);
          }
        });
        const merged = Array.from(cloudMap.values()).sort((a, b) => Number(b.id) - Number(a.id));
        saveLocalProposals(merged);
        onData(merged);
      },
      (err) => console.warn('[Green Mile Firebase] Proposals listener error:', err.message)
    );
  }

  async function saveProposal(proposal) {
    if (!proposal || proposal.id == null) return proposal;
    const localRecord = Object.assign({}, proposal, { cloudSynced: false });
    const local = getLocalProposals().filter((p) => String(p.id) !== String(proposal.id));
    local.unshift(localRecord);
    saveLocalProposals(local);

    if (!db) return localRecord;
    try {
      await db.collection('proposals').doc(String(proposal.id)).set(
        Object.assign({}, proposal, {
          cloudSynced: true,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      const synced = Object.assign({}, proposal, { cloudSynced: true });
      const updated = getLocalProposals().map((p) => (String(p.id) === String(proposal.id) ? synced : p));
      saveLocalProposals(updated);
      return synced;
    } catch (err) {
      console.warn('[Green Mile Firebase] saveProposal fallback local:', err.message);
      return localRecord;
    }
  }

  async function deleteProposal(proposalId) {
    if (proposalId == null) return;
    const next = getLocalProposals().filter((p) => String(p.id) !== String(proposalId));
    saveLocalProposals(next);
    if (!db) return;
    try {
      await db.collection('proposals').doc(String(proposalId)).delete();
    } catch (err) {
      console.warn('[Green Mile Firebase] deleteProposal warning:', err.message);
    }
  }

  const LOCAL_PARTS_KEY = 'gm_rd_parts_v1';
  const LOCAL_SALES_KEY = 'gm_rd_sales_v1';
  const LOCAL_ORDERS_KEY = 'gm_rd_orders_v1';

  function applyDefaultPartImages(list, defaultParts = []) {
    if (!Array.isArray(list) || !Array.isArray(defaultParts) || !defaultParts.length) return list;
    const imgById = new Map(defaultParts.map((p) => [String(p.id), p.img]));
    return list.map((item) => {
      const canonicalImg = imgById.get(String(item && item.id));
      if (canonicalImg && item && item.img && item.img !== canonicalImg && String(item.img).startsWith('img/parts/')) {
        return Object.assign({}, item, { img: canonicalImg });
      }
      return item;
    });
  }

  function getLocalParts(defaultParts = []) {
    try {
      const raw = localStorage.getItem(LOCAL_PARTS_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) {
          return applyDefaultPartImages(list, defaultParts);
        }
      }
    } catch (_) {}
    return Array.isArray(defaultParts) ? defaultParts.map((p) => Object.assign({}, p)) : [];
  }

  function saveLocalParts(list) {
    try {
      localStorage.setItem(LOCAL_PARTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function subscribeParts(onData, defaultParts = []) {
    setTimeout(() => onData(getLocalParts(defaultParts)), 0);
    if (!db) return () => {};
    seedIfEmpty('parts', defaultParts).catch((err) => {
      console.warn('[Green Mile Firebase] Seed parts skipped:', err.message);
    });
    return db.collection('parts').onSnapshot(
      (snap) => {
        const cloudMap = new Map();
        const imgById = new Map((defaultParts || []).map((p) => [String(p.id), p.img]));
        snap.forEach((doc) => {
          const d = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id, cloudSynced: true });
          const canonicalImg = imgById.get(String(d.id));
          if (canonicalImg && d.img && d.img !== canonicalImg && String(d.img).startsWith('img/parts/')) {
            d.img = canonicalImg;
            db.collection('parts').doc(String(d.id)).set({ img: canonicalImg }, { merge: true }).catch(() => {});
          }
          cloudMap.set(String(d.id), d);
        });
        if (cloudMap.size === 0 && Array.isArray(defaultParts)) {
          defaultParts.forEach((p) => cloudMap.set(String(p.id), Object.assign({}, p)));
        }
        getLocalParts([]).forEach((lp) => {
          if (lp && lp.cloudSynced === false && !cloudMap.has(String(lp.id))) {
            cloudMap.set(String(lp.id), lp);
          }
        });
        const merged = Array.from(cloudMap.values()).sort((a, b) => Number(b.id) - Number(a.id));
        saveLocalParts(merged);
        onData(merged);
      },
      (err) => console.warn('[Green Mile Firebase] Parts listener error:', err.message)
    );
  }

  async function savePart(part) {
    if (!part || part.id == null) return part;
    const localRec = Object.assign({}, part, { cloudSynced: false });
    const next = getLocalParts([]).filter((p) => String(p.id) !== String(part.id));
    next.unshift(localRec);
    saveLocalParts(next);

    if (!db) return localRec;
    try {
      await db.collection('parts').doc(String(part.id)).set(
        Object.assign({}, part, {
          cloudSynced: true,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      const synced = Object.assign({}, part, { cloudSynced: true });
      saveLocalParts(getLocalParts([]).map((p) => (String(p.id) === String(part.id) ? synced : p)));
      return synced;
    } catch (err) {
      console.warn('[Green Mile Firebase] savePart local fallback:', err.message);
      return localRec;
    }
  }

  async function deletePart(partId) {
    if (partId == null) return;
    saveLocalParts(getLocalParts([]).filter((p) => String(p.id) !== String(partId)));
    if (!db) return;
    try {
      await db.collection('parts').doc(String(partId)).delete();
    } catch (err) {
      console.warn('[Green Mile Firebase] deletePart warning:', err.message);
    }
  }

  function getLocalSales(defaultSales = []) {
    try {
      const raw = localStorage.getItem(LOCAL_SALES_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (_) {}
    return Array.isArray(defaultSales) ? defaultSales.map((s) => Object.assign({}, s)) : [];
  }

  function saveLocalSales(list) {
    try {
      localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function subscribeSales(onData, defaultSales = []) {
    setTimeout(() => onData(getLocalSales(defaultSales)), 0);
    if (!db) return () => {};
    seedIfEmpty('sales', defaultSales).catch((err) => {
      console.warn('[Green Mile Firebase] Seed sales skipped:', err.message);
    });
    return db.collection('sales').onSnapshot(
      (snap) => {
        const cloudMap = new Map();
        snap.forEach((doc) => {
          const d = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id, cloudSynced: true });
          cloudMap.set(String(d.id), d);
        });
        if (cloudMap.size === 0 && Array.isArray(defaultSales)) {
          defaultSales.forEach((s) => cloudMap.set(String(s.id), Object.assign({}, s)));
        }
        getLocalSales([]).forEach((ls) => {
          if (ls && ls.cloudSynced === false && !cloudMap.has(String(ls.id))) {
            cloudMap.set(String(ls.id), ls);
          }
        });
        const merged = Array.from(cloudMap.values()).sort((a, b) => Number(b.id) - Number(a.id));
        saveLocalSales(merged);
        onData(merged);
      },
      (err) => console.warn('[Green Mile Firebase] Sales listener error:', err.message)
    );
  }

  async function saveSaleMachine(item) {
    if (!item || item.id == null) return item;
    const localRec = Object.assign({}, item, { cloudSynced: false });
    const next = getLocalSales([]).filter((s) => String(s.id) !== String(item.id));
    next.unshift(localRec);
    saveLocalSales(next);

    if (!db) return localRec;
    try {
      await db.collection('sales').doc(String(item.id)).set(
        Object.assign({}, item, {
          cloudSynced: true,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      const synced = Object.assign({}, item, { cloudSynced: true });
      saveLocalSales(getLocalSales([]).map((s) => (String(s.id) === String(item.id) ? synced : s)));
      return synced;
    } catch (err) {
      console.warn('[Green Mile Firebase] saveSaleMachine local fallback:', err.message);
      return localRec;
    }
  }

  async function deleteSaleMachine(saleId) {
    if (saleId == null) return;
    saveLocalSales(getLocalSales([]).filter((s) => String(s.id) !== String(saleId)));
    if (!db) return;
    try {
      await db.collection('sales').doc(String(saleId)).delete();
    } catch (err) {
      console.warn('[Green Mile Firebase] deleteSaleMachine warning:', err.message);
    }
  }

  function getLocalOrders() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalOrders(list) {
    try {
      localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function subscribeOrders(onData) {
    setTimeout(() => onData(getLocalOrders()), 0);
    if (!db) return () => {};
    return db.collection('orders').onSnapshot(
      (snap) => {
        const cloudMap = new Map();
        snap.forEach((doc) => {
          const d = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id, cloudSynced: true });
          cloudMap.set(String(d.id), d);
        });
        getLocalOrders().forEach((lo) => {
          if (lo && lo.cloudSynced === false && !cloudMap.has(String(lo.id))) {
            cloudMap.set(String(lo.id), lo);
          }
        });
        const merged = Array.from(cloudMap.values()).sort((a, b) => Number(b.id) - Number(a.id));
        saveLocalOrders(merged);
        onData(merged);
      },
      (err) => console.warn('[Green Mile Firebase] Orders listener error:', err.message)
    );
  }

  async function saveOrder(order) {
    if (!order || order.id == null) return order;
    const localRec = Object.assign({}, order, { cloudSynced: false });
    const next = getLocalOrders().filter((o) => String(o.id) !== String(order.id));
    next.unshift(localRec);
    saveLocalOrders(next);

    if (!db) return localRec;
    try {
      await db.collection('orders').doc(String(order.id)).set(
        Object.assign({}, order, {
          cloudSynced: true,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      const synced = Object.assign({}, order, { cloudSynced: true });
      saveLocalOrders(getLocalOrders().map((o) => (String(o.id) === String(order.id) ? synced : o)));
      return synced;
    } catch (err) {
      console.warn('[Green Mile Firebase] saveOrder local fallback:', err.message);
      return localRec;
    }
  }

  async function getPartById(partId) {
    if (partId == null) return null;
    const defaults = (global.GM_CATALOG && Array.isArray(global.GM_CATALOG.DEFAULT_PARTS))
      ? global.GM_CATALOG.DEFAULT_PARTS
      : [];
    if (db) {
      try {
        const snap = await db.collection('parts').doc(String(partId)).get();
        if (snap.exists) {
          const item = Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id });
          return applyDefaultPartImages([item], defaults)[0];
        }
      } catch (_) {}
    }
    return getLocalParts(defaults).find((p) => String(p.id) === String(partId)) || null;
  }

  async function getSaleMachineById(saleId) {
    if (saleId == null) return null;
    if (db) {
      try {
        const snap = await db.collection('sales').doc(String(saleId)).get();
        if (snap.exists) return Object.assign({}, snap.data(), { id: snap.data().id ?? snap.id });
        const eqSnap = await db.collection('equipment').doc(String(saleId)).get();
        if (eqSnap.exists) return Object.assign({}, eqSnap.data(), { id: eqSnap.data().id ?? eqSnap.id });
      } catch (_) {}
    }
    return getLocalSales([]).find((s) => String(s.id) === String(saleId)) || null;
  }

  const LOCAL_CHATS_KEY = 'gm_rd_product_chats_v1';

  function getLocalProductChats() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_CHATS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalProductChats(list) {
    try {
      localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function subscribeAllProductChats(onData) {
    setTimeout(() => onData(getLocalProductChats()), 0);
    if (!db) return () => {};
    return db.collection('product_chats').onSnapshot(
      (snap) => {
        const map = new Map();
        snap.forEach((doc) => {
          const d = Object.assign({}, doc.data(), { id: doc.data().id ?? doc.id, cloudSynced: true });
          map.set(String(d.id), d);
        });
        getLocalProductChats().forEach((lc) => {
          if (lc && lc.cloudSynced === false && !map.has(String(lc.id))) {
            map.set(String(lc.id), lc);
          }
        });
        const merged = Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
        saveLocalProductChats(merged);
        onData(merged);
      },
      (err) => console.warn('[Green Mile Firebase] Product chats listener error:', err.message)
    );
  }

  function subscribeProductChats(itemId, kind, onData) {
    const filterFn = (all) => (all || []).filter(
      (m) => String(m.itemId) === String(itemId) && (!kind || m.kind === kind)
    );
    return subscribeAllProductChats((all) => onData(filterFn(all)));
  }

  async function sendProductChatMessage(msg) {
    if (!msg || msg.id == null) return msg;
    const localRec = Object.assign({}, msg, { cloudSynced: false });
    const next = getLocalProductChats().filter((m) => String(m.id) !== String(msg.id));
    next.push(localRec);
    saveLocalProductChats(next);

    if (!db) return localRec;
    try {
      await db.collection('product_chats').doc(String(msg.id)).set(
        Object.assign({}, msg, {
          cloudSynced: true,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp()
        }),
        { merge: true }
      );
      const synced = Object.assign({}, msg, { cloudSynced: true });
      saveLocalProductChats(getLocalProductChats().map((m) => (String(m.id) === String(msg.id) ? synced : m)));
      return synced;
    } catch (err) {
      console.warn('[Green Mile Firebase] sendProductChatMessage local fallback:', err.message);
      return localRec;
    }
  }

  global.GM_FIREBASE = {
    isReady,
    compressImageFile,
    getCurrentOwner,
    getCurrentAccount: getCurrentOwner,
    logoutOwner,
    logoutAccount: logoutOwner,
    registerOwnerAccount,
    registerAccount: registerOwnerAccount,
    loginOwnerAccount,
    loginAccount: loginOwnerAccount,
    updateAccountRole,
    rememberGuestBookingId,
    getGuestBookingIds,
    subscribeEquipment,
    subscribeRequests,
    subscribeBookings,
    subscribeOwners,
    subscribePayouts,
    subscribeAdminConfig,
    getEquipmentById,
    subscribeEquipmentById,
    getBookingById,
    subscribeBookingById,
    saveEquipment,
    updateEquipmentStatus,
    deleteEquipment,
    saveRequest,
    deleteRequest,
    saveBooking,
    updateBooking,
    savePayout,
    saveAdminConfig,
    saveReview,
    subscribeReviews,
    subscribeAllReviews,
    getLocalTracking,
    subscribeTracking,
    subscribeAllTracking,
    upsertTracking,
    getLocalProposals,
    subscribeProposals,
    saveProposal,
    deleteProposal,
    getLocalParts,
    subscribeParts,
    getPartById,
    savePart,
    deletePart,
    getLocalSales,
    subscribeSales,
    getSaleMachineById,
    saveSaleMachine,
    deleteSaleMachine,
    getLocalOrders,
    subscribeOrders,
    saveOrder,
    getLocalProductChats,
    subscribeProductChats,
    subscribeAllProductChats,
    sendProductChatMessage
  };
})(window);
