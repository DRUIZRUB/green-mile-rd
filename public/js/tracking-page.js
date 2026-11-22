/* Green Mile RD — Production Real-Time GPS Tracking Controller (Firestore + Native/Web GPS) */
(function () {
  'use strict';

  const GM = window.GM_CATALOG;
  const FB = window.GM_FIREBASE;
  const GEO = window.GM_GEO;
  const NATIVE = window.GM_NATIVE;

  let role = 'client';
  let currentBooking = null;
  let allBookings = [];
  let allTrackingMap = {};
  let originPt = null;
  let destPt = null;
  let liveMap = null;
  let plannedRoute = null;
  let trackingDoc = null;
  let unsubTracking = null;
  let unsubBooking = null;

  // Real GPS telemetry state
  let gpsActive = false;
  let lastWriteMs = 0;
  let lastWritePos = null;
  let lastRerouteMs = 0;
  let lastReroutePos = null;
  let arrivalGeofenceAlerted = false;
  let lastTelemetryAtMs = 0;

  function $(id) {
    return document.getElementById(id);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function encodeBookingPayload(bk) {
    try {
      const slim = {
        id: bk.id,
        equipmentId: bk.equipmentId,
        title: bk.title,
        city: bk.city,
        owner: bk.owner,
        ownerPhone: bk.ownerPhone,
        renter: bk.renter,
        address: bk.address,
        originLat: originPt ? originPt.lat : bk.originLat,
        originLng: originPt ? originPt.lng : bk.originLng,
        originLabel: originPt ? originPt.label : bk.originLabel,
        worksiteLat: destPt ? destPt.lat : bk.worksiteLat,
        worksiteLng: destPt ? destPt.lng : bk.worksiteLng,
        distanceKm: bk.distanceKm,
        durationMin: bk.durationMin,
        equipmentImg: bk.equipmentImg && !String(bk.equipmentImg).startsWith('data:') ? bk.equipmentImg : ''
      };
      const bytes = new TextEncoder().encode(JSON.stringify(slim));
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (_) {
      return '';
    }
  }

  function decodeBookingPayload(hashStr) {
    const m = String(hashStr || '').match(/bk=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      return obj && obj.title ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function resolveEquipmentForBooking(bk) {
    const state = GM ? GM.loadState() : { equipment: [] };
    const list = state.equipment || [];
    if (bk && bk.equipmentId != null) {
      const byId = list.find((e) => String(e.id) === String(bk.equipmentId));
      if (byId) return byId;
    }
    if (bk && bk.title) {
      const byTitle = list.find((e) => String(e.title).toLowerCase() === String(bk.title).toLowerCase());
      if (byTitle) return byTitle;
    }
    return null;
  }

  function resolveEndpoints(bk) {
    const eq = resolveEquipmentForBooking(bk);
    let origin;
    if (Number.isFinite(Number(bk.originLat)) && Number.isFinite(Number(bk.originLng))) {
      origin = {
        lat: Number(bk.originLat),
        lng: Number(bk.originLng),
        label: bk.originLabel || `Patio ${bk.city || 'RD'}`
      };
    } else if (eq) {
      origin = GEO.getEquipmentOrigin(eq);
    } else {
      origin = GEO.getCityCoords(bk.city || 'Santo Domingo');
    }

    let dest;
    if (Number.isFinite(Number(bk.worksiteLat)) && Number.isFinite(Number(bk.worksiteLng))) {
      dest = {
        lat: Number(bk.worksiteLat),
        lng: Number(bk.worksiteLng),
        label: bk.address || `Obra en ${bk.city || 'RD'}`
      };
    } else {
      const cityCenter = GEO.getCityCoords(bk.city || 'Santo Domingo');
      dest = {
        lat: cityCenter.lat,
        lng: cityCenter.lng,
        label: bk.address || `Obra en ${bk.city || 'RD'}`
      };
    }

    return { origin, dest, eq };
  }

  function formatArrivalClock(etaMin) {
    if (!Number.isFinite(etaMin) || etaMin <= 0) return 'Llegando ahora';
    const etaDate = new Date(Date.now() + etaMin * 60000);
    return 'Llegada aprox. ' + etaDate.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
  }

  function formatRelativeTime(ms) {
    if (!ms) return 'Esperando señal GPS del operador';
    const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diffSec < 5) return 'Actualizado ahora mismo';
    if (diffSec < 60) return `Actualizado hace ${diffSec} s`;
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `Actualizado hace ${mins} min`;
    return `Actualizado hace ${Math.round(mins / 60)} h`;
  }

  function buildRoleUrl(targetRole) {
    const base = new URL('./tracking.html', window.location.href);
    if (currentBooking) {
      base.searchParams.set('booking', String(currentBooking.id));
    }
    if (targetRole === 'operator') base.searchParams.set('role', 'operator');
    if (currentBooking) {
      const encoded = encodeBookingPayload(currentBooking);
      if (encoded) base.hash = 'bk=' + encoded;
    }
    return base.href;
  }

  function getStatusMeta(status) {
    switch (status) {
      case 'en_route':
        return { eyebrow: 'EN CAMINO A OBRA', topLabel: 'En camino • En vivo', stepIndex: 1 };
      case 'arrived':
        return { eyebrow: 'UNIDAD EN OBRA', topLabel: 'Llegó a la obra', stepIndex: 2 };
      case 'operating':
      case 'completed':
        return { eyebrow: 'ENTREGA CONFIRMADA', topLabel: 'En operación en obra', stepIndex: 3 };
      default:
        return { eyebrow: 'DESPACHO PROGRAMADO', topLabel: 'Esperando salida de patio', stepIndex: 0 };
    }
  }

  function showEmptyState(isEmpty) {
    $('emptyDispatchState').style.display = isEmpty ? 'block' : 'none';
    $('dispatchContent').style.display = isEmpty ? 'none' : 'flex';
    if (isEmpty) {
      $('topStatusText').textContent = 'Sin despachos activos';
      $('topLiveDot').className = 'live-dot';
    }
  }

  function updateRoleUI() {
    $('roleClientBtn').classList.toggle('active', role === 'client');
    $('roleOperatorBtn').classList.toggle('active', role === 'operator');
    $('clientPanel').style.display = role === 'client' ? 'flex' : 'none';
    $('operatorPanel').style.display = role === 'operator' ? 'flex' : 'none';

    const scrollBox = document.querySelector('#trackSheet .sheet-scroll');
    if (scrollBox) scrollBox.scrollTop = 0;

    const url = new URL(window.location.href);
    if (role === 'operator') url.searchParams.set('role', 'operator');
    else url.searchParams.delete('role');
    window.history.replaceState({}, '', url.toString());

    const env = NATIVE ? NATIVE.getEnvironmentInfo() : { isNative: false, supportsBackgroundGps: false, supportsWakeLock: false };
    const badge = $('gpsModeBadge');
    if (badge) {
      if (env.supportsBackgroundGps) {
        badge.textContent = 'App Nativa • GPS 2.º plano';
        badge.classList.add('native');
      } else if (env.isNative) {
        badge.textContent = 'App Nativa • GPS';
        badge.classList.add('native');
      } else if (env.supportsWakeLock) {
        badge.textContent = 'GPS Real • Pantalla Activa';
        badge.classList.remove('native');
      } else {
        badge.textContent = 'GPS Real en Vivo';
        badge.classList.remove('native');
      }
    }
  }

  function renderBookingMeta() {
    if (!currentBooking) return;
    const eq = resolveEquipmentForBooking(currentBooking);
    const thumbSrc = currentBooking.equipmentImg || (eq && eq.img) || './logo.png';
    $('unitThumb').src = GM ? GM.resolveAsset(thumbSrc, './') : thumbSrc;
    $('unitTitle').textContent = currentBooking.title || 'Maquinaria Pesada';
    $('unitAddress').textContent = `Destino: ${currentBooking.address || currentBooking.city || 'Obra'}`;
    $('clientBookingCode').textContent = `#GM-${String(currentBooking.id).slice(-6)}`;

    $('lblOriginShort').textContent = (originPt && originPt.label ? originPt.label.split(',')[0] : 'Base').slice(0, 22);
    $('lblDestShort').textContent = (currentBooking.address ? currentBooking.address.split(',')[0] : 'Obra').slice(0, 22);

    const phone = (trackingDoc && trackingDoc.operatorPhone) || currentBooking.ownerPhone || '809-555-0100';
    const cleanPhone = String(phone).replace(/[^0-9+]/g, '');
    $('btnCallOp').href = `tel:${cleanPhone}`;
    const waNum = GM ? GM.cleanWA(phone) : '18095550100';
    const waGreet = encodeURIComponent(`Hola, te escribo sobre el despacho #GM-${String(currentBooking.id).slice(-6)} (${currentBooking.title}) hacia ${currentBooking.address || 'la obra'} en Green Mile RD.`);
    $('btnWaOp').href = `https://wa.me/${waNum}?text=${waGreet}`;

    if (destPt) {
      $('btnOpenDestGmaps').href = `https://www.google.com/maps?q=${destPt.lat},${destPt.lng}`;
      $('btnNavGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${destPt.lat},${destPt.lng}&travelmode=driving`;
      $('btnNavWaze').href = `https://waze.com/ul?ll=${destPt.lat},${destPt.lng}&navigate=yes`;
    }
  }

  function updateGpsDiagnostics(doc) {
    const titleEl = $('gpsSignalTitle');
    const readoutEl = $('gpsCoordsReadout');
    if (!titleEl || !readoutEl) return;

    if (gpsActive && doc && Number.isFinite(Number(doc.lat)) && Number.isFinite(Number(doc.lng))) {
      const acc = Number.isFinite(Number(doc.accuracy)) ? ` (±${Math.round(doc.accuracy)} m)` : '';
      titleEl.textContent = `🛰️ Transmitiendo GPS en vivo${acc}`;
      readoutEl.textContent = `${Number(doc.lat).toFixed(5)}, ${Number(doc.lng).toFixed(5)} • ${Math.round(Number(doc.speedKmh) || 0)} km/h`;
    } else if (doc && doc.status === 'en_route' && Number.isFinite(Number(doc.lat))) {
      titleEl.textContent = '📡 Recorrido en curso (GPS en pausa en este equipo)';
      readoutEl.textContent = `Última posición: ${Number(doc.lat).toFixed(5)}, ${Number(doc.lng).toFixed(5)}`;
    } else if (doc && (doc.status === 'arrived' || doc.status === 'completed' || doc.status === 'operating')) {
      titleEl.textContent = '✅ Unidad confirmada en obra';
      readoutEl.textContent = `Obra: ${destPt ? `${destPt.lat.toFixed(5)}, ${destPt.lng.toFixed(5)}` : '--'}`;
    } else {
      titleEl.textContent = '📡 Señal GPS lista para transmitir';
      readoutEl.textContent = 'Presiona "Iniciar Recorrido" para compartir tu ubicación GPS en tiempo real con la obra.';
    }
  }

  function renderTrackingState(doc) {
    if (!currentBooking) return;
    trackingDoc = doc || {
      bookingId: String(currentBooking.id),
      status: 'scheduled',
      operatorName: currentBooking.owner || 'Operador Certificado',
      unitPlate: 'Unidad Asignada',
      remainingKm: plannedRoute ? plannedRoute.distanceKm : (currentBooking.distanceKm || 0),
      etaMin: plannedRoute ? plannedRoute.durationMin : (currentBooking.durationMin || 0),
      speedKmh: 0,
      progressPct: 0
    };

    const status = trackingDoc.status || 'scheduled';
    const meta = getStatusMeta(status);

    // Top pill
    $('topLiveDot').className = `live-dot ${status}`;
    $('topStatusText').textContent = status === 'en_route' && Number.isFinite(Number(trackingDoc.etaMin))
      ? `En camino • ${Math.max(1, Math.round(trackingDoc.etaMin))} min`
      : meta.topLabel;

    // Hero ETA
    const eyebrow = $('etaEyebrow');
    eyebrow.textContent = meta.eyebrow;
    eyebrow.className = `eta-eyebrow ${status}`;

    const totalKm = Math.max(0.5, Number(plannedRoute && plannedRoute.distanceKm) || Number(currentBooking.distanceKm) || 5);
    let remKm = Number.isFinite(Number(trackingDoc.remainingKm)) ? Number(trackingDoc.remainingKm) : totalKm;
    let etaMin = Number.isFinite(Number(trackingDoc.etaMin)) ? Number(trackingDoc.etaMin) : (plannedRoute ? plannedRoute.durationMin : 15);
    let pct = Number.isFinite(Number(trackingDoc.progressPct)) ? Number(trackingDoc.progressPct) : Math.round(Math.max(0, Math.min(100, (1 - remKm / totalKm) * 100)));

    if (status === 'scheduled') {
      $('etaBig').textContent = plannedRoute ? `~${plannedRoute.durationMin} min estimados` : 'Listo para salir';
      $('etaSub').textContent = 'Esperando que el operador inicie el recorrido desde el patio';
      pct = 0;
    } else if (status === 'en_route') {
      const roundedEta = Math.max(1, Math.round(etaMin));
      $('etaBig').textContent = remKm < 0.2 ? 'Llegando ahora' : `${roundedEta} min`;
      $('etaSub').textContent = remKm < 0.2 ? 'A menos de 200 metros de la obra' : formatArrivalClock(roundedEta);
    } else if (status === 'arrived') {
      $('etaBig').textContent = 'Llegó a la obra';
      $('etaSub').textContent = trackingDoc.arrivedAtMs
        ? `Arribo confirmado a las ${new Date(trackingDoc.arrivedAtMs).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}`
        : 'La unidad ya se encuentra en el punto de descarga';
      remKm = 0;
      pct = 100;
    } else {
      $('etaBig').textContent = 'En operación';
      $('etaSub').textContent = 'Equipo entregado y operando en obra';
      remKm = 0;
      pct = 100;
    }

    $('metricKm').textContent = (status === 'arrived' || status === 'completed' || status === 'operating')
      ? '0.0'
      : (Math.round(remKm * 10) / 10).toFixed(1);
    $('metricSpeed').textContent = status === 'en_route'
      ? String(Math.max(0, Math.round(Number(trackingDoc.speedKmh) || 0)))
      : '0';

    // Progress bar
    const clampedPct = Math.max(0, Math.min(100, Math.round(pct)));
    const fill = $('progressFill');
    fill.style.width = clampedPct + '%';
    fill.className = `route-progress-fill ${status}`;
    $('progressTruck').style.left = clampedPct + '%';
    $('lblProgressPct').textContent = `${clampedPct}%`;

    // Stepper
    document.querySelectorAll('#stageStepper .stage-step').forEach((el, idx) => {
      el.classList.remove('active', 'done');
      if (idx < meta.stepIndex) el.classList.add('done');
      else if (idx === meta.stepIndex) el.classList.add((status === 'completed' || status === 'operating') ? 'done' : 'active');
    });

    // Operator details
    const opName = trackingDoc.operatorName || currentBooking.owner || 'Operador Certificado';
    const plate = trackingDoc.unitPlate || 'Unidad Asignada';
    $('unitOperator').textContent = `👷 ${opName} • ${plate}`;

    if (document.activeElement !== $('inpOpName') && !$('inpOpName').value) {
      $('inpOpName').value = opName;
    }
    if (document.activeElement !== $('inpUnitPlate') && !$('inpUnitPlate').value) {
      $('inpUnitPlate').value = plate;
    }

    // Operator action buttons
    $('opMainActions').style.display = (status === 'scheduled' || status === 'completed' || status === 'operating') ? 'flex' : 'none';
    $('btnStartTrip').textContent = (status === 'completed' || status === 'operating')
      ? '🚚 Iniciar Nuevo Recorrido'
      : '🚚 Iniciar Recorrido hacia la Obra';
    $('opActiveActions').style.display = status === 'en_route' ? 'flex' : 'none';
    $('btnPauseGps').textContent = gpsActive ? '⏸ Pausar GPS' : '📡 Reanudar GPS';
    $('opArrivedActions').style.display = status === 'arrived' ? 'flex' : 'none';

    updateGpsDiagnostics(trackingDoc);

    // Update live map vehicle position & route
    if (liveMap && Number.isFinite(Number(trackingDoc.lat)) && Number.isFinite(Number(trackingDoc.lng))) {
      liveMap.updateVehicle(
        {
          lat: Number(trackingDoc.lat),
          lng: Number(trackingDoc.lng),
          heading: Number.isFinite(Number(trackingDoc.heading)) ? Number(trackingDoc.heading) : undefined,
          accuracy: trackingDoc.accuracy
        },
        {
          status,
          durationMs: 750,
          recordTrail: status === 'en_route'
        }
      );

      if (status === 'en_route') {
        if (Array.isArray(trackingDoc.remainingCoords) && trackingDoc.remainingCoords.length >= 2) {
          const pairs = trackingDoc.remainingCoords
            .map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [Number(pt && pt.lat), Number(pt && pt.lng)]))
            .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          if (pairs.length >= 2) liveMap.setActiveRoute(pairs, true);
        }
      } else if (status === 'arrived' || status === 'completed' || status === 'operating') {
        liveMap.setActiveRoute([], true);
      }
    }

    if (trackingDoc.updatedAtMs) {
      lastTelemetryAtMs = trackingDoc.updatedAtMs;
      $('lastUpdateText').textContent = formatRelativeTime(lastTelemetryAtMs);
    }
  }

  function updateSyncBadge(isCloud, note) {
    const pill = $('syncStatusPill');
    if (!pill) return;
    if (isCloud) {
      pill.textContent = '● En vivo • Nube Firestore';
      pill.classList.remove('local');
    } else {
      pill.textContent = note || '● Sin conexión a la nube';
      pill.classList.add('local');
    }
  }

  async function persistTracking(patch) {
    if (!currentBooking) return;
    const opName = ($('inpOpName') && $('inpOpName').value.trim()) || (trackingDoc && trackingDoc.operatorName) || currentBooking.owner || 'Operador Certificado';
    const unitPlate = ($('inpUnitPlate') && $('inpUnitPlate').value.trim()) || (trackingDoc && trackingDoc.unitPlate) || 'Unidad Asignada';

    const payload = Object.assign(
      {
        bookingId: String(currentBooking.id),
        equipmentTitle: currentBooking.title || '',
        operatorName: opName,
        unitPlate,
        operatorPhone: currentBooking.ownerPhone || '',
        originLat: originPt ? originPt.lat : null,
        originLng: originPt ? originPt.lng : null,
        destLat: destPt ? destPt.lat : null,
        destLng: destPt ? destPt.lng : null
      },
      patch
    );

    const res = FB ? await FB.upsertTracking(currentBooking.id, payload) : { ok: true, cloudSynced: false, data: payload };
    updateSyncBadge(Boolean(res.cloudSynced), res.error ? '● Reintentando conexión Firestore…' : null);
    renderTrackingState(res.data || payload);
  }

  async function publishRealPosition(pos, forceReroute) {
    if (!destPt || !currentBooking) return;
    const totalKm = Math.max(0.5, Number(plannedRoute && plannedRoute.distanceKm) || Number(currentBooking.distanceKm) || 5);
    const straightRemKm = GEO.haversineKm(pos, destPt);
    const fallbackRoadKm = Math.max(0, Math.round(straightRemKm * 1.22 * 10) / 10);
    const speedKmh = Number.isFinite(Number(pos.speedKmh)) && pos.speedKmh > 2 ? Number(pos.speedKmh) : 34;

    const now = Date.now();
    const movedSinceReroute = lastReroutePos ? GEO.haversineKm(lastReroutePos, pos) : Infinity;
    let remainingKm = fallbackRoadKm;
    let etaMin = Math.max(1, Math.round((fallbackRoadKm / Math.max(18, speedKmh)) * 60));
    let compactCoords;

    if (forceReroute || now - lastRerouteMs > 12000 || movedSinceReroute > 0.12) {
      lastRerouteMs = now;
      lastReroutePos = { lat: pos.lat, lng: pos.lng };
      try {
        const rt = await GEO.calculateRoute(pos, destPt);
        if (rt) {
          remainingKm = rt.distanceKm;
          etaMin = rt.durationMin;
          if (liveMap) liveMap.setActiveRoute(rt.geometry, rt.isRoadRoute);
          if (Array.isArray(rt.geometry) && rt.geometry.length >= 2) {
            const stride = Math.max(1, Math.ceil(rt.geometry.length / 55));
            compactCoords = rt.geometry
              .filter((_, i) => i % stride === 0 || i === rt.geometry.length - 1)
              .map(([lat, lng]) => ({
                lat: Math.round(Number(lat) * 100000) / 100000,
                lng: Math.round(Number(lng) * 100000) / 100000
              }));
          }
        }
      } catch (_) {}
    }

    const progressPct = Math.round(Math.max(2, Math.min(99, (1 - remainingKm / totalKm) * 100)));

    await persistTracking({
      status: 'en_route',
      lat: pos.lat,
      lng: pos.lng,
      heading: Number.isFinite(Number(pos.heading)) ? Math.round(Number(pos.heading)) : undefined,
      speedKmh: Math.round(Number(pos.speedKmh) || 0),
      accuracy: pos.accuracy || null,
      remainingKm: Math.round(remainingKm * 10) / 10,
      etaMin,
      progressPct,
      source: pos.source || 'web-gps',
      remainingCoords: compactCoords
    });

    // Automatic worksite arrival geofence (150 meters)
    if (straightRemKm <= 0.15 && !arrivalGeofenceAlerted) {
      arrivalGeofenceAlerted = true;
      toast('📍 Estás a menos de 150 m de la obra. Pulsa "Llegué a Obra" al estacionar.');
    }
  }

  async function captureSingleGpsFix() {
    if (!navigator || !navigator.geolocation) {
      toast('Este dispositivo no soporta geolocalización GPS');
      return;
    }
    toast('📡 Obteniendo ubicación GPS actual…');
    navigator.geolocation.getCurrentPosition(
      async (raw) => {
        const pos = {
          lat: raw.coords.latitude,
          lng: raw.coords.longitude,
          speedKmh: Number.isFinite(raw.coords.speed) && raw.coords.speed >= 0 ? Math.round(raw.coords.speed * 3.6 * 10) / 10 : 0,
          heading: Number.isFinite(raw.coords.heading) && raw.coords.heading >= 0 ? raw.coords.heading : null,
          accuracy: Math.round(raw.coords.accuracy || 0),
          source: 'web-gps'
        };
        if (trackingDoc && trackingDoc.status === 'en_route') {
          await publishRealPosition(pos, true);
        } else {
          await persistTracking({
            status: (trackingDoc && trackingDoc.status) || 'scheduled',
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            source: 'web-gps'
          });
        }
        if (liveMap) liveMap.focusVehicle();
        toast('✓ Ubicación GPS actualizada en la nube');
      },
      (err) => {
        toast(err && err.code === 1
          ? 'Permiso de ubicación denegado. Activa el GPS en la configuración del navegador o app.'
          : 'No se pudo obtener señal GPS en este momento.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async function startRealGpsTrip() {
    arrivalGeofenceAlerted = false;
    if (!NATIVE) {
      toast('Puente GPS no disponible en este dispositivo');
      return;
    }

    try {
      toast('📡 Activando señal GPS de alta precisión…');
      const started = await NATIVE.startLiveGps({
        title: `Green Mile RD — ${currentBooking.title}`,
        message: `En camino hacia ${currentBooking.address || 'la obra'}. Tracking GPS activo en segundo plano.`,
        onPosition: (pos) => {
          const now = Date.now();
          const movedKm = lastWritePos ? GEO.haversineKm(lastWritePos, pos) : Infinity;
          if (now - lastWriteMs < 2500 && movedKm < 0.015) return;
          lastWriteMs = now;
          lastWritePos = { lat: pos.lat, lng: pos.lng };
          publishRealPosition(pos, false);
        },
        onError: (errMsg) => {
          toast(errMsg);
        }
      });

      gpsActive = true;
      await persistTracking({
        status: 'en_route',
        startedAtMs: (trackingDoc && trackingDoc.startedAtMs) || Date.now(),
        lat: (trackingDoc && trackingDoc.lat) || originPt.lat,
        lng: (trackingDoc && trackingDoc.lng) || originPt.lng
      });

      if (started.mode === 'native-background') {
        toast('🛰️ Recorrido iniciado con GPS nativo en 2.º plano');
      } else if (started.wakeLock) {
        toast('🚚 Recorrido iniciado — GPS en vivo + pantalla activa');
      } else {
        toast('🚚 Recorrido iniciado — transmitiendo ubicación GPS');
      }
    } catch (err) {
      gpsActive = false;
      toast(err && err.message ? err.message : 'No se pudo activar el GPS');
    }
  }

  async function togglePauseRealGps() {
    if (gpsActive) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
      $('btnPauseGps').textContent = '📡 Reanudar GPS';
      updateGpsDiagnostics(trackingDoc);
      toast('⏸ Transmisión GPS pausada');
    } else {
      await startRealGpsTrip();
    }
  }

  async function markArrived() {
    if (gpsActive && NATIVE) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
    }
    await persistTracking({
      status: 'arrived',
      lat: destPt.lat,
      lng: destPt.lng,
      remainingKm: 0,
      etaMin: 0,
      speedKmh: 0,
      progressPct: 100,
      arrivedAtMs: Date.now(),
      remainingCoords: []
    });
    toast('📍 Llegada a obra confirmada en Firestore');
  }

  async function markCompleted() {
    if (gpsActive && NATIVE) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
    }
    await persistTracking({
      status: 'completed',
      lat: destPt.lat,
      lng: destPt.lng,
      remainingKm: 0,
      etaMin: 0,
      speedKmh: 0,
      progressPct: 100,
      completedAtMs: Date.now(),
      remainingCoords: []
    });
    toast('✅ Entrega confirmada — equipo operando en obra');
  }

  async function shareRoleLink(targetRole, viaWhatsApp) {
    if (!currentBooking) return;
    const url = buildRoleUrl(targetRole);
    const code = `#GM-${String(currentBooking.id).slice(-6)}`;
    const msg = targetRole === 'operator'
      ? `👷 *Consola GPS del Operador — Green Mile RD*\nOrden ${code} • *${currentBooking.title}*\nDestino: ${currentBooking.address || currentBooking.city}\n\nAbre este enlace al salir del patio y pulsa *Iniciar Recorrido*:\n${url}`
      : `🚚 *Tracking GPS en Vivo — Green Mile RD*\nOrden ${code} • *${currentBooking.title}*\nObra: ${currentBooking.address || currentBooking.city}\n\nSigue la unidad en el mapa en tiempo real:\n${url}`;

    if (viaWhatsApp) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      return;
    }

    if (GM) {
      await GM.copyToClipboard(url);
      toast('✓ Enlace de tracking copiado');
    }
  }

  function pickDefaultBooking(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const enRoute = list.find((b) => allTrackingMap[String(b.id)] && allTrackingMap[String(b.id)].status === 'en_route');
    if (enRoute) return enRoute;
    const arrived = list.find((b) => allTrackingMap[String(b.id)] && allTrackingMap[String(b.id)].status === 'arrived');
    if (arrived) return arrived;
    return list[0];
  }

  function populateBookingPicker(selectedId) {
    const wrap = $('bookingPickerWrap');
    const sel = $('bookingPicker');
    if (!wrap || !sel) return;

    if (allBookings.length <= 1) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'flex';
    sel.innerHTML = allBookings.map((b) => {
      const tr = allTrackingMap[String(b.id)];
      const tag = tr && tr.status === 'en_route' ? '🟢 ' : (tr && tr.status === 'arrived' ? '📍 ' : '');
      return `<option value="${b.id}"${String(b.id) === String(selectedId) ? ' selected' : ''}>${tag}#GM-${String(b.id).slice(-6)} — ${b.title} (${b.renter || b.city})</option>`;
    }).join('');
  }

  async function loadSelectedBooking(bk) {
    if (unsubTracking) { unsubTracking(); unsubTracking = null; }
    if (unsubBooking) { unsubBooking(); unsubBooking = null; }
    if (gpsActive && NATIVE) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
    }

    if (!bk) {
      showEmptyState(true);
      return;
    }

    showEmptyState(false);
    currentBooking = bk;
    const ep = resolveEndpoints(bk);
    originPt = ep.origin;
    destPt = ep.dest;
    renderBookingMeta();

    if (liveMap) {
      liveMap.destroy();
      liveMap = null;
    }

    liveMap = await GEO.createLiveTrackingMap({
      mapId: 'liveMap',
      origin: originPt,
      dest: destPt,
      onFollowChange: (isFollowing) => {
        const btn = $('btnFollow');
        if (btn) btn.classList.toggle('active', isFollowing);
      }
    });

    // Compute real road route from equipment patio to worksite via OSRM
    plannedRoute = await GEO.calculateRoute(originPt, destPt);
    if (liveMap && plannedRoute) {
      liveMap.setPlannedRoute(plannedRoute.geometry, plannedRoute.isRoadRoute);
      liveMap.setActiveRoute(plannedRoute.geometry, plannedRoute.isRoadRoute);
      liveMap.updateVehicle(
        {
          lat: originPt.lat,
          lng: originPt.lng,
          heading: plannedRoute.geometry.length > 1
            ? GEO.computeBearing(
                { lat: plannedRoute.geometry[0][0], lng: plannedRoute.geometry[0][1] },
                { lat: plannedRoute.geometry[1][0], lng: plannedRoute.geometry[1][1] }
              )
            : 0
        },
        { status: 'scheduled', animate: false, recordTrail: false }
      );
      liveMap.fitAll();
    }

    renderTrackingState(FB ? FB.getLocalTracking(bk.id) : null);

    // Subscribe to real-time Cloud Firestore tracking updates
    if (FB) {
      unsubTracking = FB.subscribeTracking(
        bk.id,
        (doc, meta) => {
          if (meta && meta.source === 'cloud') updateSyncBadge(true);
          renderTrackingState(doc);
        },
        () => {
          updateSyncBadge(false, '● Error de permisos en Firestore');
        }
      );

      unsubBooking = FB.subscribeBookingById(bk.id, (freshBk) => {
        if (freshBk) {
          currentBooking = Object.assign({}, currentBooking, freshBk);
          renderBookingMeta();
        }
      });
    }
  }

  function bindEvents() {
    $('roleClientBtn').addEventListener('click', () => {
      role = 'client';
      updateRoleUI();
    });
    $('roleOperatorBtn').addEventListener('click', () => {
      role = 'operator';
      updateRoleUI();
    });

    $('sheetHandle').addEventListener('click', () => {
      $('trackSheet').classList.toggle('is-collapsed');
      setTimeout(() => { if (liveMap) liveMap.invalidate(); }, 280);
    });

    $('btnToggleLayer').addEventListener('click', () => {
      if (!liveMap) return;
      const next = liveMap.getTileLayer() === 'streets' ? 'satellite' : 'streets';
      liveMap.setTileLayer(next);
      $('btnToggleLayer').classList.toggle('active', next === 'satellite');
      toast(next === 'satellite' ? '🛰️ Vista Satélite activada' : '🗺️ Vista de Calles activada');
    });

    $('btnFollow').addEventListener('click', () => {
      if (!liveMap) return;
      const next = !liveMap.isFollowing();
      liveMap.setFollowMode(next);
      if (next) liveMap.focusVehicle();
      toast(next ? '🎯 Siguiendo unidad en vivo' : 'Mapa libre');
    });

    $('btnFitRoute').addEventListener('click', () => {
      if (!liveMap) return;
      liveMap.setFollowMode(false);
      liveMap.fitAll();
    });

    $('btnZoomIn').addEventListener('click', () => { if (liveMap) liveMap.zoomIn(); });
    $('btnZoomOut').addEventListener('click', () => { if (liveMap) liveMap.zoomOut(); });

    $('btnCopyClientLink').addEventListener('click', () => shareRoleLink('client', false));
    $('btnShareClientWa').addEventListener('click', () => shareRoleLink('client', true));
    $('btnOpShareWa').addEventListener('click', () => shareRoleLink('client', true));
    $('btnShareOpWa').addEventListener('click', () => shareRoleLink('operator', true));

    $('btnStartTrip').addEventListener('click', startRealGpsTrip);
    $('btnPauseGps').addEventListener('click', togglePauseRealGps);
    $('btnMarkArrived').addEventListener('click', markArrived);
    $('btnMarkCompleted').addEventListener('click', markCompleted);
    $('btnRefreshGpsFix').addEventListener('click', captureSingleGpsFix);

    const saveOpMeta = () => {
      if (!currentBooking) return;
      persistTracking({
        operatorName: $('inpOpName').value.trim() || currentBooking.owner || 'Operador Certificado',
        unitPlate: $('inpUnitPlate').value.trim() || 'Unidad Asignada'
      });
    };
    $('inpOpName').addEventListener('change', saveOpMeta);
    $('inpUnitPlate').addEventListener('change', saveOpMeta);

    $('bookingPicker').addEventListener('change', (ev) => {
      const chosenId = ev.target.value;
      const found = allBookings.find((b) => String(b.id) === String(chosenId));
      if (!found) return;
      const url = new URL(window.location.href);
      url.searchParams.set('booking', String(found.id));
      window.history.replaceState({}, '', url.toString());
      loadSelectedBooking(found);
    });

    setInterval(() => {
      if (lastTelemetryAtMs) {
        $('lastUpdateText').textContent = formatRelativeTime(lastTelemetryAtMs);
      }
    }, 2000);
  }

  async function init() {
    bindEvents();

    const params = new URLSearchParams(window.location.search);
    role = params.get('role') === 'operator' ? 'operator' : 'client';
    updateRoleUI();

    const state = GM ? GM.loadState() : { bookings: [] };
    allBookings = Array.isArray(state.bookings) ? state.bookings.slice() : [];

    const bookingParam = params.get('booking');
    const hashBooking = decodeBookingPayload(window.location.hash);

    if (FB && FB.subscribeAllTracking) {
      FB.subscribeAllTracking((tMap) => {
        allTrackingMap = tMap || {};
        if (allBookings.length > 1 && currentBooking) {
          populateBookingPicker(currentBooking.id);
        }
      });
    }

    let targetBooking = null;
    if (bookingParam) {
      targetBooking = allBookings.find((b) => String(b.id) === String(bookingParam)) || null;
      if (!targetBooking && FB && FB.isReady()) {
        targetBooking = await FB.getBookingById(bookingParam);
      }
      if (!targetBooking && hashBooking && String(hashBooking.id) === String(bookingParam)) {
        targetBooking = hashBooking;
      }
    } else if (allBookings.length > 0) {
      targetBooking = pickDefaultBooking(allBookings);
    } else if (hashBooking) {
      targetBooking = hashBooking;
    }

    if (targetBooking) {
      populateBookingPicker(targetBooking.id);
      await loadSelectedBooking(targetBooking);
    } else {
      // Wait briefly for Cloud Firestore bookings before displaying empty state
      if (FB && FB.isReady()) {
        $('topStatusText').textContent = 'Buscando despachos en Firestore…';
      } else {
        showEmptyState(true);
      }
    }

    // Subscribe to real Cloud Firestore bookings
    if (FB && FB.isReady()) {
      updateSyncBadge(true);
      FB.subscribeBookings(async (cloudBookings) => {
        if (Array.isArray(cloudBookings)) {
          allBookings = cloudBookings;
          if (!currentBooking) {
            const picked = bookingParam
              ? cloudBookings.find((b) => String(b.id) === String(bookingParam)) || pickDefaultBooking(cloudBookings)
              : pickDefaultBooking(cloudBookings);
            if (picked) {
              populateBookingPicker(picked.id);
              await loadSelectedBooking(picked);
            } else {
              showEmptyState(true);
            }
          } else {
            populateBookingPicker(currentBooking.id);
          }
        }
      });
    }
  }

  init();
})();
