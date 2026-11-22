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

  // Zonas, sectores, corredores industriales y municipios frecuentes en obras de RD (respuesta instantánea 0ms)
  const DR_POPULAR_PLACES = [
    { name: 'Piantini', area: 'Distrito Nacional, Santo Domingo', lat: 18.4728, lng: -69.9396, tags: 'sector torre poligono central churchill lincoln' },
    { name: 'Ensanche Naco', area: 'Distrito Nacional, Santo Domingo', lat: 18.4756, lng: -69.9277, tags: 'sector poligono central tiradentes' },
    { name: 'Ensanche Serrallés', area: 'Distrito Nacional, Santo Domingo', lat: 18.4774, lng: -69.9354, tags: 'sector poligono central agora' },
    { name: 'Evaristo Morales', area: 'Distrito Nacional, Santo Domingo', lat: 18.4694, lng: -69.9465, tags: 'sector churchill 27 de febrero' },
    { name: 'Bella Vista', area: 'Distrito Nacional, Santo Domingo', lat: 18.4526, lng: -69.9457, tags: 'sector sarasota mirador sur' },
    { name: 'Ensanche Paraíso', area: 'Distrito Nacional, Santo Domingo', lat: 18.4765, lng: -69.9428, tags: 'sector churchill kennedy' },
    { name: 'Mirador Sur', area: 'Distrito Nacional, Santo Domingo', lat: 18.4488, lng: -69.9565, tags: 'sector anacaona cayetano germosen' },
    { name: 'Los Cacicazgos', area: 'Distrito Nacional, Santo Domingo', lat: 18.4452, lng: -69.9612, tags: 'sector anacaona enriquito' },
    { name: 'Arroyo Hondo', area: 'Distrito Nacional, Santo Domingo', lat: 18.5008, lng: -69.9522, tags: 'sector cuesta hermosa camino chiquito' },
    { name: 'Gazcue', area: 'Distrito Nacional, Santo Domingo', lat: 18.4690, lng: -69.9035, tags: 'sector bolivar independencia' },
    { name: 'Zona Colonial', area: 'Distrito Nacional, Santo Domingo', lat: 18.4730, lng: -69.8842, tags: 'sector ciudad colonial conde' },
    { name: 'Los Prados', area: 'Distrito Nacional, Santo Domingo', lat: 18.4795, lng: -69.9554, tags: 'sector nunez de caceres' },
    { name: 'Santo Domingo Este', area: 'Provincia Santo Domingo', lat: 18.4885, lng: -69.8570, tags: 'sector ensanche ozama alma rosa san isidro autopista las americas' },
    { name: 'Autopista de San Isidro', area: 'Santo Domingo Este, RD', lat: 18.5020, lng: -69.8050, tags: 'sector zona oriental coral mall' },
    { name: 'Santo Domingo Oeste / Herrera', area: 'Provincia Santo Domingo', lat: 18.4855, lng: -69.9850, tags: 'sector zona industrial herrera manoguayabo' },
    { name: 'Santo Domingo Norte / Villa Mella', area: 'Provincia Santo Domingo', lat: 18.5450, lng: -69.9080, tags: 'sector jacobomajluta sabana perdida' },
    { name: 'Boca Chica / Caucedo', area: 'Santo Domingo Este, RD', lat: 18.4508, lng: -69.6064, tags: 'puerto caucedo zona franca las americas' },
    { name: 'Bajos de Haina / Zona Industrial', area: 'San Cristóbal, RD', lat: 18.4150, lng: -70.0320, tags: 'puerto haina industria refinería' },
    { name: 'Bávaro', area: 'Punta Cana, La Altagracia', lat: 18.6815, lng: -68.4534, tags: 'sector friusa cortecito cocotal hoteles' },
    { name: 'Punta Cana Village', area: 'Punta Cana, La Altagracia', lat: 18.5540, lng: -68.3740, tags: 'aeropuerto puj boulevard turistico' },
    { name: 'Cap Cana', area: 'Punta Cana, La Altagracia', lat: 18.4995, lng: -68.3990, tags: 'sector marina juanillo resort' },
    { name: 'Verón', area: 'Punta Cana, La Altagracia', lat: 18.6104, lng: -68.4519, tags: 'sector cruce veron domingo maiz' },
    { name: 'Cabeza de Toro', area: 'Punta Cana, La Altagracia', lat: 18.6400, lng: -68.3660, tags: 'sector hoteles downtown' },
    { name: 'Uvero Alto', area: 'La Altagracia, RD', lat: 18.8035, lng: -68.5875, tags: 'sector hoteles macao' },
    { name: 'Miches / Playa Esmeralda', area: 'El Seibo, RD', lat: 18.9838, lng: -69.0472, tags: 'sector desarrollo turistico hoteles' },
    { name: 'Higüey Centro', area: 'La Altagracia, RD', lat: 18.6150, lng: -68.7079, tags: 'sector basilica autovia del coral' },
    { name: 'Santiago Centro', area: 'Santiago de los Caballeros, RD', lat: 19.4517, lng: -70.6970, tags: 'sector monumento calle del sol' },
    { name: 'Los Jardines Metropolitanos', area: 'Santiago de los Caballeros, RD', lat: 19.4614, lng: -70.6911, tags: 'sector residencial santiago' },
    { name: 'Cerro Alto / Gurabo', area: 'Santiago de los Caballeros, RD', lat: 19.4765, lng: -70.6745, tags: 'sector residencial santiago' },
    { name: 'Villa Olga / La Esmeralda', area: 'Santiago de los Caballeros, RD', lat: 19.4552, lng: -70.6795, tags: 'sector residencial santiago' },
    { name: 'Zona Franca Industrial Santiago', area: 'Santiago de los Caballeros, RD', lat: 19.4648, lng: -70.7220, tags: 'sector industria parque industrial' },
    { name: 'Tamboril / Licey al Medio', area: 'Santiago, RD', lat: 19.4852, lng: -70.6115, tags: 'sector carretera licey aeropuerto cibao' },
    { name: 'La Romana Centro', area: 'La Romana, RD', lat: 18.4273, lng: -68.9728, tags: 'sector zona franca romana' },
    { name: 'Casa de Campo', area: 'La Romana, RD', lat: 18.4162, lng: -68.9125, tags: 'sector marina villas altos de chavon' },
    { name: 'Bayahíbe / Dominicus', area: 'La Altagracia / La Romana', lat: 18.3712, lng: -68.8396, tags: 'sector hoteles playa' },
    { name: 'San Pedro de Macorís', area: 'San Pedro de Macorís, RD', lat: 18.4539, lng: -69.3086, tags: 'sector puerto zona franca' },
    { name: 'Juan Dolio / Guayacanes', area: 'San Pedro de Macorís, RD', lat: 18.4240, lng: -69.4180, tags: 'sector torres playa metro country club' },
    { name: 'San Cristóbal Centro', area: 'San Cristóbal, RD', lat: 18.4167, lng: -70.1000, tags: 'sector madre vieja autopista 6 de noviembre' },
    { name: 'Puerto Plata / Playa Dorada', area: 'Puerto Plata, RD', lat: 19.7765, lng: -70.6422, tags: 'sector malecon puerto taino bay amber cove' },
    { name: 'Sosúa / Cabarete', area: 'Puerto Plata, RD', lat: 19.7522, lng: -70.5199, tags: 'sector hoteles proyectos costa norte' },
    { name: 'La Vega Centro', area: 'La Vega, RD', lat: 19.2220, lng: -70.5296, tags: 'sector autopista duarte' },
    { name: 'Jarabacoa', area: 'La Vega, RD', lat: 19.1168, lng: -70.6359, tags: 'sector montaña villas proyecto' },
    { name: 'Constanza', area: 'La Vega, RD', lat: 18.9092, lng: -70.7450, tags: 'sector valle agricola' },
    { name: 'Azua de Compostela', area: 'Azua, RD', lat: 18.4532, lng: -70.7349, tags: 'sector carretera sanchez circunvalacion azua' },
    { name: 'Playa Monte Río / Puerto Viejo', area: 'Azua, RD', lat: 18.4046, lng: -70.7155, tags: 'sector costa sur puerto azua' },
    { name: 'Baní Centro', area: 'Peravia, RD', lat: 18.2796, lng: -70.3319, tags: 'sector circunvalacion bani puntarena' },
    { name: 'Punta Arena / Salinas', area: 'Baní, Peravia, RD', lat: 18.2110, lng: -70.5260, tags: 'sector proyecto turistico' },
    { name: 'Bonao', area: 'Monseñor Nouel, RD', lat: 18.9369, lng: -70.4092, tags: 'sector autopista duarte falcondo' },
    { name: 'Moca', area: 'Espaillat, RD', lat: 19.3935, lng: -70.5260, tags: 'sector cibao' },
    { name: 'San Francisco de Macorís', area: 'Duarte, RD', lat: 19.3010, lng: -70.2526, tags: 'sector urbanizacion nordeste' },
    { name: 'Santa Bárbara de Samaná', area: 'Samaná, RD', lat: 19.2056, lng: -69.3369, tags: 'sector malecon puerto' },
    { name: 'Las Terrenas', area: 'Samaná, RD', lat: 19.3110, lng: -69.5428, tags: 'sector playa bonita coson portillo villas' },
    { name: 'Barahona Centro', area: 'Barahona, RD', lat: 18.2085, lng: -71.1008, tags: 'sector malecon sur' },
    { name: 'Pedernales / Cabo Rojo', area: 'Pedernales, RD', lat: 17.9165, lng: -71.6532, tags: 'sector puerto desarrollo turistico' },
    { name: 'San Juan de la Maguana', area: 'San Juan, RD', lat: 18.8059, lng: -71.2299, tags: 'sector sur' },
    { name: 'Monte Cristi', area: 'Monte Cristi, RD', lat: 19.8483, lng: -71.6460, tags: 'sector puerto manzanillo' },
    { name: 'Cotuí', area: 'Sánchez Ramírez, RD', lat: 19.0527, lng: -70.1494, tags: 'sector mineria cibao' }
  ];

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Detecta si el usuario pegó coordenadas (ej. "18.4861, -69.9312") o un enlace de Google Maps.
   */
  function parseCoordinatesOrGoogleMapsUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    // Enlaces Google Maps: @lat,lng | ?q=lat,lng | ll=lat,lng | !3dLAT!4dLNG
    const patterns = [
      /@(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
      /[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
      /!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,
      /^\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 16.5 && lat <= 21.0 && lng >= -73.0 && lng <= -67.5) {
          return {
            primary: `Coordenadas GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            secondary: 'Ubicación exacta detectada en República Dominicana',
            label: `Obra GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            lat,
            lng,
            source: 'coords'
          };
        }
      }
    }
    return null;
  }

  function searchLocalPlaces(query, origin) {
    const normQ = normalizeText(query);
    const tokens = normQ.split(/[\s,]+/).filter(Boolean);

    const scored = [];
    for (const p of DR_POPULAR_PLACES) {
      const hay = normalizeText(`${p.name} ${p.area} ${p.tags || ''}`);
      let score = 0;

      if (!normQ) {
        // Sin texto aún: sugerir primero lugares más cercanos a la base del equipo
        const dist = origin ? haversineKm(origin, p) : 50;
        score = Math.max(1, 200 - dist);
      } else {
        const normName = normalizeText(p.name);
        const normArea = normalizeText(p.area);
        if (normName.startsWith(normQ)) score += 120;
        else if (normName.includes(normQ)) score += 90;
        else if (normArea.includes(normQ)) score += 65;
        else if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) score += 55;
        else if (tokens.length > 0 && tokens.some((t) => t.length >= 3 && hay.includes(t))) score += 25;

        if (score > 0 && origin) {
          const dist = haversineKm(origin, p);
          if (dist < 25) score += 20;
          else if (dist < 60) score += 10;
        }
      }

      if (score > 0) {
        const approxKm = origin ? Math.max(1, Math.round(haversineKm(origin, p) * 1.25)) : null;
        scored.push({
          score,
          primary: p.name,
          secondary: p.area,
          label: `${p.name}, ${p.area}`,
          lat: p.lat,
          lng: p.lng,
          approxKm,
          source: 'rd-index'
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6);
  }

  function formatPhotonResult(feat, origin) {
    if (!feat || !feat.geometry || !Array.isArray(feat.geometry.coordinates)) return null;
    const [lng, lat] = feat.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Asegurar que está dentro de República Dominicana
    if (lat < 17.35 || lat > 20.15 || lng < -72.15 || lng > -68.15) return null;

    const p = feat.properties || {};
    const primary = p.name || p.street || p.district || p.city || p.county || p.state || '';
    if (!primary) return null;

    const secParts = [
      p.street && p.street !== primary ? p.street : null,
      p.district && p.district !== primary ? p.district : null,
      p.city && p.city !== primary ? p.city : null,
      p.county && p.county !== primary && p.county !== p.city ? p.county : null,
      p.state && p.state !== primary && p.state !== p.city ? p.state : null
    ].filter(Boolean);

    const dedup = [];
    secParts.forEach((s) => {
      if (!dedup.some((x) => normalizeText(x) === normalizeText(s))) dedup.push(s);
    });
    const secondary = dedup.length ? `${dedup.join(', ')}, RD` : 'República Dominicana';
    const label = dedup.length ? `${primary}, ${dedup.slice(0, 2).join(', ')}` : `${primary}, RD`;
    const approxKm = origin ? Math.max(1, Math.round(haversineKm(origin, { lat, lng }) * 1.25)) : null;

    return {
      primary,
      secondary,
      label,
      lat,
      lng,
      approxKm,
      source: 'photon'
    };
  }

  async function searchPhoton(query, origin, signal) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const bias = origin ? `&lat=${origin.lat.toFixed(4)}&lon=${origin.lng.toFixed(4)}` : '&lat=18.4861&lon=-69.9312';
    // Bounding box estricto de República Dominicana (minLon,minLat,maxLon,maxLat)
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=-72.05,17.45,-68.25,20.05&limit=6${bias}`;
    try {
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      const features = Array.isArray(data && data.features) ? data.features : [];
      return features.map((f) => formatPhotonResult(f, origin)).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async function searchAddress(query, options = {}) {
    const q = String(query || '').trim();
    const origin = options.origin || null;

    const directCoord = parseCoordinatesOrGoogleMapsUrl(q);
    if (directCoord) {
      if (origin) directCoord.approxKm = Math.max(1, Math.round(haversineKm(origin, directCoord) * 1.25));
      return [directCoord];
    }

    if (q.length < 2) return searchLocalPlaces('', origin);

    const localHits = searchLocalPlaces(q, origin);
    const remotePhoton = await searchPhoton(q, origin, options.signal);

    let remoteHits = remotePhoton;
    if (!remoteHits.length && q.length >= 3) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=do&addressdetails=1&limit=5&accept-language=es&q=${encodeURIComponent(q)}`;
      try {
        const res = await fetch(url, { signal: options.signal, headers: { Accept: 'application/json' } });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows)) {
            remoteHits = rows.map((r) => {
              const lat = parseFloat(r.lat);
              const lng = parseFloat(r.lon);
              const full = formatNominatimLabel(r);
              const split = full.split(',').map((s) => s.trim()).filter(Boolean);
              const primary = split[0] || full;
              const secondary = split.slice(1).join(', ') || 'República Dominicana';
              const approxKm = origin && Number.isFinite(lat) && Number.isFinite(lng)
                ? Math.max(1, Math.round(haversineKm(origin, { lat, lng }) * 1.25))
                : null;
              return { primary, secondary, label: full, lat, lng, approxKm, source: 'nominatim' };
            }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
          }
        }
      } catch (_) {}
    }

    // Combinar y deduplicar resultados (priorizando calles/lugares reales de Photon/Nominatim + sectores RD)
    const merged = [];
    const seen = [];
    const pushUnique = (item) => {
      if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
      const normP = normalizeText(item.primary);
      const isDup = seen.some((s) => {
        const close = haversineKm(s, item) < 0.8;
        const sameName = normalizeText(s.primary) === normP;
        return sameName && close;
      });
      if (!isDup) {
        seen.push(item);
        merged.push(item);
      }
    };

    remoteHits.forEach(pushUnique);
    localHits.forEach(pushUnique);
    return merged.slice(0, 7);
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
   * Crea un mapa interactivo con Origen (Base del equipo) + Destino arrastrable (Obra) + Ruta, Distancia y vista Satélite.
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

    const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });

    let layerMode = 'streets';
    streetsLayer.addTo(map);

    function setTileLayer(mode) {
      const next = mode === 'satellite' ? 'satellite' : 'streets';
      if (next === layerMode) return layerMode;
      if (next === 'satellite') {
        map.removeLayer(streetsLayer);
        satelliteLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        streetsLayer.addTo(map);
      }
      layerMode = next;
      return layerMode;
    }

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
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });

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
      setTileLayer,
      getTileLayer: () => layerMode,
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

  /* =========================================================
     TIPOS DE LUGAR DE OBRA Y PERMISOS REQUERIDOS DINÁMICOS (RD)
     ========================================================= */
  const WORKSITE_PLACE_TYPES = [
    {
      id: 'via_publica',
      icon: '🛣️',
      label: 'Vía Pública / Calle',
      shortDesc: 'Avenida, acera, zanja o cierre vial',
      guidance: 'Al operar en calle o vía pública en RD, el contratista debe gestionar la ocupación de vía y coordinación de tránsito antes de movilizar el equipo.',
      requiredPermits: [
        { id: 'ayuntamiento_via', label: 'Permiso de Ayuntamiento (Uso de Vía Pública)', entity: 'Alcaldía / ADN / Ayuntamiento local' },
        { id: 'intrant_digesett', label: 'Permiso INTRANT / Coordinación DIGESETT', entity: 'Cierre o desvío vial y paso de carga pesada' }
      ],
      optionalPermits: [
        { id: 'medio_ambiente', label: 'Permiso / No Objeción de Medio Ambiente', entity: 'MIMARENA (excavación o bote de escombros)' },
        { id: 'salud_ruido', label: 'Control de Ruido / Horario Nocturno', entity: 'Ayuntamiento / Salud Pública' }
      ]
    },
    {
      id: 'residencial',
      icon: '🏘️',
      label: 'Residencial / Condominio',
      shortDesc: 'Proyecto cerrado, torre o urbanización',
      guidance: 'Los residenciales y torres en RD exigen carta de acceso previa, registro de operador/placa y respeto estricto al horario permitido.',
      requiredPermits: [
        { id: 'carta_condominio', label: 'Carta de Acceso de Administración / Condominio', entity: 'Seguridad / Junta de Vecinos o Constructora' },
        { id: 'horario_ruido', label: 'Autorización de Horario de Obra y Ruido', entity: 'Reglamento interno / Ayuntamiento' }
      ],
      optionalPermits: [
        { id: 'intrant_urbano', label: 'Permiso INTRANT de Carga Pesada Urbana', entity: 'Paso de camión o lowboy en zona urbana' },
        { id: 'ayuntamiento_via', label: 'Permiso de Ayuntamiento (si ocupa acera/calle)', entity: 'Alcaldía local' }
      ]
    },
    {
      id: 'comercial',
      icon: '🏬',
      label: 'Plaza / Edificio Comercial',
      shortDesc: 'Centro comercial, local o torre corporativa',
      guidance: 'Plazas y edificios en operación suelen exigir maniobras fuera de horario comercial, póliza RC y autorización escrita de administración.',
      requiredPermits: [
        { id: 'acceso_plaza', label: 'Autorización de Administración y Seguridad de Plaza', entity: 'Gerencia del centro comercial / edificio' },
        { id: 'horario_nocturno', label: 'Permiso de Maniobra, Horario y Control de Ruido', entity: 'Administración / Salud Pública' }
      ],
      optionalPermits: [
        { id: 'ayuntamiento_via', label: 'Permiso de Ayuntamiento / Ocupación Perimetral', entity: 'Si la grúa o bomba ocupa vía externa' },
        { id: 'intrant_digesett', label: 'Permiso INTRANT / DIGESETT', entity: 'Si requiere estacionar lowboy en avenida' }
      ]
    },
    {
      id: 'zona_franca_hotel',
      icon: '🏭',
      label: 'Zona Franca / Hotel / Puerto',
      shortDesc: 'Parque industrial, resort, marina o terminal',
      guidance: 'Zonas francas, hoteles y puertos requieren pase previo de contratista, inducción HSE y validación documental del operador y equipo.',
      requiredPermits: [
        { id: 'pase_seguridad', label: 'Pase de Contratista e Inducción de Seguridad (HSE)', entity: 'Administración de Zona Franca / Hotel / Puerto' },
        { id: 'acreditacion_rc', label: 'Validación de Seguro RC y Documentación del Equipo', entity: 'Green Mile RD suministra póliza y ficha' }
      ],
      optionalPermits: [
        { id: 'medio_ambiente', label: 'Licencia / Cumplimiento Ambiental (MIMARENA)', entity: 'Zonas costeras, marinas o parques industriales' },
        { id: 'salud_ruido', label: 'Control de Ruido en Área Turística', entity: 'Regulación hotelera / Salud Pública' }
      ]
    },
    {
      id: 'obra_publica',
      icon: '🏛️',
      label: 'Obra Pública / Estado',
      shortDesc: 'MOPC, INAPA, MINERD, Hospital o Alcaldía',
      guidance: 'En proyectos estatales la entidad contratante emite la orden de inicio y coordina permisos sectoriales y seguridad vial en el frente de obra.',
      requiredPermits: [
        { id: 'orden_entidad', label: 'Orden de Inicio / Autorización de Entidad Contratante', entity: 'MOPC, INAPA, MINERD, Ayuntamiento u organismo' },
        { id: 'intrant_digesett', label: 'Señalización Vial / Coordinación INTRANT-DIGESETT', entity: 'Seguridad vial en frente de obra pública' }
      ],
      optionalPermits: [
        { id: 'medio_ambiente', label: 'Permiso Ambiental (MIMARENA)', entity: 'Obras viales, movimiento de tierra o demolición' }
      ]
    },
    {
      id: 'solar_privado',
      icon: '🏗️',
      label: 'Solar / Terreno Privado',
      shortDesc: 'Lote cercado o finca sin ocupar vía pública',
      guidance: 'Terreno privado con acceso directo sin cierre de calles. Solo verifica entrada despejada y terreno firme para descarga del lowboy.',
      requiredPermits: [
        { id: 'acceso_privado', label: 'Acceso Privado Habilitado y Espacio para Descarga', entity: 'Propietario / Maestro de obra en sitio' }
      ],
      optionalPermits: [
        { id: 'medio_ambiente', label: 'Permiso de Medio Ambiente (Excavación / Bote)', entity: 'Si implica desmonte, corte o bote de tierra' },
        { id: 'ayuntamiento_obra', label: 'Licencia de Construcción / Uso de Suelo', entity: 'MIVED / Ayuntamiento local' }
      ]
    }
  ];

  function getPlaceTypeMeta(placeId) {
    return WORKSITE_PLACE_TYPES.find((p) => p.id === placeId) || null;
  }

  /**
   * Devuelve los permisos requeridos y opcionales según el Tipo de Lugar de la obra
   * y la categoría de maquinaria (promoviendo automáticamente permisos clave por tipo de equipo).
   */
  function getPermitsForPlaceType(placeId, equipmentCategory) {
    const meta = getPlaceTypeMeta(placeId);
    if (!meta) return { place: null, required: [], optional: [], guidance: '' };

    const cat = String(equipmentCategory || '');
    const required = meta.requiredPermits.map((p) => ({ ...p, required: true, reason: 'Lugar de obra' }));
    let optional = meta.optionalPermits.map((p) => ({ ...p, required: false }));

    const promoteOrAdd = (id, fallbackObj, reason) => {
      if (required.some((p) => p.id === id)) return;
      const optIdx = optional.findIndex((p) => p.id === id);
      if (optIdx >= 0) {
        const [item] = optional.splice(optIdx, 1);
        required.push({ ...item, required: true, reason });
      } else if (fallbackObj) {
        required.push({ ...fallbackObj, required: true, reason });
      }
    };

    // Reglas dinámicas según la categoría del equipo + lugar seleccionado
    if (cat.includes('Izaje') && (placeId === 'residencial' || placeId === 'comercial')) {
      promoteOrAdd(
        'ayuntamiento_via',
        { id: 'ayuntamiento_via', label: 'Permiso de Maniobra / Ayuntamiento', entity: 'Alcaldía / Seguridad perimetral de izaje' },
        'Equipo de Izaje'
      );
    }
    if (cat.includes('Movimiento') && (placeId === 'via_publica' || placeId === 'obra_publica')) {
      promoteOrAdd(
        'medio_ambiente',
        { id: 'medio_ambiente', label: 'Permiso / No Objeción de Medio Ambiente (MIMARENA)', entity: 'Excavación, corte o bote de material' },
        'Movimiento de Tierra'
      );
    }
    if (cat.includes('Energía') && (placeId === 'zona_franca_hotel' || placeId === 'comercial' || placeId === 'residencial')) {
      promoteOrAdd(
        'salud_ruido',
        { id: 'salud_ruido', label: 'Control de Ruido y Emisiones (Salud Pública / Sitio)', entity: 'Límites de decibeles para plantas eléctricas' },
        'Planta Eléctrica'
      );
    }
    if (cat.includes('Transporte') && (placeId === 'residencial' || placeId === 'comercial')) {
      promoteOrAdd(
        'intrant_urbano',
        { id: 'intrant_urbano', label: 'Permiso INTRANT de Circulación Pesada Urbana', entity: 'Horarios y rutas de camiones pesados en RD' },
        'Transporte Pesado'
      );
    }

    return {
      place: meta,
      required,
      optional,
      guidance: meta.guidance
    };
  }

  global.GM_GEO = {
    DR_CITY_COORDS,
    WORKSITE_PLACE_TYPES,
    getPlaceTypeMeta,
    getPermitsForPlaceType,
    getCityCoords,
    getEquipmentOrigin,
    haversineKm,
    computeBearing,
    calculateRoute,
    calculateTransportQuote,
    searchLocalPlaces,
    parseCoordinatesOrGoogleMapsUrl,
    searchAddress,
    reverseGeocode,
    createWorksitePicker,
    createPatioPicker,
    createLiveTrackingMap
  };
})(window);
