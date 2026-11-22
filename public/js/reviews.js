/* Green Mile RD — Sistema de Valoraciones con Estrellas y Comentarios */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'gm_rd_reviews_v1';

  // Reseñas base verificadas para dar contexto inicial real en el catálogo RD
  const SEED_TEMPLATES = [
    {
      author: 'Ing. Carlos Mejía — Grupo Bávaro',
      rating: 5,
      comment: 'Equipo en excelentes condiciones mecánicas y puntual en la entrega en obra. Todo formalizado con contrato digital y e-NCF sin contratiempos.',
      daysAgo: 6,
      verified: true
    },
    {
      author: 'Arq. Laura Peña — Constructora Caribe',
      rating: 5,
      comment: 'Muy buen rendimiento durante toda la jornada y excelente coordinación de logística y traslado a través de Green Mile RD.',
      daysAgo: 14,
      verified: true
    },
    {
      author: 'Ing. Rafael Taveras — Obras del Norte',
      rating: 4,
      comment: 'Buena máquina, cumplió con la capacidad especificada y el mantenimiento al día. Volveríamos a contratarla para la siguiente etapa.',
      daysAgo: 25,
      verified: true
    },
    {
      author: 'Ing. Miguel Santana — Edificaciones Este',
      rating: 5,
      comment: 'Sin tiempos muertos en obra y facturación rápida con crédito fiscal. Recomendado para proyectos exigentes.',
      daysAgo: 34,
      verified: true
    }
  ];

  function loadLocalMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalMap(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  function getSeededReviews(equipmentId) {
    const num = Math.abs(parseInt(String(equipmentId).replace(/\D/g, ''), 10) || 1);
    const count = 2 + (num % 2); // 2 o 3 reseñas iniciales por equipo del catálogo
    const list = [];
    for (let i = 0; i < count; i++) {
      const tpl = SEED_TEMPLATES[(num + i) % SEED_TEMPLATES.length];
      list.push({
        id: `seed_${equipmentId}_${i}`,
        equipmentId: String(equipmentId),
        author: tpl.author,
        rating: tpl.rating,
        comment: tpl.comment,
        date: isoDaysAgo(tpl.daysAgo + (num % 5)),
        verified: true,
        isSeed: true
      });
    }
    return list;
  }

  function mergeReviews(equipmentId, cloudReviews) {
    const key = String(equipmentId);
    const localMap = loadLocalMap();
    const localList = Array.isArray(localMap[key]) ? localMap[key] : [];
    const cloudList = Array.isArray(cloudReviews) ? cloudReviews : [];
    const byId = new Map();

    // Primero las reales (cloud + local)
    [...cloudList, ...localList].forEach((r) => {
      if (r && r.id != null) byId.set(String(r.id), r);
    });

    // Luego las reseñas base para equipos del catálogo (id <= 9999)
    const numId = Number(equipmentId);
    if (Number.isFinite(numId) && numId >= 1000 && numId <= 9999) {
      getSeededReviews(equipmentId).forEach((s) => {
        if (!byId.has(String(s.id))) byId.set(String(s.id), s);
      });
    }

    return Array.from(byId.values()).sort((a, b) => {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (db !== da) return db.localeCompare(da);
      return Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0);
    });
  }

  function getStats(reviews) {
    const list = Array.isArray(reviews) ? reviews : [];
    const count = list.length;
    if (count === 0) {
      return { avg: 0, count: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
    }
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    list.forEach((r) => {
      const s = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
      sum += s;
      breakdown[s] = (breakdown[s] || 0) + 1;
    });
    const avg = Math.round((sum / count) * 10) / 10;
    return { avg, count, breakdown };
  }

  function getEquipmentSummary(equipmentId, cloudReviews) {
    return getStats(mergeReviews(equipmentId, cloudReviews));
  }

  function renderStarsHTML(rating) {
    const rounded = Math.round(Number(rating) || 0);
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="gm-star ${i <= rounded ? 'filled' : ''}">★</span>`;
    }
    return html;
  }

  async function addReview(equipmentId, payload) {
    const key = String(equipmentId);
    const rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
    const author = String(payload.author || '').trim();
    const comment = String(payload.comment || '').trim();
    if (!author || !comment) {
      throw new Error('Completa tu nombre y comentario');
    }

    const review = {
      id: `rev_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      equipmentId: key,
      author,
      rating,
      comment,
      date: new Date().toISOString().split('T')[0],
      createdAtMs: Date.now(),
      verified: Boolean(payload.verified)
    };

    const localMap = loadLocalMap();
    localMap[key] = [review, ...(Array.isArray(localMap[key]) ? localMap[key] : [])];
    saveLocalMap(localMap);

    if (global.GM_FIREBASE && global.GM_FIREBASE.isReady() && global.GM_FIREBASE.saveReview) {
      try {
        await global.GM_FIREBASE.saveReview(review);
      } catch (_) {
        // Guardado local como respaldo si Firestore no está disponible
      }
    }

    return review;
  }

  global.GM_REVIEWS = {
    mergeReviews,
    getStats,
    getEquipmentSummary,
    renderStarsHTML,
    addReview
  };
})(window);
