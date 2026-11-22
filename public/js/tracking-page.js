/* Green Mile RD — Live GPS Tracking Controller (Client + Operator + Simulator) */
(function () {
  'use strict';

  const GM = window.GM_CATALOG;
  const FB = window.GM_FIREBASE;
  const GEO = window.GM_GEO;
  const NATIVE = window.GM_NATIVE;

  const DEMO_BOOKING = {
    id: 'demo-sd-1001',
    equipmentId: 1001,
    title: 'Retroexcavadora CAT 416F2 4x4',
    city: 'Santo Domingo',
    owner: 'Maquinarias del Caribe SRL',
    ownerPhone: '809-555-0101',
    renter: 'Constructora Piantini RD',
    address: 'Av. Abraham Lincoln esq. Gustavo Mejía Ricart, Piantini, Santo Domingo',
    originLat: 18.4945,
    originLng: -69.9852,
    originLabel: 'Patio Zona Industrial de Herrera, Santo Domingo',
    worksiteLat: 18.4728,
    worksiteLng: -69.9369,
    distanceKm: 7.4,
    durationMin: 18,
    equipmentImg: 'img/eq_retroexcavadora.webp',
    isDemo: true
  };

  let role = 'client';
  let currentBooking = null;
  let allBookings = [];
  let originPt = null;
  let destPt = null;
  let liveMap = null;
  let plannedRoute = null;
  let trackingDoc = null;
  let unsubTracking = null;
  let unsubBooking = null;

  // Real GPS state
  let gpsActive = false;
  let lastWriteMs = 0;
  let lastWritePos = null;
  let lastRerouteMs = 0;
  let lastReroutePos = null;
  let arrivalGeofenceAlerted = false;

  // Simulator state
  let simPoints = [];
  let simIndex = 0;
  let simRunning = false;
  let simTimer = null;
  let simSpeedMultiplier = 3;

  // Sync status
  let cloudSynced = FB && FB.isReady();
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
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
      // Offset 4.5km so map still shows a clear route if booking had no GPS pin
      dest = {
        lat: origin.lat - 0.024,
        lng: origin.lng + 0.036,
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
    if (!ms) return 'Sin señal GPS todavía';
    const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diffSec < 5) return 'Actualizado ahora mismo';
    if (diffSec < 60) return `Actualizado hace ${diffSec} s`;
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `Actualizado hace ${mins} min`;
    return `Actualizado hace ${Math.round(mins / 60)} h`;
  }

  function buildRoleUrl(targetRole) {
    const base = new URL('./tracking.html', window.location.href);
    base.searchParams.set('booking', String(currentBooking.id));
    if (targetRole === 'operator') base.searchParams.set('role', 'operator');
    if (currentBooking.isDemo) base.searchParams.set('demo', '1');
    const encoded = encodeBookingPayload(currentBooking);
    if (encoded) base.hash = 'bk=' + encoded;
    return base.href;
  }

  function getStatusMeta(status) {
    switch (status) {
      case 'en_route':
        return {
          eyebrow: 'EN CAMINO A OBRA',
          topLabel: 'En camino • En vivo',
          stepIndex: 1
        };
      case 'arrived':
        return {
          eyebrow: 'UNIDAD EN OBRA',
          topLabel: 'Llegó a la obra',
          stepIndex: 2
        };
      case 'operating':
      case 'completed':
        return {
          eyebrow: 'ENTREGA CONFIRMADA',
          topLabel: 'En operación en obra',
          stepIndex: 3
        };
      default:
        return {
          eyebrow: 'DESPACHO PROGRAMADO',
          topLabel: 'Esperando salida de patio',
          stepIndex: 0
        };
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
        badge.textContent = 'Web • GPS + Pantalla Activa';
        badge.classList.remove('native');
      } else {
        badge.textContent = 'Web • GPS en Vivo';
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
    $('clientBookingCode').textContent = currentBooking.isDemo
      ? 'DEMO-RD'
      : `#GM-${String(currentBooking.id).slice(-6)}`;

    $('lblOriginShort').textContent = (originPt && originPt.label ? originPt.label.split(',')[0] : 'Base').slice(0, 22);
    $('lblDestShort').textContent = (currentBooking.address ? currentBooking.address.split(',')[0] : 'Obra').slice(0, 22);

    const phone = (trackingDoc && trackingDoc.operatorPhone) || currentBooking.ownerPhone || '809-555-0100';
    const cleanPhone = String(phone).replace(/[^0-9+]/g, '');
    $('btnCallOp').href = `tel:${cleanPhone}`;
    const waNum = GM ? GM.cleanWA(phone) : '18095550100';
    const waGreet = encodeURIComponent(`Hola, te escribo sobre el despacho de ${currentBooking.title} hacia ${currentBooking.address || 'la obra'} en Green Mile RD.`);
    $('btnWaOp').href = `https://wa.me/${waNum}?text=${waGreet}`;

    if (destPt) {
      $('btnOpenDestGmaps').href = `https://www.google.com/maps?q=${destPt.lat},${destPt.lng}`;
      $('btnNavGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${destPt.lat},${destPt.lng}&travelmode=driving`;
      $('btnNavWaze').href = `https://waze.com/ul?ll=${destPt.lat},${destPt.lng}&navigate=yes`;
    }

    const showDemoHelpers = Boolean(currentBooking.isDemo);
    $('demoBanner').style.display = showDemoHelpers ? 'block' : 'none';
    $('clientDemoCta').style.display = showDemoHelpers ? 'block' : 'none';
  }

  function renderTrackingState(doc) {
    trackingDoc = doc || {
      bookingId: String(currentBooking.id),
      status: 'scheduled',
      operatorName: currentBooking.owner || 'Operador Certificado',
      unitPlate: 'Lowboy / Unidad Asignada',
      remainingKm: plannedRoute ? plannedRoute.distanceKm : (currentBooking.distanceKm || 0),
      etaMin: plannedRoute ? plannedRoute.durationMin : (currentBooking.durationMin || 0),
      speedKmh: 0,
      progressPct: 0
    };

    const status = trackingDoc.status || 'scheduled';
    const meta = getStatusMeta(status);

    // Top pill
    const topDot = $('topLiveDot');
    topDot.className = `live-dot ${status}`;
    $('topStatusText').textContent = status === 'en_route' && Number.isFinite(Number(trackingDoc.etaMin))
      ? `En camino • ${Math.max(1, Math.round(trackingDoc.etaMin))} min`
      : meta.topLabel;

    // Hero ETA
    const eyebrow = $('etaEyebrow');
    eyebrow.textContent = trackingDoc.isSimulated ? `${meta.eyebrow} (SIMULACIÓN)` : meta.eyebrow;
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

    $('metricKm').textContent = status === 'arrived' || status === 'completed' || status === 'operating'
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
      else if (idx === meta.stepIndex) el.classList.add(status === 'completed' || status === 'operating' ? 'done' : 'active');
    });

    // Operator details
    const opName = trackingDoc.operatorName || currentBooking.owner || 'Operador Certificado';
    const plate = trackingDoc.unitPlate || 'Lowboy / Unidad Asignada';
    $('unitOperator').textContent = `👷 ${opName} • ${plate}`;

    if (document.activeElement !== $('inpOpName') && !$('inpOpName').value) {
      $('inpOpName').value = opName;
    }
    if (document.activeElement !== $('inpUnitPlate') && !$('inpUnitPlate').value) {
      $('inpUnitPlate').value = plate;
    }

    // Operator action visibility
    $('opMainActions').style.display = (status === 'scheduled' || status === 'completed' || status === 'operating') ? 'flex' : 'none';
    $('btnStartTrip').textContent = (status === 'completed' || status === 'operating')
      ? '🚚 Iniciar Nuevo Recorrido'
      : '🚚 Iniciar Recorrido hacia la Obra';
    $('opActiveActions').style.display = status === 'en_route' ? 'flex' : 'none';
    $('btnPauseGps').textContent = gpsActive ? '⏸ Pausar GPS' : '📡 Reanudar GPS';
    $('opArrivedActions').style.display = status === 'arrived' ? 'flex' : 'none';

    // Update map vehicle marker
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
          durationMs: trackingDoc.isSimulated ? 420 : 800,
          recordTrail: status === 'en_route'
        }
      );

      // Update remaining active route if doc includes a compact polyline or slice from plannedRoute
      if (status === 'en_route') {
        if (Array.isArray(trackingDoc.remainingCoords) && trackingDoc.remainingCoords.length >= 2) {
          liveMap.setActiveRoute(trackingDoc.remainingCoords, true);
        } else if (plannedRoute && Array.isArray(plannedRoute.geometry) && plannedRoute.geometry.length >= 2) {
          const sliced = sliceRemainingFromGeometry(plannedRoute.geometry, {
            lat: Number(trackingDoc.lat),
            lng: Number(trackingDoc.lng)
          });
          if (sliced.length >= 2) liveMap.setActiveRoute(sliced, plannedRoute.isRoadRoute);
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
    cloudSynced = isCloud;
    const pill = $('syncStatusPill');
    if (!pill) return;
    if (isCloud) {
      pill.textContent = '● En vivo • Nube Firestore';
      pill.classList.remove('local');
    } else {
      pill.textContent = note || '● Sincronización local activa';
      pill.classList.add('local');
    }
  }

  /**
   * Resamples a polyline into evenly spaced points (in km) for ultra-smooth simulation.
   */
  function resamplePolyline(coords, stepKm) {
    if (!Array.isArray(coords) || coords.length < 2) return [];
    const out = [coords[0]];
    let carry = 0;

    for (let i = 1; i < coords.length; i++) {
      const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
      const b = { lat: coords[i][0], lng: coords[i][1] };
      const segKm = GEO.haversineKm(a, b);
      if (segKm <= 0.0001) continue;

      let dist = stepKm - carry;
      while (dist <= segKm) {
        const t = dist / segKm;
        out.push([a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t]);
        dist += stepKm;
      }
      carry = segKm - (dist - stepKm);
    }

    const last = coords[coords.length - 1];
    const tail = out[out.length - 1];
    if (GEO.haversineKm({ lat: tail[0], lng: tail[1] }, { lat: last[0], lng: last[1] }) > 0.005) {
      out.push(last);
    }
    return out;
  }

  /**
   * Given a road polyline and a live point, returns the remaining polyline ahead toward the worksite.
   */
  function sliceRemainingFromGeometry(geometry, pos) {
    if (!Array.isArray(geometry) || geometry.length < 2 || !pos) return [];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < geometry.length; i++) {
      const d = GEO.haversineKm(pos, { lat: geometry[i][0], lng: geometry[i][1] });
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    // If vehicle is far off the planned corridor (> 0.6 km), let OSRM handle full reroute
    if (bestDist > 0.6) {
      return [[pos.lat, pos.lng], [destPt.lat, destPt.lng]];
    }
    return [[pos.lat, pos.lng], ...geometry.slice(Math.min(bestIdx + 1, geometry.length - 1))];
  }

  function computePolylineKm(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += GEO.haversineKm(
        { lat: coords[i - 1][0], lng: coords[i - 1][1] },
        { lat: coords[i][0], lng: coords[i][1] }
      );
    }
    return total;
  }

  async function persistTracking(patch) {
    if (!currentBooking) return;
    const opName = ($('inpOpName') && $('inpOpName').value.trim()) || (trackingDoc && trackingDoc.operatorName) || currentBooking.owner || 'Operador Certificado';
    const unitPlate = ($('inpUnitPlate') && $('inpUnitPlate').value.trim()) || (trackingDoc && trackingDoc.unitPlate) || 'Lowboy / Unidad Asignada';

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
    updateSyncBadge(Boolean(res.cloudSynced), res.error ? '● Modo local (despliega firestore.rules para nube)' : null);
    renderTrackingState(res.data || payload);
  }

  async function publishOperatorPosition(pos, extra = {}) {
    const totalKm = Math.max(0.5, Number(plannedRoute && plannedRoute.distanceKm) || Number(currentBooking.distanceKm) || 5);
    const straightRemKm = GEO.haversineKm(pos, destPt);

    let remainingKm = Number.isFinite(extra.remainingKm) ? extra.remainingKm : Math.max(0, straightRemKm * 1.22);
    let etaMin = Number.isFinite(extra.etaMin) ? extra.etaMin : null;
    let remainingCoords = extra.remainingCoords || null;

    // For real GPS updates, dynamically refresh OSRM road route every ~15s or >150m moved
    if (!extra.isSimulated && destPt) {
      const now = Date.now();
      const movedSinceReroute = lastReroutePos ? GEO.haversineKm(lastReroutePos, pos) : Infinity;
      if (now - lastRerouteMs > 15000 || movedSinceReroute > 0.15) {
        lastRerouteMs = now;
        lastReroutePos = { lat: pos.lat, lng: pos.lng };
        GEO.calculateRoute(pos, destPt).then((rt) => {
          if (rt && liveMap && trackingDoc && trackingDoc.status === 'en_route') {
            liveMap.setActiveRoute(rt.geometry, rt.isRoadRoute);
            persistTracking({
              status: 'en_route',
              lat: pos.lat,
              lng: pos.lng,
              remainingKm: rt.distanceKm,
              etaMin: rt.durationMin,
              progressPct: Math.round(Math.max(2, Math.min(99, (1 - rt.distanceKm / totalKm) * 100)))
            });
          }
        }).catch(() => {});
      }
    }

    const speedKmh = Number.isFinite(Number(pos.speedKmh)) && pos.speedKmh > 2
      ? Number(pos.speedKmh)
      : (extra.isSimulated ? 42 : 34);

    if (etaMin == null) {
      etaMin = Math.max(1, Math.round((remainingKm / Math.max(18, speedKmh)) * 60));
    }

    const progressPct = Math.round(Math.max(2, Math.min(99, (1 - remainingKm / totalKm) * 100)));

    // Keep Firestore doc light: store at most ~60 thinned route coordinates
    let compactCoords;
    if (Array.isArray(remainingCoords) && remainingCoords.length >= 2) {
      const stride = Math.max(1, Math.ceil(remainingCoords.length / 55));
      compactCoords = remainingCoords.filter((_, i) => i % stride === 0 || i === remainingCoords.length - 1);
    }

    await persistTracking({
      status: extra.status || 'en_route',
      lat: pos.lat,
      lng: pos.lng,
      heading: Number.isFinite(Number(pos.heading)) ? Math.round(Number(pos.heading)) : undefined,
      speedKmh: Math.round(speedKmh),
      accuracy: pos.accuracy || null,
      remainingKm: Math.round(remainingKm * 10) / 10,
      etaMin,
      progressPct,
      isSimulated: Boolean(extra.isSimulated),
      source: pos.source || (extra.isSimulated ? 'simulator' : 'web-gps'),
      remainingCoords: compactCoords
    });

    // Automatic geofence arrival alert for real GPS when within 150 meters
    if (!extra.isSimulated && straightRemKm <= 0.15 && !arrivalGeofenceAlerted) {
      arrivalGeofenceAlerted = true;
      toast('📍 Estás a menos de 150 m de la obra. Pulsa "Llegué a Obra" al llegar.');
    }
  }

  async function startRealGpsTrip() {
    stopSimulator(false);
    arrivalGeofenceAlerted = false;

    if (!NATIVE) {
      toast('Puente GPS no disponible en este navegador');
      return;
    }

    try {
      toast('📡 Activando señal GPS de alta precisión…');
      const started = await NATIVE.startLiveGps({
        title: `Green Mile RD — ${currentBooking.title}`,
        message: `En camino hacia ${currentBooking.address || 'la obra'}. Tracking activo en segundo plano.`,
        onPosition: (pos) => {
          const now = Date.now();
          const movedKm = lastWritePos ? GEO.haversineKm(lastWritePos, pos) : Infinity;
          // Throttle Firestore writes cleanly to every 2.5s or >= 15m moved
          if (now - lastWriteMs < 2500 && movedKm < 0.015) return;
          lastWriteMs = now;
          lastWritePos = { lat: pos.lat, lng: pos.lng };
          publishOperatorPosition(pos, { isSimulated: false });
        },
        onError: (errMsg) => {
          toast(errMsg);
        }
      });

      gpsActive = true;
      await persistTracking({
        status: 'en_route',
        startedAtMs: (trackingDoc && trackingDoc.startedAtMs) || Date.now(),
        isSimulated: false,
        lat: (trackingDoc && trackingDoc.lat) || originPt.lat,
        lng: (trackingDoc && trackingDoc.lng) || originPt.lng
      });

      if (started.mode === 'native-background') {
        toast('🛰️ Recorrido iniciado con GPS nativo en 2.º plano');
      } else if (started.wakeLock) {
        toast('🚚 Recorrido iniciado (GPS activo + pantalla encendida)');
      } else {
        toast('🚚 Recorrido iniciado — transmitiendo ubicación GPS');
      }
    } catch (err) {
      gpsActive = false;
      toast(err && err.message ? err.message : 'No se pudo iniciar el GPS');
    }
  }

  async function togglePauseRealGps() {
    if (gpsActive) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
      $('btnPauseGps').textContent = '📡 Reanudar GPS';
      toast('⏸ Transmisión GPS pausada');
    } else {
      await startRealGpsTrip();
    }
  }

  async function markArrived() {
    stopSimulator(false);
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
    toast('📍 Llegada a obra confirmada');
  }

  async function markCompleted() {
    stopSimulator(false);
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
    toast('✅ Entrega confirmada — equipo en operación');
  }

  async function resetTrip() {
    stopSimulator(false);
    if (gpsActive && NATIVE) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
    }
    simIndex = 0;
    arrivalGeofenceAlerted = false;
    if (liveMap) {
      liveMap.clearTrail();
      if (plannedRoute) liveMap.setActiveRoute(plannedRoute.geometry, plannedRoute.isRoadRoute);
    }
    await persistTracking({
      status: 'scheduled',
      lat: originPt.lat,
      lng: originPt.lng,
      heading: plannedRoute && plannedRoute.geometry.length > 1
        ? GEO.computeBearing(
            { lat: plannedRoute.geometry[0][0], lng: plannedRoute.geometry[0][1] },
            { lat: plannedRoute.geometry[1][0], lng: plannedRoute.geometry[1][1] }
          )
        : 0,
      remainingKm: plannedRoute ? plannedRoute.distanceKm : (currentBooking.distanceKm || 0),
      etaMin: plannedRoute ? plannedRoute.durationMin : (currentBooking.durationMin || 0),
      speedKmh: 0,
      progressPct: 0,
      isSimulated: false,
      remainingCoords: []
    });
    if (liveMap) liveMap.fitAll();
    toast('↺ Despacho reiniciado en patio');
  }

  function stopSimulator(showToast) {
    simRunning = false;
    if (simTimer) {
      clearTimeout(simTimer);
      simTimer = null;
    }
    const btn = $('btnToggleSim');
    if (btn) btn.textContent = '▶ Simular recorrido';
    if (showToast) toast('⏸ Simulación pausada');
  }

  function startSimulator() {
    if (!plannedRoute || !Array.isArray(plannedRoute.geometry) || plannedRoute.geometry.length < 2) {
      toast('Calculando ruta por carretera… intenta en 1 segundo');
      return;
    }

    if (gpsActive && NATIVE) {
      NATIVE.stopLiveGps();
      gpsActive = false;
    }

    if (simPoints.length < 2) {
      const totalKm = Math.max(0.5, plannedRoute.distanceKm || 5);
      // Target ~75–110 smooth steps across the real road route
      const stepKm = Math.max(0.04, Math.min(0.18, totalKm / 85));
      simPoints = resamplePolyline(plannedRoute.geometry, stepKm);
    }

    if (simIndex >= simPoints.length - 1) {
      simIndex = 0;
      if (liveMap) liveMap.clearTrail();
    }

    simRunning = true;
    $('btnToggleSim').textContent = '⏸ Pausar simulación';
    toast(`▶ Simulando recorrido en vivo (${simSpeedMultiplier}x)`);

    const stepTick = async () => {
      if (!simRunning) return;
      const curr = simPoints[simIndex];
      const next = simPoints[Math.min(simIndex + 1, simPoints.length - 1)];
      const heading = GEO.computeBearing(
        { lat: curr[0], lng: curr[1] },
        { lat: next[0], lng: next[1] }
      );
      const remainingSlice = simPoints.slice(simIndex);
      const remKm = computePolylineKm(remainingSlice);
      // Realistic heavy-truck speed in RD urban/highway traffic (32–48 km/h)
      const simSpeedKmh = Math.round(36 + Math.sin(simIndex * 0.35) * 8);
      const etaMin = Math.max(1, Math.round((remKm / Math.max(24, simSpeedKmh)) * 60));

      await publishOperatorPosition(
        {
          lat: curr[0],
          lng: curr[1],
          heading,
          speedKmh: simSpeedKmh,
          source: 'simulator'
        },
        {
          status: 'en_route',
          remainingKm: remKm,
          etaMin,
          remainingCoords: remainingSlice,
          isSimulated: true
        }
      );

      simIndex += 1;
      if (simIndex >= simPoints.length) {
        stopSimulator(false);
        await markArrived();
        return;
      }

      const delayMs = Math.max(220, Math.round(1300 / simSpeedMultiplier));
      simTimer = setTimeout(stepTick, delayMs);
    };

    stepTick();
  }

  async function shareClientLink(viaWhatsApp) {
    const clientUrl = buildRoleUrl('client');
    const msg = `🚚 *Tracking en Vivo — Green Mile RD*\n\nEquipo: *${currentBooking.title}*\nDestino: ${currentBooking.address || currentBooking.city}\n\nSigue el recorrido en el mapa en tiempo real:\n${clientUrl}`;

    if (viaWhatsApp) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      return;
    }

    if (GM) {
      await GM.copyToClipboard(clientUrl);
      toast('✓ Enlace de tracking copiado al portapapeles');
    }
  }

  async function loadSelectedBooking(bk) {
    if (unsubTracking) { unsubTracking(); unsubTracking = null; }
    if (unsubBooking) { unsubBooking(); unsubBooking = null; }
    stopSimulator(false);
    if (gpsActive && NATIVE) {
      await NATIVE.stopLiveGps();
      gpsActive = false;
    }
    simPoints = [];
    simIndex = 0;

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

    // Compute real OSRM road route from patio to worksite
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

    // Subscribe to live Firestore + BroadcastChannel updates
    if (FB) {
      unsubTracking = FB.subscribeTracking(
        bk.id,
        (doc, meta) => {
          if (meta && meta.source === 'cloud') updateSyncBadge(true);
          renderTrackingState(doc);
        },
        () => {
          updateSyncBadge(false, '● Modo local activo');
        }
      );

      if (!bk.isDemo) {
        unsubBooking = FB.subscribeBookingById(bk.id, (freshBk) => {
          if (freshBk) {
            currentBooking = Object.assign({}, currentBooking, freshBk);
            renderBookingMeta();
          }
        });
      }
    }
  }

  function populateBookingPicker(selectedId) {
    const wrap = $('bookingPickerWrap');
    const sel = $('bookingPicker');
    if (!wrap || !sel) return;

    const options = [
      ...allBookings.map((b) => ({
        id: String(b.id),
        label: `#GM-${String(b.id).slice(-6)} — ${b.title} (${b.renter || b.city})`
      })),
      { id: DEMO_BOOKING.id, label: `🧪 Demo en Vivo — ${DEMO_BOOKING.title} (Santo Domingo)` }
    ];

    if (options.length <= 1) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'flex';
    sel.innerHTML = options.map((o) =>
      `<option value="${o.id}"${String(o.id) === String(selectedId) ? ' selected' : ''}>${o.label}</option>`
    ).join('');
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

    $('btnCopyClientLink').addEventListener('click', () => shareClientLink(false));
    $('btnShareClientWa').addEventListener('click', () => shareClientLink(true));
    $('btnOpShareWa').addEventListener('click', () => shareClientLink(true));

    $('btnOpenClientTab').addEventListener('click', () => {
      window.open(buildRoleUrl('client'), '_blank', 'noopener');
    });

    $('btnSwitchToOpSim').addEventListener('click', () => {
      role = 'operator';
      updateRoleUI();
      startSimulator();
    });

    $('btnStartTrip').addEventListener('click', startRealGpsTrip);
    $('btnPauseGps').addEventListener('click', togglePauseRealGps);
    $('btnMarkArrived').addEventListener('click', markArrived);
    $('btnMarkCompleted').addEventListener('click', markCompleted);
    $('btnResetTrip').addEventListener('click', resetTrip);

    $('btnToggleSim').addEventListener('click', () => {
      if (simRunning) stopSimulator(true);
      else startSimulator();
    });

    document.querySelectorAll('#simSpeedPills .speed-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        simSpeedMultiplier = Number(btn.dataset.speed) || 3;
        document.querySelectorAll('#simSpeedPills .speed-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const saveOpMeta = () => {
      if (!currentBooking) return;
      persistTracking({
        operatorName: $('inpOpName').value.trim() || currentBooking.owner || 'Operador Certificado',
        unitPlate: $('inpUnitPlate').value.trim() || 'Lowboy / Unidad Asignada'
      });
    };
    $('inpOpName').addEventListener('change', saveOpMeta);
    $('inpUnitPlate').addEventListener('change', saveOpMeta);

    $('bookingPicker').addEventListener('change', (ev) => {
      const chosenId = ev.target.value;
      const found = chosenId === DEMO_BOOKING.id
        ? DEMO_BOOKING
        : allBookings.find((b) => String(b.id) === String(chosenId)) || DEMO_BOOKING;
      const url = new URL(window.location.href);
      url.searchParams.set('booking', String(found.id));
      if (found.isDemo) url.searchParams.set('demo', '1');
      else url.searchParams.delete('demo');
      window.history.replaceState({}, '', url.toString());
      loadSelectedBooking(found);
    });

    window.addEventListener('beforeunload', () => {
      stopSimulator(false);
    });

    // Keep relative timestamp fresh every 2s
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
    const isDemoParam = params.get('demo') === '1';
    const hashBooking = decodeBookingPayload(window.location.hash);

    let targetBooking = null;

    if (bookingParam && bookingParam !== DEMO_BOOKING.id) {
      targetBooking = allBookings.find((b) => String(b.id) === String(bookingParam)) || null;
      if (!targetBooking && FB && FB.isReady()) {
        targetBooking = await FB.getBookingById(bookingParam);
      }
      if (!targetBooking && hashBooking && String(hashBooking.id) === String(bookingParam)) {
        targetBooking = hashBooking;
      }
    } else if (!isDemoParam && allBookings.length > 0 && !bookingParam) {
      targetBooking = allBookings[0];
    }

    if (!targetBooking) {
      targetBooking = hashBooking || DEMO_BOOKING;
    }

    populateBookingPicker(targetBooking.id);
    await loadSelectedBooking(targetBooking);

    // Sync full bookings list from cloud so switcher always stays fresh
    if (FB && FB.isReady()) {
      FB.subscribeBookings((cloudBookings) => {
        if (Array.isArray(cloudBookings) && cloudBookings.length) {
          allBookings = cloudBookings;
          populateBookingPicker(currentBooking ? currentBooking.id : targetBooking.id);
        }
      });
    }
  }

  init();
})();
