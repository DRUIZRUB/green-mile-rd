/* Green Mile RD — Georreferenciación, Mapa Interactivo (Leaflet/OSM) y Cálculo de Traslado por Distancia */
(function (global) {
  'use strict';

  // Coordenadas base de las 16 ciudades/provincias principales de República Dominicana
  const DR_CITY_COORDS = {
    'Santo Domingo': { lat: 18.4861, lng: -69.9312, label: 'Santo Domingo, RD' },
    'Santiago': { lat: 19.4517, lng: -70.6970, label: 'Santiago de los Caballeros, RD' },
    'Punta Cana': { lat: 18.5601, lng: -68.3725, label: 'Punta Cana / Bávaro, RD' },
    'La Romana': { lat: 18.4273, lng: -68.9728, label: 'La Romana, RD' },
    'San Cristóbal': { lat: 18.4167, lng: -70.1000, label: 'San Cristóbal, RD' },
    'Puerto Plata': { lat: 19.7934, lng: -70.6884, label: 'Puerto Plata, RD' },
    'La Vega': { lat: 19.2220, lng: -70.5296, label: 'La Vega, RD' },
    'Baní': { lat: 18.2796, lng: -70.3319, label: 'Baní, Peravia, RD' },
    'San Pedro de Macorís': { lat: 18.4539, lng: -69.3086, label: 'San Pedro de Macorís, RD' },
    'Higüey': { lat: 18.6150, lng: -68.7079, label: 'Higüey, La Altagracia, RD' },
    'San Francisco de Macorís': { lat: 19.3010, lng: -70.2526, label: 'San Francisco de Macorís, RD' },
    'Bonao': { lat: 18.9369, lng: -70.4092, label: 'Bonao, Monseñor Nouel, RD' },
    'Barahona': { lat: 18.2085, lng: -71.1008, label: 'Barahona, RD' },
    'Samaná': { lat: 19.2056, lng: -69.3369, label: 'Samaná, RD' },
    'Azua': { lat: 18.4532, lng: -70.7349, label: 'Azua, RD' },
    'Moca': { lat: 19.3935, lng: -70.5260, label: 'Moca, Espaillat, RD' }
  };

  // Tarifa por kilómetro adicional (en RD$) según categoría y peso del equipo
  const RATE_PER_KM_BY_CATEGORY = {
    'Izaje y Grúas': 165,
    'Movimiento de Tierra': 155,
    'Compactación': 125,
    'Transporte Pesado': 120,
    'Energía e Iluminación': 85,
    'Concreto y Ligero': 85
  };

  const LOCAL_INCLUDED_KM = 10;

  let leafletPromise = null;

  function loadLeaflet() {
    if (global.L) return Promise.resolve(global.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      const cssId = 'gm-leaflet-css';
      if (!document.getElementById(cssId)) {
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const tryLoadScript = (src, fallback) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => (global.L ? resolve(global.L) : reject(new Error('Leaflet failed')));
        s.onerror = () => {
          if (fallback) tryLoadScript(fallback, null);
          else reject(new Error('No se pudo cargar el mapa'));
        };
        document.head.appendChild(s);
      };

      tryLoadScript(
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
      );
    });

    return leafletPromise;
  }

  function getCityCoords(city) {
    if (!city) return DR_CITY_COORDS['Santo Domingo'];
    if (DR_CITY_COORDS[city]) return DR_CITY_COORDS[city];
    const norm = String(city).toLowerCase();
    for (const k of Object.keys(DR_CITY_COORDS)) {
      if (norm.includes(k.toLowerCase()) || k.toLowerCase().includes(norm)) {
        return DR_CITY_COORDS[k];
      }
    }
    return DR_CITY_COORDS['Santo Domingo'];
  }

  function getEquipmentOrigin(item) {
    if (item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))) {
      return {
        lat: Number(item.lat),
        lng: Number(item.lng),
        label: item.baseAddress || `${item.city}, RD`
      };
    }
    return getCityCoords(item && item.city);
  }

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function calculateRoute(origin, dest) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4500) : null;
    try {
      const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const route = data && data.routes && data.routes[0];
        if (route && Number.isFinite(route.distance)) {
          const distanceKm = Math.max(0.5, Math.round((route.distance / 1000) * 10) / 10);
          const durationMin = Math.max(5, Math.round((route.duration || 0) / 60));
          const geometry = (route.geometry && route.geometry.coordinates)
            ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
            : [[origin.lat, origin.lng], [dest.lat, dest.lng]];
          return { distanceKm, durationMin, geometry, isRoadRoute: true };
        }
      }
    } catch (_) {
      if (timer) clearTimeout(timer);
    }

    // Fallback instantáneo con factor vial realista en RD (1.25x distancia lineal)
    const straight = haversineKm(origin, dest);
    const distanceKm = Math.max(0.5, Math.round(straight * 1.25 * 10) / 10);
    const durationMin = Math.max(5, Math.round((distanceKm / 48) * 60));
    return {
      distanceKm,
      durationMin,
      geometry: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
      isRoadRoute: false
    };
  }

  function calculateTransportQuote(item, distanceKm) {
    const baseFee = Number(item && item.transportCost) || 0;
    const perKm = RATE_PER_KM_BY_CATEGORY[item && item.category] || 110;

    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return {
        cost: baseFee,
        baseFee,
        extraKm: 0,
        perKm,
        isCalculatedByDistance: false
      };
    }

    // Si el equipo ofrece traslado incluido (baseFee === 0), cubre los primeros 15 km locales;
    // más allá cobra tarifa por km adicional.
    if (baseFee === 0) {
      const freeKm = 15;
      const extraKm = Math.max(0, distanceKm - freeKm);
      const raw = extraKm * perKm;
      const cost = raw > 0 ? Math.round(raw / 100) * 100 : 0;
      return {
        cost,
        baseFee: 0,
        extraKm: Math.round(extraKm * 10) / 10,
        perKm,
        isCalculatedByDistance: true
      };
    }

    // Con tarifa base de movilización (cubre hasta 10 km locales) + tarifa por km adicional
    const extraKm = Math.max(0, distanceKm - LOCAL_INCLUDED_KM);
    const raw = baseFee + (extraKm * perKm);
    const cost = Math.round(raw / 100) * 100;
    return {
      cost,
      baseFee,
      extraKm: Math.round(extraKm * 10) / 10,
      perKm,
      isCalculatedByDistance: true
    };
  }

  async function searchAddress(query) {
    const q = String(query || '').trim();
    if (q.length < 3) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=do&addressdetails=1&limit=5&accept-language=es&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        label: formatNominatimLabel(r),
        fullLabel: r.display_name || '',
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon)
      })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    } catch (_) {
      return [];
    }
  }

  async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&addressdetails=1&accept-language=es&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const data = await res.json();
      return formatNominatimLabel(data) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (_) {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  function formatNominatimLabel(item) {
    if (!item) return '';
    const a = item.address || {};
    const parts = [
      a.road || a.pedestrian || a.residential || a.hamlet || a.neighbourhood || a.suburb,
      a.suburb && a.suburb !== a.road ? a.suburb : null,
      a.city || a.town || a.village || a.municipality,
      a.state || a.province
    ].filter(Boolean);
    const dedup = [];
    parts.forEach((p) => {
      if (!dedup.some((x) => x.toLowerCase() === String(p).toLowerCase())) dedup.push(p);
    });
    return dedup.length ? dedup.join(', ') : (item.display_name || '');
  }

  function makePinIcon(L, letter, color) {
    return L.divIcon({
      className: 'gm-map-pin-wrap',
      html: `<div class="gm-map-pin" style="background:${color};"><span>${letter}</span></div>`,
      iconSize: [30, 38],
      iconAnchor: [15, 38],
      popupAnchor: [0, -34]
    });
  }

  /**
   * Crea un mapa interactivo con Origen (Base del equipo) + Destino arrastrable (Obra) + Ruta y Distancia.
   */
  async function createWorksitePicker(opts) {
    const L = await loadLeaflet();
    const container = document.getElementById(opts.mapId);
    if (!container) return null;

    const origin = getEquipmentOrigin(opts.item);
    const map = L.map(container, {
      center: [origin.lat, origin.lng],
      zoom: 12,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const originIcon = makePinIcon(L, 'B', '#0D223A');
    const destIcon = makePinIcon(L, 'O', '#B85A27');

    const originMarker = L.marker([origin.lat, origin.lng], { icon: originIcon })
      .addTo(map)
      .bindPopup(`<strong>Base del Equipo</strong><br>${origin.label}`);

    let destMarker = null;
    let routeLine = null;

    const state = {
      origin,
      dest: null,
      route: null,
      quote: calculateTransportQuote(opts.item, 0)
    };

    async function setWorksite(lat, lng, options = {}) {
      const point = { lat: Number(lat), lng: Number(lng) };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;

      state.dest = point;
      if (!destMarker) {
        destMarker = L.marker([point.lat, point.lng], { icon: destIcon, draggable: true })
          .addTo(map)
          .bindPopup('<strong>Punto de la Obra</strong><br>Arrastra para ajustar');
        destMarker.on('dragend', () => {
          const pos = destMarker.getLatLng();
          setWorksite(pos.lat, pos.lng, { shouldReverse: true });
        });
      } else {
        destMarker.setLatLng([point.lat, point.lng]);
      }

      if (options.addressLabel && opts.onAddressResolved) {
        opts.onAddressResolved(options.addressLabel);
      } else if (options.shouldReverse !== false && opts.onAddressResolved) {
        reverseGeocode(point.lat, point.lng).then((addr) => {
          if (addr) opts.onAddressResolved(addr);
        });
      }

      if (opts.onRoutingStart) opts.onRoutingStart(point);

      const route = await calculateRoute(origin, point);
      state.route = route;
      state.quote = calculateTransportQuote(opts.item, route.distanceKm);

      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(route.geometry, {
        color: '#B85A27',
        weight: 4,
        opacity: 0.88,
        dashArray: route.isRoadRoute ? null : '8 6'
      }).addTo(map);

      const bounds = L.latLngBounds([
        [origin.lat, origin.lng],
        [point.lat, point.lng]
      ]);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });

      if (opts.onChange) opts.onChange(state);
    }

    map.on('click', (ev) => {
      setWorksite(ev.latlng.lat, ev.latlng.lng, { shouldReverse: true });
    });

    setTimeout(() => map.invalidateSize(), 180);

    return {
      map,
      originMarker,
      getState: () => state,
      setWorksite,
      recenterOrigin: () => map.setView([origin.lat, origin.lng], 12),
      invalidate: () => map.invalidateSize()
    };
  }

  /**
   * Mapa simple de un solo punto (para que el dueño fije la ubicación exacta de su patio al publicar equipo).
   */
  async function createPatioPicker(opts) {
    const L = await loadLeaflet();
    const container = document.getElementById(opts.mapId);
    if (!container) return null;

    const initial = getCityCoords(opts.initialCity || 'Santo Domingo');
    const map = L.map(container, {
      center: [initial.lat, initial.lng],
      zoom: 12,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const pinIcon = makePinIcon(L, 'B', '#0D223A');
    let marker = L.marker([initial.lat, initial.lng], { icon: pinIcon, draggable: true }).addTo(map);
    let current = { lat: initial.lat, lng: initial.lng };

    function setPoint(lat, lng, center) {
      current = { lat: Number(lat), lng: Number(lng) };
      marker.setLatLng([current.lat, current.lng]);
      if (center) map.setView([current.lat, current.lng], 13);
      if (opts.onChange) opts.onChange(current);
    }

    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setPoint(p.lat, p.lng, false);
    });

    map.on('click', (ev) => {
      setPoint(ev.latlng.lat, ev.latlng.lng, false);
    });

    setTimeout(() => map.invalidateSize(), 200);

    return {
      map,
      getPoint: () => current,
      setPoint,
      setCity: (city) => {
        const c = getCityCoords(city);
        setPoint(c.lat, c.lng, true);
      },
      invalidate: () => map.invalidateSize()
    };
  }

  function computeBearing(a, b) {
    if (!a || !b) return 0;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function makeDestinationIcon(L) {
    return L.divIcon({
      className: 'gm-track-dest-wrap',
      html: `
        <div class="gm-track-dest-pulse"></div>
        <div class="gm-track-dest-pin">
          <span>O</span>
        </div>
      `,
      iconSize: [38, 46],
      iconAnchor: [19, 42],
      popupAnchor: [0, -38]
    });
  }

  function makeVehicleIcon(L, headingDeg, status) {
    const rot = Number.isFinite(Number(headingDeg)) ? Math.round(Number(headingDeg)) : 0;
    const activeCls = status === 'en_route' ? ' is-live' : (status === 'arrived' || status === 'operating' ? ' is-arrived' : '');
    return L.divIcon({
      className: 'gm-track-vehicle-wrap',
      html: `
        <div class="gm-track-vehicle${activeCls}">
          <div class="gm-track-vehicle-ring"></div>
          <div class="gm-track-vehicle-rot" style="transform: rotate(${rot}deg);">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M14 2.5L23.5 23.5L14 18.8L4.5 23.5L14 2.5Z" fill="#FFFFFF" stroke="#0D223A" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      popupAnchor: [0, -24]
    });
  }

  /**
   * Mapa en vivo tipo Uber para tracking del operador/equipo desde el patio base hasta la obra.
   */
  async function createLiveTrackingMap(opts) {
    const L = await loadLeaflet();
    const container = document.getElementById(opts.mapId);
    if (!container) return null;

    const origin = opts.origin || DR_CITY_COORDS['Santo Domingo'];
    const dest = opts.dest || origin;

    const map = L.map(container, {
      center: [(origin.lat + dest.lat) / 2, (origin.lng + dest.lng) / 2],
      zoom: 13,
      zoomControl: false
    });

    const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });

    let currentLayerMode = 'streets';
    streetsLayer.addTo(map);

    const originMarker = L.marker([origin.lat, origin.lng], {
      icon: makePinIcon(L, 'B', '#0D223A')
    })
      .addTo(map)
      .bindPopup(`<strong>Patio / Base</strong><br>${origin.label || 'Origen'}`);

    const destMarker = L.marker([dest.lat, dest.lng], {
      icon: makeDestinationIcon(L)
    })
      .addTo(map)
      .bindPopup(`<strong>Obra (Destino)</strong><br>${dest.label || 'Punto de entrega'}`);

    let plannedLine = null;
    let remainingCasing = null;
    let remainingLine = null;
    let trailLine = null;
    let accuracyCircle = null;
    let vehicleMarker = null;

    let currentPos = null;
    let currentHeading = 0;
    let currentStatus = 'scheduled';
    let animFrame = null;
    let trailPoints = [];
    let followVehicle = true;

    map.on('dragstart', () => {
      if (followVehicle) {
        followVehicle = false;
        if (typeof opts.onFollowChange === 'function') opts.onFollowChange(false);
      }
    });

    function setTileLayer(mode) {
      const next = mode === 'satellite' ? 'satellite' : 'streets';
      if (next === currentLayerMode) return currentLayerMode;
      if (next === 'satellite') {
        map.removeLayer(streetsLayer);
        satelliteLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        streetsLayer.addTo(map);
      }
      currentLayerMode = next;
      return currentLayerMode;
    }

    function setPlannedRoute(geometry, isRoadRoute) {
      if (plannedLine) map.removeLayer(plannedLine);
      if (!Array.isArray(geometry) || geometry.length < 2) return;
      plannedLine = L.polyline(geometry, {
        color: '#64748B',
        weight: 4,
        opacity: 0.45,
        dashArray: isRoadRoute ? '8 8' : '6 8'
      }).addTo(map);
    }

    function setActiveRoute(geometry, isRoadRoute) {
      if (remainingCasing) map.removeLayer(remainingCasing);
      if (remainingLine) map.removeLayer(remainingLine);
      if (!Array.isArray(geometry) || geometry.length < 2) return;
      remainingCasing = L.polyline(geometry, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.92,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      remainingLine = L.polyline(geometry, {
        color: '#B85A27',
        weight: 5,
        opacity: 0.96,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: isRoadRoute === false ? '8 8' : null
      }).addTo(map);
      if (trailLine) trailLine.bringToFront();
    }

    function pushTrailPoint(lat, lng) {
      const last = trailPoints[trailPoints.length - 1];
      if (!last || haversineKm({ lat: last[0], lng: last[1] }, { lat, lng }) >= 0.015) {
        trailPoints.push([lat, lng]);
        if (trailPoints.length > 400) trailPoints = trailPoints.slice(-400);
        if (trailLine) {
          trailLine.setLatLngs(trailPoints);
        } else if (trailPoints.length >= 2) {
          trailLine = L.polyline(trailPoints, {
            color: '#059669',
            weight: 4.5,
            opacity: 0.88,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
        }
      }
    }

    function clearTrail() {
      trailPoints = [];
      if (trailLine) {
        map.removeLayer(trailLine);
        trailLine = null;
      }
    }

    function applyVehicleRotation(deg, status) {
      if (!vehicleMarker) return;
      const el = vehicleMarker.getElement();
      if (!el) return;
      const rotEl = el.querySelector('.gm-track-vehicle-rot');
      if (rotEl) rotEl.style.transform = `rotate(${Math.round(deg)}deg)`;
      const wrapEl = el.querySelector('.gm-track-vehicle');
      if (wrapEl) {
        wrapEl.classList.toggle('is-live', status === 'en_route');
        wrapEl.classList.toggle('is-arrived', status === 'arrived' || status === 'operating' || status === 'completed');
      }
    }

    function updateVehicle(pos, options = {}) {
      if (!pos || !Number.isFinite(Number(pos.lat)) || !Number.isFinite(Number(pos.lng))) return;
      const target = { lat: Number(pos.lat), lng: Number(pos.lng) };
      const status = options.status || currentStatus;
      currentStatus = status;

      let nextHeading = currentHeading;
      if (Number.isFinite(Number(pos.heading))) {
        nextHeading = Number(pos.heading);
      } else if (currentPos && haversineKm(currentPos, target) > 0.008) {
        nextHeading = computeBearing(currentPos, target);
      }

      if (!vehicleMarker) {
        currentPos = target;
        currentHeading = nextHeading;
        vehicleMarker = L.marker([target.lat, target.lng], {
          icon: makeVehicleIcon(L, currentHeading, status),
          zIndexOffset: 900
        }).addTo(map);
        if (options.popupHtml) vehicleMarker.bindPopup(options.popupHtml);
      } else {
        const startPos = Object.assign({}, currentPos);
        const startHeading = currentHeading;
        // Shortest angular interpolation
        let deltaHeading = ((nextHeading - startHeading + 540) % 360) - 180;
        const duration = options.animate === false ? 0 : Math.min(1200, Math.max(260, Number(options.durationMs) || 680));

        if (animFrame) cancelAnimationFrame(animFrame);
        if (duration === 0) {
          currentPos = target;
          currentHeading = (startHeading + deltaHeading + 360) % 360;
          vehicleMarker.setLatLng([target.lat, target.lng]);
          applyVehicleRotation(currentHeading, status);
        } else {
          const t0 = performance.now();
          const step = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            // Smooth ease-out cubic
            const ease = 1 - Math.pow(1 - p, 3);
            const lat = startPos.lat + (target.lat - startPos.lat) * ease;
            const lng = startPos.lng + (target.lng - startPos.lng) * ease;
            const hdg = (startHeading + deltaHeading * ease + 360) % 360;
            currentPos = { lat, lng };
            currentHeading = hdg;
            vehicleMarker.setLatLng([lat, lng]);
            applyVehicleRotation(hdg, status);
            if (p < 1) {
              animFrame = requestAnimationFrame(step);
            } else {
              animFrame = null;
            }
          };
          animFrame = requestAnimationFrame(step);
        }
      }

      if (options.recordTrail !== false && status === 'en_route') {
        pushTrailPoint(target.lat, target.lng);
      }

      if (Number.isFinite(Number(pos.accuracy)) && pos.accuracy > 5 && pos.accuracy < 600) {
        if (!accuracyCircle) {
          accuracyCircle = L.circle([target.lat, target.lng], {
            radius: pos.accuracy,
            color: '#0D223A',
            weight: 1,
            fillColor: '#3B82F6',
            fillOpacity: 0.12
          }).addTo(map);
        } else {
          accuracyCircle.setLatLng([target.lat, target.lng]);
          accuracyCircle.setRadius(pos.accuracy);
        }
      } else if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }

      if (followVehicle) {
        panToVisible(target, Math.max(map.getZoom(), 14));
      }
    }

    function panToVisible(latlng, zoom) {
      if (!latlng) return;
      const targetZoom = zoom || Math.max(map.getZoom(), 14);
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 920;
      const pt = map.project([latlng.lat, latlng.lng], targetZoom);
      // Shift camera center so the vehicle stays centered in the open map window
      const offsetX = isDesktop ? -210 : 0;
      const offsetY = isDesktop ? 0 : Math.round((typeof window !== 'undefined' ? window.innerHeight : 760) * 0.22);
      const shifted = map.unproject(L.point(pt.x + offsetX, pt.y + offsetY), targetZoom);
      map.setView(shifted, targetZoom, { animate: true, duration: 0.55 });
    }

    function fitAll(paddingBottom) {
      const pts = [
        [origin.lat, origin.lng],
        [dest.lat, dest.lng]
      ];
      if (currentPos) pts.push([currentPos.lat, currentPos.lng]);
      const bounds = L.latLngBounds(pts);
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 920;
      const mobPadBottom = paddingBottom || Math.round((typeof window !== 'undefined' ? window.innerHeight : 760) * 0.52);
      map.fitBounds(bounds, {
        paddingTopLeft: isDesktop ? [456, 86] : [36, 72],
        paddingBottomRight: isDesktop ? [60, 48] : [56, mobPadBottom],
        maxZoom: 15
      });
    }

    function focusVehicle() {
      followVehicle = true;
      if (typeof opts.onFollowChange === 'function') opts.onFollowChange(true);
      if (currentPos) {
        panToVisible(currentPos, Math.max(map.getZoom(), 15));
      } else {
        fitAll();
      }
    }

    function setFollowMode(enabled) {
      followVehicle = Boolean(enabled);
      if (typeof opts.onFollowChange === 'function') opts.onFollowChange(followVehicle);
      if (followVehicle && currentPos) {
        panToVisible(currentPos, Math.max(map.getZoom(), 14));
      }
    }

    setTimeout(() => {
      map.invalidateSize();
      fitAll();
    }, 180);

    return {
      map,
      setTileLayer,
      getTileLayer: () => currentLayerMode,
      setPlannedRoute,
      setActiveRoute,
      updateVehicle,
      clearTrail,
      fitAll,
      focusVehicle,
      focusDestination: () => map.setView([dest.lat, dest.lng], 16, { animate: true }),
      setFollowMode,
      isFollowing: () => followVehicle,
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      invalidate: () => map.invalidateSize(),
      destroy: () => {
        if (animFrame) cancelAnimationFrame(animFrame);
        map.remove();
      }
    };
  }

  global.GM_GEO = {
    DR_CITY_COORDS,
    getCityCoords,
    getEquipmentOrigin,
    haversineKm,
    computeBearing,
    calculateRoute,
    calculateTransportQuote,
    searchAddress,
    reverseGeocode,
    createWorksitePicker,
    createPatioPicker,
    createLiveTrackingMap
  };
})(window);
