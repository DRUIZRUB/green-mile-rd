/* Green Mile Construction RD — Página Individual de Anuncio */
(function () {
  const GM = window.GM_CATALOG;
  const CFG = window.GM_PAGE || { basePrefix: './', equipmentId: null };
  const BASE = CFG.basePrefix || './';

  let state = GM.loadState();
  let currentItem = null;
  let sigSigned = false;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = 'none'; }, 2800);
  }

  function openSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function resolveItem() {
    const params = new URLSearchParams(window.location.search);
    const rawId = CFG.equipmentId != null ? String(CFG.equipmentId) : params.get('id');

    if (rawId) {
      const fromLocal = state.equipment.find(e => String(e.id) === rawId);
      if (fromLocal) return fromLocal;
      const fromDefault = GM.DEFAULT_EQUIPMENT.find(e => String(e.id) === rawId);
      if (fromDefault) return fromDefault;
    }

    const fromHash = GM.decodeSharedEquipment(window.location.hash);
    if (fromHash) return fromHash;

    return null;
  }

  function itemImagesList(item) {
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images
        .slice(0, 5)
        .map(src => GM.resolveAsset(src, BASE) || GM.defaultCover(item.category));
    }
    const single = GM.resolveAsset(item.img, BASE) || GM.defaultCover(item.category);
    return [single];
  }

  function itemImageSrc(item) {
    return itemImagesList(item)[0];
  }

  function selectPhoto(idx) {
    if (!currentItem) return;
    const photos = itemImagesList(currentItem);
    const chosen = photos[idx];
    if (!chosen) return;
    const heroImg = document.getElementById('mainHeroImg');
    if (heroImg) heroImg.src = chosen;
    const counter = document.getElementById('heroPhotoCounter');
    if (counter) counter.textContent = `📷 ${idx + 1}/${photos.length}`;
    document.querySelectorAll('#heroThumbs .media-thumb').forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });
  }

  function getShareText(item, url) {
    return `Mira este equipo disponible en Green Mile RD:\n🚜 ${item.title}\n📍 ${item.city} • ${GM.fmtRD(item.priceDay)}/día${item.operator ? ' (Con Operador)' : ''}\n🔗 ${url}`;
  }

  async function copyShareLink() {
    if (!currentItem) return;
    const url = GM.getShareUrl(currentItem, BASE);
    try {
      await GM.copyToClipboard(url);
      toast('¡Enlace del anuncio copiado!');
      const btn = document.getElementById('copyLinkBtn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copiado';
        setTimeout(() => { btn.innerHTML = orig; }, 1800);
      }
    } catch (_) {
      toast('No se pudo copiar; selecciona el enlace');
    }
  }

  async function nativeShare() {
    if (!currentItem) return;
    const url = GM.getShareUrl(currentItem, BASE);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${currentItem.title} en ${currentItem.city} — Green Mile RD`,
          text: `${currentItem.title} (${GM.fmtRD(currentItem.priceDay)}/día) en ${currentItem.city}. Alquiler directo con NCF en Green Mile RD.`,
          url
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    copyShareLink();
  }

  function toggleFavorite() {
    if (!currentItem) return;
    const id = currentItem.id;
    if (state.savedIds.includes(id)) {
      state.savedIds = state.savedIds.filter(x => x !== id);
      toast('Eliminado de guardados');
    } else {
      state.savedIds.push(id);
      toast('Guardado en favoritos');
    }
    GM.saveState(state);
    updateFavoriteButtons();
  }

  function updateFavoriteButtons() {
    if (!currentItem) return;
    const isSaved = state.savedIds.includes(currentItem.id);
    const btn = document.getElementById('headerFavBtn');
    if (btn) {
      btn.classList.toggle('saved', isSaved);
      btn.innerHTML = isSaved ? '♥ Guardado' : '♡ Guardar';
    }
  }

  function updateProUI() {
    const proBtn = document.getElementById('bookingProBtn');
    if (proBtn) {
      proBtn.classList.toggle('active', state.isPro);
      proBtn.textContent = state.isPro ? '⭐ Pro (-10%)' : '⭐ Plan Pro';
    }
    calcReceipt();
  }

  function activatePro() {
    state.isPro = true;
    GM.saveState(state);
    closeSheet('proSheet');
    updateProUI();
    toast('Plan Pro activado (-10% aplicado)');
  }

  let geoPicker = null;
  const geoState = {
    lat: null,
    lng: null,
    distanceKm: null,
    durationMin: null,
    calculatedCost: null,
    isRoadRoute: false
  };

  function getActiveTransportCost() {
    const it = currentItem;
    const transEl = document.getElementById('qTrans');
    if (!it || !transEl || transEl.value !== 'yes') return 0;
    if (geoState.calculatedCost != null) return geoState.calculatedCost;
    return Number(it.transportCost) || 0;
  }

  function currentBreakdown() {
    const it = currentItem;
    const mode = document.getElementById('qMode').value;
    const qty = Math.max(1, Number(document.getElementById('qQty').value) || 1);
    const trans = getActiveTransportCost();
    const ncf = document.getElementById('qNcf').checked;

    let unit = it.priceDay, label = 'días';
    if (mode === 'hour') { unit = it.priceHour; label = 'horas'; }
    if (mode === 'week') { unit = it.priceWeek; label = 'semanas'; }

    const base = unit * qty;
    const disc = state.isPro ? Math.round(base * 0.10) : 0;
    const net = base - disc + trans;
    const itbis = ncf ? Math.round(net * 0.18) : 0;
    const total = net + itbis;
    return { qty, unit, label, base, disc, trans, net, itbis, total, ncf, distanceKm: geoState.distanceKm };
  }

  function calcReceipt() {
    const box = document.getElementById('qReceipt');
    if (!currentItem || !box) return;
    const b = currentBreakdown();
    const transLabel = b.distanceKm
      ? `Traslado Lowboy (${b.distanceKm} km)`
      : 'Traslado Lowboy (base)';
    box.innerHTML = `
      <div class="r-row"><span>${GM.fmtRD(b.unit)} × ${b.qty} ${b.label}</span><span>${GM.fmtRD(b.base)}</span></div>
      ${b.disc > 0 ? `<div class="r-row" style="color:var(--success); font-weight:700;"><span>Descuento Pro (-10%)</span><span>- ${GM.fmtRD(b.disc)}</span></div>` : ''}
      ${b.trans > 0 ? `<div class="r-row"><span>${transLabel}</span><span>${GM.fmtRD(b.trans)}</span></div>` : ''}
      ${b.ncf ? `<div class="r-row"><span>ITBIS 18% (e-NCF)</span><span>${GM.fmtRD(b.itbis)}</span></div>` : ''}
      <div class="r-total"><span>Total a Pagar</span><span>${GM.fmtRD(b.total)}</span></div>
    `;
    updateGeoUI();
  }

  /* =========================================================
     CALENDARIO DE DISPONIBILIDAD ESTILO AIRBNB
     ========================================================= */
  const calState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    start: '',
    end: ''
  };

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtShortDate(iso) {
    if (!iso) return '—';
    const d = parseISO(iso);
    return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
  }

  function getBookedDateSet() {
    const set = new Set();
    if (!currentItem) return set;
    const eqBookings = (state.bookings || []).filter(b =>
      String(b.equipmentId) === String(currentItem.id) || b.title === currentItem.title
    );
    eqBookings.forEach(b => {
      if (!b.startDate) return;
      const s = parseISO(b.startDate);
      const days = b.endDate
        ? Math.max(1, Math.round((parseISO(b.endDate) - s) / 86400000) + 1)
        : Math.max(1, Number(b.qty) || 1);
      for (let i = 0; i < days; i++) {
        const cur = new Date(s);
        cur.setDate(s.getDate() + i);
        set.add(toISO(cur));
      }
    });
    if (currentItem.busy && set.size === 0) {
      const today = new Date();
      for (let i = 0; i < 3; i++) {
        const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        set.add(toISO(cur));
      }
    }
    return set;
  }

  function hasBookedInRange(startISO, endISO, bookedSet) {
    const s = parseISO(startISO);
    const e = parseISO(endISO);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (bookedSet.has(toISO(d))) return true;
    }
    return false;
  }

  function renderCalendar() {
    const grid = document.getElementById('calDays');
    const titleEl = document.getElementById('calTitle');
    const sumEl = document.getElementById('calSummaryText');
    if (!grid || !titleEl) return;

    const bookedSet = getBookedDateSet();
    const todayISO = toISO(new Date());
    const first = new Date(calState.viewYear, calState.viewMonth, 1);
    const lastDay = new Date(calState.viewYear, calState.viewMonth + 1, 0).getDate();
    const startWeekday = first.getDay();

    titleEl.textContent = first.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

    let html = '';
    for (let i = 0; i < startWeekday; i++) {
      html += `<div></div>`;
    }
    for (let day = 1; day <= lastDay; day++) {
      const iso = toISO(new Date(calState.viewYear, calState.viewMonth, day));
      const isPast = iso < todayISO;
      const isBooked = bookedSet.has(iso);
      const isToday = iso === todayISO;
      const isStart = calState.start && iso === calState.start;
      const isEnd = calState.end && iso === calState.end;
      const inRange = calState.start && calState.end && iso > calState.start && iso < calState.end;

      const cls = ['cal-day'];
      if (isToday) cls.push('today');
      if (isPast) cls.push('past');
      else if (isBooked) cls.push('booked');
      if (inRange) cls.push('in-range');
      if (isStart) cls.push('start');
      if (isEnd) cls.push('end');

      const disabled = isPast || isBooked;
      const tip = isBooked ? 'Ocupado / En obra' : (isPast ? 'Fecha pasada' : `Seleccionar ${iso}`);
      html += `<button type="button" class="${cls.join(' ')}" title="${tip}" ${disabled ? 'disabled' : `onclick="window.GM_DETAIL.calPickDate('${iso}')"`}>${day}</button>`;
    }
    grid.innerHTML = html;

    if (sumEl) {
      if (calState.start && calState.end) {
        const diff = Math.round((parseISO(calState.end) - parseISO(calState.start)) / 86400000) + 1;
        sumEl.innerHTML = `<strong>${fmtShortDate(calState.start)} → ${fmtShortDate(calState.end)}</strong> · ${diff} ${diff === 1 ? 'día' : 'días'}`;
      } else if (calState.start) {
        sumEl.innerHTML = `Inicio: <strong>${fmtShortDate(calState.start)}</strong> · Elige fecha fin`;
      } else {
        sumEl.textContent = 'Selecciona fecha de inicio y fin en obra';
      }
    }
  }

  function calPickDate(iso) {
    const bookedSet = getBookedDateSet();
    if (bookedSet.has(iso)) return;
    const modeEl = document.getElementById('qMode');
    const mode = modeEl ? modeEl.value : 'day';

    if (mode === 'hour') {
      calState.start = iso;
      calState.end = iso;
    } else if (!calState.start || (calState.start && calState.end && calState.start !== calState.end) || iso < calState.start) {
      calState.start = iso;
      calState.end = iso;
    } else {
      if (hasBookedInRange(calState.start, iso, bookedSet)) {
        toast('Ese rango incluye días ya reservados en obra');
        return;
      }
      calState.end = iso;
    }

    const startInput = document.getElementById('qStart');
    const qtyInput = document.getElementById('qQty');
    if (startInput) startInput.value = calState.start;

    if (mode === 'day' && qtyInput && calState.start && calState.end) {
      const days = Math.round((parseISO(calState.end) - parseISO(calState.start)) / 86400000) + 1;
      qtyInput.value = days;
    } else if (mode === 'week' && qtyInput && calState.start && calState.end) {
      const days = Math.round((parseISO(calState.end) - parseISO(calState.start)) / 86400000) + 1;
      qtyInput.value = Math.max(1, Math.ceil(days / 6));
    }

    renderCalendar();
    calcReceipt();
  }

  function calPrevMonth() {
    calState.viewMonth--;
    if (calState.viewMonth < 0) { calState.viewMonth = 11; calState.viewYear--; }
    renderCalendar();
  }

  function calNextMonth() {
    calState.viewMonth++;
    if (calState.viewMonth > 11) { calState.viewMonth = 0; calState.viewYear++; }
    renderCalendar();
  }

  function calClear() {
    calState.start = '';
    calState.end = '';
    renderCalendar();
  }

  function setupSig() {
    const c = document.getElementById('sigCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#0D223A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    let draw = false;

    const pt = e => {
      const r = c.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (cx - r.left) * (c.width / r.width), y: (cy - r.top) * (c.height / r.height) };
    };
    const down = e => { draw = true; sigSigned = true; const p = pt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = e => { if (!draw) return; const p = pt(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const up = () => { draw = false; };

    c.addEventListener('mousedown', down);
    c.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', up);
  }

  function clearSig() {
    const c = document.getElementById('sigCanvas');
    if (c) {
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      sigSigned = false;
    }
  }

  let dgiiController = null;
  let geoSuggestions = [];
  let cloudReviews = [];
  let selectedReviewStars = 5;

  const STAR_LABELS = {
    1: '1 ★ — Deficiente',
    2: '2 ★ — Regular',
    3: '3 ★ — Bueno',
    4: '4 ★ — Muy bueno',
    5: '5 ★ — Excelente'
  };

  function updateGeoUI() {
    const card = document.getElementById('qGeoStatus');
    const transOpt = document.getElementById('qTransYesOpt');
    const transSel = document.getElementById('qTrans');
    if (transOpt && currentItem) {
      if (geoState.distanceKm != null && geoState.calculatedCost != null) {
        transOpt.textContent = `Con traslado a obra · ${geoState.distanceKm} km (${GM.fmtRD(geoState.calculatedCost)})`;
      } else {
        transOpt.textContent = currentItem.transportCost > 0
          ? `Con traslado a obra (desde ${GM.fmtRD(currentItem.transportCost)} · según km)`
          : 'Con traslado a obra (local RD$ 0 · según km)';
      }
    }
    if (!card) return;
    if (geoState.lat != null && geoState.lng != null && geoState.distanceKm != null) {
      const wantsTrans = transSel && transSel.value === 'yes';
      const costText = wantsTrans
        ? `<strong>Traslado (${geoState.distanceKm} km): ${GM.fmtRD(geoState.calculatedCost || 0)}</strong>`
        : '<strong>Retiro directo en patio (RD$ 0)</strong>';
      card.className = 'geo-status-card ready';
      card.innerHTML = `
        <div class="geo-status-row">
          <span><strong>✓ Obra georreferenciada</strong> (${geoState.lat.toFixed(5)}, ${geoState.lng.toFixed(5)})</span>
          <a href="https://www.google.com/maps?q=${geoState.lat},${geoState.lng}" target="_blank" rel="noopener" style="color:#047857; font-weight:800; text-decoration:underline;">Abrir Maps ↗</a>
        </div>
        <div class="geo-status-row" style="margin-top:4px;">
          <span>🚚 Ruta desde ${esc(currentItem.city)}: <strong>${geoState.distanceKm} km</strong> (~${geoState.durationMin} min)</span>
          <span>${costText}</span>
        </div>
      `;
    } else {
      card.className = 'geo-status-card';
      card.innerHTML = '📍 Toca el mapa, busca una dirección o presiona <strong>GPS</strong> para fijar el punto exacto de la obra y calcular el traslado por distancia.';
    }
  }

  async function initWorksiteMap() {
    if (!window.GM_GEO || !currentItem) return;
    geoState.lat = null;
    geoState.lng = null;
    geoState.distanceKm = null;
    geoState.durationMin = null;
    geoState.calculatedCost = null;
    try {
      geoPicker = await window.GM_GEO.createWorksitePicker({
        mapId: 'worksiteMap',
        item: currentItem,
        onAddressResolved: (addr) => {
          const inp = document.getElementById('qAddr');
          if (inp && addr) inp.value = addr;
        },
        onRoutingStart: (pt) => {
          geoState.lat = pt.lat;
          geoState.lng = pt.lng;
          const card = document.getElementById('qGeoStatus');
          if (card) {
            card.className = 'geo-status-card loading';
            card.textContent = '⏳ Calculando distancia vial y costo de traslado desde base…';
          }
        },
        onChange: (st) => {
          geoState.lat = st.dest.lat;
          geoState.lng = st.dest.lng;
          geoState.distanceKm = st.route.distanceKm;
          geoState.durationMin = st.route.durationMin;
          geoState.calculatedCost = st.quote.cost;
          geoState.isRoadRoute = st.route.isRoadRoute;
          calcReceipt();
        }
      });
    } catch (_) {
      const card = document.getElementById('qGeoStatus');
      if (card) card.textContent = 'No se pudo cargar el mapa interactivo. Verifica tu conexión.';
    }
    updateGeoUI();
  }

  async function searchWorksiteAddr() {
    const inp = document.getElementById('qAddr');
    const listBox = document.getElementById('qAddrSuggestions');
    if (!inp || !window.GM_GEO) return;
    const q = inp.value.trim();
    if (q.length < 3) {
      toast('Escribe sector, calle o ciudad para ubicar en el mapa');
      inp.focus();
      return;
    }
    const card = document.getElementById('qGeoStatus');
    if (card) {
      card.className = 'geo-status-card loading';
      card.textContent = `🔍 Buscando "${q}" en República Dominicana…`;
    }
    const results = await window.GM_GEO.searchAddress(q);
    geoSuggestions = results;
    if (!results.length) {
      if (listBox) listBox.innerHTML = '';
      updateGeoUI();
      toast('No se encontró esa dirección. Toca directamente el punto en el mapa.');
      return;
    }
    if (results.length === 1) {
      pickGeoSuggestion(0);
      return;
    }
    if (listBox) {
      listBox.innerHTML = results.map((r, idx) => `
        <button type="button" class="dgii-sugg-item" onclick="window.GM_DETAIL.pickGeoSuggestion(${idx})">
          <strong>📍 ${esc(r.label)}</strong>
          <span>${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</span>
        </button>
      `).join('');
    }
    updateGeoUI();
  }

  function pickGeoSuggestion(idx) {
    const item = geoSuggestions[idx];
    const listBox = document.getElementById('qAddrSuggestions');
    if (listBox) listBox.innerHTML = '';
    if (!item || !geoPicker) return;
    geoPicker.setWorksite(item.lat, item.lng, { addressLabel: item.label, shouldReverse: false });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast('Tu navegador no soporta geolocalización GPS');
      return;
    }
    const card = document.getElementById('qGeoStatus');
    if (card) {
      card.className = 'geo-status-card loading';
      card.textContent = '📡 Obteniendo tu ubicación GPS actual…';
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (geoPicker) {
          geoPicker.setWorksite(pos.coords.latitude, pos.coords.longitude, { shouldReverse: true });
        }
      },
      () => {
        updateGeoUI();
        toast('Permiso de ubicación denegado. Toca directamente en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  /* =========================================================
     VALORACIONES CON ESTRELLAS Y COMENTARIOS
     ========================================================= */
  function setReviewStars(n) {
    selectedReviewStars = Math.min(5, Math.max(1, Number(n) || 5));
    document.querySelectorAll('#revStarPicker .star-pick-btn').forEach((btn) => {
      const val = Number(btn.dataset.star);
      btn.classList.toggle('active', val <= selectedReviewStars);
    });
    const lbl = document.getElementById('revStarLabel');
    if (lbl) lbl.textContent = STAR_LABELS[selectedReviewStars] || '';
  }

  function renderReviewsSection() {
    if (!currentItem || !window.GM_REVIEWS) return;
    const reviews = window.GM_REVIEWS.mergeReviews(currentItem.id, cloudReviews);
    const stats = window.GM_REVIEWS.getStats(reviews);

    // Actualizar badge de estrellas en el encabezado
    const headerBadge = document.getElementById('eqRatingPill');
    if (headerBadge) {
      headerBadge.innerHTML = stats.count > 0
        ? `★ ${stats.avg.toFixed(1)} <span style="font-weight:600; opacity:0.85;">(${stats.count} ${stats.count === 1 ? 'reseña' : 'reseñas'})</span>`
        : '★ Nuevo equipo';
    }

    const overviewBox = document.getElementById('reviewsOverviewBox');
    if (overviewBox) {
      const barsHTML = [5, 4, 3, 2, 1].map((s) => {
        const c = stats.breakdown[s] || 0;
        const pct = stats.count > 0 ? Math.round((c / stats.count) * 100) : 0;
        return `
          <div class="r-bar-row">
            <span style="width:24px;">${s}★</span>
            <div class="r-bar-track"><div class="r-bar-fill" style="width:${pct}%;"></div></div>
            <span style="width:22px; text-align:right; color:var(--text-muted);">${c}</span>
          </div>
        `;
      }).join('');

      overviewBox.innerHTML = `
        <div class="reviews-score-box">
          <div class="reviews-big-num">${stats.count > 0 ? stats.avg.toFixed(1) : '—'}</div>
          <div class="reviews-stars-row">${window.GM_REVIEWS.renderStarsHTML(stats.avg)}</div>
          <div class="reviews-count-lbl">${stats.count} ${stats.count === 1 ? 'valoración' : 'valoraciones'}</div>
        </div>
        <div class="reviews-bars">${barsHTML}</div>
      `;
    }

    const listBox = document.getElementById('reviewsListBox');
    if (listBox) {
      if (!reviews.length) {
        listBox.innerHTML = '<p style="font-size:13px; color:var(--text-muted);">Sé el primero en valorar este equipo.</p>';
      } else {
        listBox.innerHTML = reviews.map((r) => `
          <div class="review-card">
            <div class="review-card-head">
              <div>
                <div class="review-author">${esc(r.author)}</div>
                <div class="review-meta">
                  <span>${esc(r.date || '')}</span>
                  ${r.verified ? '<span class="review-verified">✓ Cliente Green Mile</span>' : ''}
                </div>
              </div>
              <div class="reviews-stars-row" style="font-size:14px; margin:0;">${window.GM_REVIEWS.renderStarsHTML(r.rating)}</div>
            </div>
            <p class="review-text">${esc(r.comment)}</p>
          </div>
        `).join('');
      }
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!currentItem || !window.GM_REVIEWS) return;
    const authorEl = document.getElementById('revAuthor');
    const commentEl = document.getElementById('revComment');
    const author = (authorEl && authorEl.value.trim()) || '';
    const comment = (commentEl && commentEl.value.trim()) || '';
    if (author.length < 2) {
      toast('Escribe tu nombre o empresa para publicar la reseña');
      if (authorEl) authorEl.focus();
      return;
    }
    if (comment.length < 5) {
      toast('Escribe un breve comentario sobre el equipo');
      if (commentEl) commentEl.focus();
      return;
    }
    try {
      await window.GM_REVIEWS.addReview(currentItem.id, {
        author,
        rating: selectedReviewStars,
        comment,
        verified: false
      });
      if (authorEl) authorEl.value = '';
      if (commentEl) commentEl.value = '';
      setReviewStars(5);
      renderReviewsSection();
      toast('★ ¡Gracias! Tu valoración fue publicada');
    } catch (err) {
      toast(err.message || 'No se pudo guardar la reseña');
    }
  }

  function getPermitHintForCategory(cat) {
    const c = String(cat || '');
    if (c.includes('Izaje')) return '💡 Para grúas y brazos articulados en zonas urbanas suele requerirse permiso de Ayuntamiento e INTRANT / DIGESETT.';
    if (c.includes('Movimiento')) return '💡 En excavaciones, corte o bote de material recuerda verificar permiso de Medio Ambiente y Ayuntamiento.';
    if (c.includes('Energía')) return '💡 Para plantas eléctricas en zonas urbanas, hoteles o residenciales verifica control de ruido (Salud Pública / Residencial).';
    if (c.includes('Transporte')) return '💡 Verifica horarios permitidos de circulación pesada (INTRANT) y autorización de acceso en residenciales o plazas.';
    return '💡 Indica qué permisos o autorizaciones aplican a esta obra para evitar retrasos, multas o viajes en vacío.';
  }

  function toggleWorksitePermit(btn) {
    if (!btn) return;
    const val = btn.dataset.permit || '';
    const isPrivate = val === 'Terreno privado sin restricciones';
    const allBtns = document.querySelectorAll('#qPermitChips .permit-chip');
    if (isPrivate) {
      const willSelect = !btn.classList.contains('selected');
      allBtns.forEach((b) => b.classList.remove('selected'));
      if (willSelect) btn.classList.add('selected');
    } else {
      allBtns.forEach((b) => {
        if (b.dataset.permit === 'Terreno privado sin restricciones') b.classList.remove('selected');
      });
      btn.classList.toggle('selected');
    }
  }

  function getSelectedWorksitePermits() {
    return Array.from(document.querySelectorAll('#qPermitChips .permit-chip.selected'))
      .map((b) => b.dataset.permit)
      .filter(Boolean);
  }

  function stepQty(delta) {
    const inp = document.getElementById('qQty');
    if (!inp) return;
    const next = Math.max(1, (Number(inp.value) || 1) + delta);
    inp.value = next;
    calcReceipt();
  }

  async function confirmRent(e) {
    e.preventDefault();
    if (!calState.start) {
      toast('Selecciona las fechas de alquiler en el calendario');
      document.getElementById('calDays')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const ncfChecked = Boolean(document.getElementById('qNcf')?.checked);
    if (dgiiController) {
      const check = await dgiiController.validateBeforeSubmit({ requireActiveForNcf: ncfChecked });
      if (!check.valid) {
        toast(check.error);
        document.getElementById('qRnc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // Si escribió dirección pero aún no fijó el punto, intentar geocodificar automáticamente
    if ((geoState.lat == null || geoState.lng == null) && window.GM_GEO && geoPicker) {
      const typedAddr = document.getElementById('qAddr')?.value.trim() || '';
      if (typedAddr.length >= 3) {
        const hits = await window.GM_GEO.searchAddress(typedAddr);
        if (hits.length > 0) {
          await geoPicker.setWorksite(hits[0].lat, hits[0].lng, { addressLabel: hits[0].label, shouldReverse: false });
        }
      }
    }

    if (geoState.lat == null || geoState.lng == null) {
      toast('Fija el punto exacto de la obra en el mapa para georreferenciar la dirección');
      document.getElementById('worksiteMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const worksitePermits = getSelectedWorksitePermits();
    if (worksitePermits.length === 0) {
      toast('Selecciona los permisos o tipo de acceso de la obra');
      document.getElementById('qPermitChips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!document.getElementById('qPermitsDecl')?.checked) {
      toast('Confirma la declaración de permisos vigentes de la obra');
      document.getElementById('qPermitsDecl')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!sigSigned) {
      toast('Dibuja tu firma en pantalla para continuar');
      document.getElementById('sigCanvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const b = currentBreakdown();
    const sig = document.getElementById('sigCanvas').toDataURL('image/png');
    const rec = {
      id: Date.now(),
      equipmentId: currentItem.id,
      title: currentItem.title,
      city: currentItem.city,
      owner: currentItem.owner,
      ownerRnc: currentItem.rnc || 'N/A',
      ownerPhone: currentItem.phone,
      renter: document.getElementById('qRenter').value.trim(),
      renterRnc: document.getElementById('qRnc').value.trim(),
      dgiiVerified: true,
      address: document.getElementById('qAddr').value.trim(),
      worksiteLat: geoState.lat,
      worksiteLng: geoState.lng,
      distanceKm: geoState.distanceKm,
      durationMin: geoState.durationMin,
      transportCost: b.trans,
      worksitePermits,
      permitsDeclared: true,
      startDate: calState.start,
      endDate: calState.end || calState.start,
      qty: b.qty,
      unitLabel: b.label,
      netSubtotal: b.net,
      itbis: b.itbis,
      total: b.total,
      ncf: b.ncf,
      signature: sig
    };

    state.bookings.unshift(rec);
    const localEq = state.equipment.find(x => String(x.id) === String(currentItem.id));
    if (localEq) localEq.busy = true;
    currentItem.busy = true;
    GM.saveState(state);
    if (window.GM_FIREBASE && window.GM_FIREBASE.isReady()) {
      window.GM_FIREBASE.saveBooking(rec, currentItem.id).catch(() => {});
    }

    const pill = document.getElementById('availPill');
    if (pill) {
      pill.classList.add('busy');
      pill.textContent = 'En Obra';
    }
    const specAvail = document.getElementById('specAvail');
    if (specAvail) specAvail.textContent = 'Reservado / En Obra';

    calState.start = '';
    calState.end = '';
    renderCalendar();
    openContract(rec);
    toast('✓ Obra georreferenciada, permisos confirmados y contrato firmado');
  }

  function openContract(b) {
    const logoSrc = BASE + 'logo.png';
    const rangeLabel = b.endDate && b.endDate !== b.startDate
      ? `del ${esc(b.startDate)} al ${esc(b.endDate)}`
      : `desde ${esc(b.startDate)}`;
    const gpsLine = (b.worksiteLat != null && b.worksiteLng != null)
      ? `<br><a href="https://www.google.com/maps?q=${b.worksiteLat},${b.worksiteLng}" target="_blank" rel="noopener" style="color:var(--orange); font-weight:700;">📍 GPS: ${Number(b.worksiteLat).toFixed(5)}, ${Number(b.worksiteLng).toFixed(5)}</a>`
      : '';
    const distLine = b.distanceKm
      ? `<p style="font-size:13px; margin-bottom:6px;"><strong>Logística / Traslado:</strong> ${b.distanceKm} km desde ${esc(b.city)} ${b.transportCost > 0 ? `(${GM.fmtRD(b.transportCost)})` : '(Retiro en patio)'}</p>`
      : '';
    const permitsLine = Array.isArray(b.worksitePermits) && b.worksitePermits.length
      ? `<div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:10px; font-size:12px; color:#78350F; margin-bottom:12px;">
          <strong>Permisos y Accesos de Obra:</strong> ${b.worksitePermits.map(esc).join(' • ')}<br>
          <span style="font-size:11px;">El contratista declara contar con estos permisos vigentes antes de la llegada del equipo y asume costos de standby, retención o viaje en vacío por falta de permisos.</span>
        </div>`
      : '';
    document.getElementById('contractBody').innerHTML = `
      <div style="border:1.5px solid var(--border); border-radius:14px; padding:20px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--navy); padding-bottom:12px; margin-bottom:14px; gap:10px;">
          <div>
            <strong style="font-size:16px; color:var(--navy);">GREEN MILE CONSTRUCTION RD</strong>
            <div style="font-size:11px; font-weight:800; color:var(--orange);">CONTRATO #GM-${String(b.id).slice(-6)}</div>
          </div>
          <img src="${logoSrc}" style="height:42px; object-fit:contain;" alt="Green Mile RD">
        </div>
        <div style="font-size:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div style="background:var(--bg); padding:10px; border-radius:10px;">
            <strong style="color:var(--navy); display:block;">GESTOR / FACTURADOR</strong>
            Green Mile Construction RD<br>Facturación Electrónica e-NCF<br>Cobro y Garantía Centralizada
          </div>
          <div style="background:var(--bg); padding:10px; border-radius:10px;">
            <strong style="color:var(--navy); display:block;">CONTRATISTA</strong>
            ${esc(b.renter)}<br>RNC: ${esc(b.renterRnc)}<br>Obra: ${esc(b.address)}${gpsLine}
          </div>
        </div>
        <p style="font-size:13px; margin-bottom:6px;"><strong>Equipo:</strong> ${esc(b.title)} (${esc(b.city)})</p>
        ${distLine}
        <p style="font-size:13px; margin-bottom:10px;"><strong>Plazo:</strong> ${b.qty} ${esc(b.unitLabel)} (${rangeLabel})</p>
        ${permitsLine}
        <div style="background:var(--navy-soft); padding:12px; border-radius:10px; font-size:13px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between;"><span>Subtotal Neto:</span><span>${GM.fmtRD(b.netSubtotal)}</span></div>
          ${b.ncf ? `<div style="display:flex; justify-content:space-between;"><span>ITBIS 18% (e-NCF):</span><span>${GM.fmtRD(b.itbis)}</span></div>` : ''}
          <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--navy); border-top:1px solid #CBD5E1; margin-top:6px; padding-top:6px;">
            <span>Total Acordado:</span><span>${GM.fmtRD(b.total)}</span>
          </div>
        </div>
        <div style="text-align:center; margin-top:12px;">
          ${b.signature ? `<img src="${b.signature}" alt="Firma" style="height:52px; border-bottom:1px solid var(--navy); margin:0 auto 4px; display:block;">` : ''}
          <span style="font-size:11px; font-weight:700; color:var(--navy);">Firma Digital — ${esc(b.renter)}</span>
        </div>
        <button class="btn btn-navy no-print" style="width:100%; margin-top:16px;" onclick="window.print()">Imprimir / Guardar PDF</button>
      </div>
    `;
    openSheet('contractModal');
  }

  function renderRelated(item) {
    const pool = state.equipment.filter(e => String(e.id) !== String(item.id));
    const scored = pool.map(e => ({
      e,
      score: (e.category === item.category ? 2 : 0) + (e.city === item.city ? 2 : 0) + (!e.busy ? 1 : 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, 4).map(x => x.e);
    if (!picks.length) return '';

    return `
      <section class="related-section">
        <div class="related-head">
          <h3>Otros equipos similares en RD</h3>
          <a class="btn btn-ghost" href="${BASE}index.html?cat=${encodeURIComponent(item.category)}" style="padding:8px 13px; font-size:12px;">Ver más de ${esc(item.category)} →</a>
        </div>
        <div class="related-grid">
          ${picks.map(p => {
            const href = GM.getEquipmentPath(p, BASE);
            const fallbackCat = esc(p.category).replace(/'/g, "\\'");
            return `
              <a class="rel-card" href="${href}">
                <div class="rel-media">
                  <img src="${itemImageSrc(p)}" alt="${esc(p.title)}" loading="lazy" onerror="this.onerror=null;this.src=window.GM_CATALOG.defaultCover('${fallbackCat}')">
                  <span class="pill pill-city" style="position:absolute; top:10px; left:10px;">${esc(p.city)}</span>
                  <span class="pill pill-avail ${p.busy ? 'busy' : ''}" style="position:absolute; bottom:10px; left:10px;">${p.busy ? 'En Obra' : 'Disponible'}</span>
                </div>
                <div class="rel-body">
                  <div class="rel-cat">${esc(p.category)}</div>
                  <div class="rel-title">${esc(p.title)}</div>
                  <div class="rel-foot">
                    <div class="rel-price">${GM.fmtRD(p.priceDay)} <small>/ día</small></div>
                    <span style="font-size:12px; font-weight:800; color:var(--orange);">Ver anuncio →</span>
                  </div>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderNotFound() {
    document.getElementById('pageContent').innerHTML = `
      <div class="panel not-found">
        <div style="font-size:38px; margin-bottom:10px;">🚜</div>
        <h2>Anuncio no encontrado</h2>
        <p>Este equipo pudo haber sido retirado o el enlace está incompleto. Explora todo nuestro catálogo disponible en República Dominicana.</p>
        <a class="btn btn-primary" href="${BASE}index.html">Ver Catálogo Completo</a>
      </div>
    `;
  }

  function renderPage() {
    currentItem = resolveItem();
    if (!currentItem) {
      renderNotFound();
      return;
    }

    const it = currentItem;
    const shareUrl = GM.getShareUrl(it, BASE);
    const shareText = getShareText(it, shareUrl);
    const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const GREEN_MILE_WA = '18095550100'; // Número oficial de Green Mile RD
    const waOwnerMsg = encodeURIComponent(`Hola Green Mile RD, quiero cotizar/alquilar el equipo #GM-${it.id}: "${it.title}" (${it.city}):\n${shareUrl}`);
    const waOwnerHref = `https://wa.me/${GREEN_MILE_WA}?text=${waOwnerMsg}`;
    const telHref = `tel:+${GREEN_MILE_WA}`;
    const today = new Date().toISOString().split('T')[0];
    const fallbackCat = esc(it.category).replace(/'/g, "\\'");
    const weekSavings = it.priceDay > 0 ? Math.max(0, Math.round((1 - (it.priceWeek / (it.priceDay * 6))) * 100)) : 0;

    const allPhotos = itemImagesList(it);
    const thumbsHTML = allPhotos.length > 1
      ? `<div class="media-thumbs" id="heroThumbs">
          ${allPhotos.map((src, idx) => `
            <button type="button" class="media-thumb ${idx === 0 ? 'active' : ''}" onclick="window.GM_DETAIL.selectPhoto(${idx})" aria-label="Ver foto ${idx + 1}">
              <img src="${src}" alt="Foto ${idx + 1} de ${esc(it.title)}" onerror="this.onerror=null;this.src=window.GM_CATALOG.defaultCover('${fallbackCat}')">
            </button>
          `).join('')}
        </div>`
      : '';

    document.title = `${it.title} en ${it.city} — ${GM.fmtRD(it.priceDay)}/día | Green Mile RD`;

    document.getElementById('pageContent').innerHTML = `
      <nav class="breadcrumbs" aria-label="Ruta de navegación">
        <a href="${BASE}index.html">Catálogo RD</a>
        <span class="sep">/</span>
        <a href="${BASE}index.html?cat=${encodeURIComponent(it.category)}">${esc(it.category)}</a>
        <span class="sep">/</span>
        <a href="${BASE}index.html?city=${encodeURIComponent(it.city)}">${esc(it.city)}</a>
        <span class="sep">/</span>
        <span class="current">${esc(it.title)}</span>
      </nav>

      <div class="detail-layout">
        <!-- COLUMNA IZQUIERDA: FICHA DEL ANUNCIO -->
        <div>
          <article class="panel">
            <div class="hero-media">
              <img id="mainHeroImg" src="${allPhotos[0]}" alt="${esc(it.title)}" onerror="this.onerror=null;this.src=window.GM_CATALOG.defaultCover('${fallbackCat}')">
              <div class="media-badges-top">
                <span class="pill pill-city">📍 ${esc(it.city)}, RD</span>
                <div style="display:flex; gap:6px; align-items:center;">
                  ${allPhotos.length > 1 ? `<span id="heroPhotoCounter" class="pill pill-city">📷 1/${allPhotos.length}</span>` : ''}
                  <span class="pill pill-code">Ref. #GM-${esc(it.id)}</span>
                </div>
              </div>
              <div class="media-badges-bottom">
                <span id="availPill" class="pill pill-avail ${it.busy ? 'busy' : ''}">${it.busy ? 'En Obra' : 'Disponible Hoy'}</span>
                ${it.operator ? '<span class="pill pill-op">👷 Con Operador Certificado</span>' : ''}
              </div>
            </div>
            ${thumbsHTML}

            <div class="panel-pad">
              <div class="eq-cat-label">${esc(it.category)}</div>
              <h1 class="eq-heading">${esc(it.title)}</h1>
              <div class="eq-subline">
                <a href="#reviewsSection" class="rating-pill-link" id="eqRatingPill" onclick="event.preventDefault(); document.getElementById('reviewsSection')?.scrollIntoView({behavior:'smooth'});">★ 4.8</a>
                <span>⚡ ${esc(it.power || 'Estándar')}</span>
                <span>📅 Año ${esc(it.year || 'Verificado')}</span>
                <span>🏢 Flota Verificada • Green Mile RD</span>
              </div>

              <!-- BARRA PARA COMPARTIR ESTE ANUNCIO -->
              <div class="share-box">
                <div class="share-box-head">
                  <strong>🔗 Compartir este anuncio</strong>
                  <span>Enlace individual listo para WhatsApp o cotización</span>
                </div>
                <div class="share-link-row">
                  <input type="text" class="share-url-input" id="shareUrlInput" value="${esc(shareUrl)}" readonly onclick="this.select()" aria-label="Enlace del anuncio">
                  <div class="share-btns">
                    <button type="button" class="btn btn-navy" id="copyLinkBtn" style="padding:9px 13px; font-size:12px;" onclick="window.GM_DETAIL.copyShareLink()">📋 Copiar enlace</button>
                    <a class="btn btn-wa" style="padding:9px 13px; font-size:12px;" target="_blank" rel="noopener" href="${waShareHref}">WhatsApp</a>
                    <button type="button" class="btn btn-ghost" id="nativeShareBtn" style="padding:9px 13px; font-size:12px;" onclick="window.GM_DETAIL.nativeShare()">Compartir…</button>
                  </div>
                </div>
              </div>

              <!-- TARIFAS EN RD$ -->
              <div class="rates-grid">
                <div class="rate-card">
                  <span>Por Hora</span>
                  <strong>${GM.fmtRD(it.priceHour)}</strong>
                  <small>Mínimo según obra</small>
                </div>
                <div class="rate-card featured">
                  <span>Por Día</span>
                  <strong>${GM.fmtRD(it.priceDay)}</strong>
                  <small>Jornada 8h en RD</small>
                </div>
                <div class="rate-card">
                  <span>Por Semana</span>
                  <strong>${GM.fmtRD(it.priceWeek)}</strong>
                  <small>${weekSavings > 0 ? 'Ahorra aprox. ' + weekSavings + '%' : 'Tarifa semanal'}</small>
                </div>
              </div>

              <!-- ESPECIFICACIONES -->
              <h3 class="section-label">Especificaciones del Equipo</h3>
              <div class="specs-grid">
                <div class="spec-item"><span>Categoría</span><strong>${esc(it.category)}</strong></div>
                <div class="spec-item"><span>Potencia / Capacidad</span><strong>${esc(it.power || 'Estándar')}</strong></div>
                <div class="spec-item"><span>Año / Modelo</span><strong>${esc(it.year || 'Verificado')}</strong></div>
                <div class="spec-item"><span>Provincia Base</span><strong>${esc(it.city)}, República Dominicana</strong></div>
                <div class="spec-item"><span>Operador</span><strong>${it.operator ? 'Incluido en la tarifa' : 'Opcional / Equipo seco'}</strong></div>
                <div class="spec-item"><span>Traslado Lowboy (Base)</span><strong>${it.transportCost > 0 ? GM.fmtRD(it.transportCost) + ' + km' : 'Local incluido + km'}</strong></div>
                <div class="spec-item"><span>Disponibilidad</span><strong id="specAvail">${it.busy ? 'En Obra (consultar fecha)' : 'Disponible Hoy'}</strong></div>
                <div class="spec-item"><span>Facturación Fiscal</span><strong>Comprobante e-NCF (e-CF 31 · DGII)</strong></div>
              </div>
              ${Array.isArray(it.certifications) && it.certifications.length ? `
                <div class="cert-pills" aria-label="Documentación y permisos del equipo">
                  ${it.certifications.map(c => `<span class="cert-pill">✓ ${esc(c)}</span>`).join('')}
                </div>
              ` : ''}

              <h3 class="section-label">Descripción y Aditamentos</h3>
              <p class="desc-text">${esc(it.desc)}</p>

              <!-- GESTIÓN CENTRALIZADA GREEN MILE RD -->
              <div class="owner-card">
                <div class="owner-meta">
                  <small>Cobro y Garantía • Green Mile RD</small>
                  <strong>Equipo Verificado #GM-${esc(it.id)}</strong>
                  <span>Base en ${esc(it.city)} • Facturación Electrónica e-NCF • Coordinación directa vía Green Mile</span>
                </div>
                <div class="owner-actions">
                  <a class="btn btn-wa" target="_blank" rel="noopener" href="${waOwnerHref}">💬 Solicitar vía Green Mile</a>
                  <a class="btn btn-ghost" style="background:rgba(255,255,255,0.12); color:#fff; border-color:rgba(255,255,255,0.28);" href="${telHref}">📞 Llamar</a>
                </div>
              </div>

              <!-- VALORACIONES CON ESTRELLAS Y COMENTARIOS -->
              <section class="reviews-section" id="reviewsSection">
                <h3 class="section-label" style="margin-top:0;">Valoraciones y Comentarios del Equipo</h3>
                <div class="reviews-overview" id="reviewsOverviewBox"></div>

                <form class="review-form-box" onsubmit="window.GM_DETAIL.submitReview(event)">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <strong style="font-size:13.5px; color:var(--navy);">Califica este equipo</strong>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div class="star-picker" id="revStarPicker" role="radiogroup" aria-label="Puntuación en estrellas">
                        <button type="button" class="star-pick-btn active" data-star="1" onclick="window.GM_DETAIL.setReviewStars(1)" aria-label="1 estrella">★</button>
                        <button type="button" class="star-pick-btn active" data-star="2" onclick="window.GM_DETAIL.setReviewStars(2)" aria-label="2 estrellas">★</button>
                        <button type="button" class="star-pick-btn active" data-star="3" onclick="window.GM_DETAIL.setReviewStars(3)" aria-label="3 estrellas">★</button>
                        <button type="button" class="star-pick-btn active" data-star="4" onclick="window.GM_DETAIL.setReviewStars(4)" aria-label="4 estrellas">★</button>
                        <button type="button" class="star-pick-btn active" data-star="5" onclick="window.GM_DETAIL.setReviewStars(5)" aria-label="5 estrellas">★</button>
                      </div>
                      <span id="revStarLabel" style="font-size:11.5px; font-weight:700; color:var(--orange);">5 ★ — Excelente</span>
                    </div>
                  </div>
                  <div class="f-grid" style="gap:10px;">
                    <div class="f-field full">
                      <label>Tu Nombre o Constructora</label>
                      <div class="f-box"><input type="text" id="revAuthor" placeholder="Ej. Ing. Pedro Martínez — Constructora Este" required></div>
                    </div>
                    <div class="f-field full">
                      <label>Comentario sobre rendimiento, estado o puntualidad</label>
                      <div class="f-box"><textarea id="revComment" rows="2" placeholder="Cuéntanos tu experiencia con esta máquina en obra..." required></textarea></div>
                    </div>
                  </div>
                  <button type="submit" class="btn btn-navy" style="margin-top:10px; padding:9px 16px; font-size:12.5px;">Publicar Valoración</button>
                </form>

                <div class="review-list" id="reviewsListBox"></div>
              </section>
            </div>
          </article>
        </div>

        <!-- COLUMNA DERECHA: COTIZADOR + CONTRATO DIGITAL e-NCF -->
        <aside class="booking-col" id="bookingBox">
          <div class="panel">
            <div class="booking-head">
              <div>
                <h2>Cotizar y Contratar</h2>
                <p>Cálculo con ITBIS (e-NCF) y firma digital</p>
              </div>
              <button type="button" class="pro-pill ${state.isPro ? 'active' : ''}" id="bookingProBtn" onclick="window.GM_DETAIL.openSheet('proSheet')">
                ${state.isPro ? '⭐ Pro (-10%)' : '⭐ Plan Pro'}
              </button>
            </div>

            <div class="panel-pad">
              <form onsubmit="window.GM_DETAIL.confirmRent(event)" autocomplete="off">
                <div class="f-grid">
                  <div class="f-field span-full-sidebar">
                    <label>Modalidad de Alquiler</label>
                    <div class="f-box">
                      <select id="qMode" onchange="window.GM_DETAIL.calcReceipt()">
                        <option value="day">Por Días (${GM.fmtRD(it.priceDay)} / día)</option>
                        <option value="hour">Por Horas (${GM.fmtRD(it.priceHour)} / hora)</option>
                        <option value="week">Por Semanas (${GM.fmtRD(it.priceWeek)} / sem.)</option>
                      </select>
                    </div>
                  </div>
                  <div class="f-field span-full-sidebar">
                    <label>Cantidad (días / horas / semanas)</label>
                    <div class="qty-stepper">
                      <button type="button" class="qty-btn" onclick="window.GM_DETAIL.stepQty(-1)" aria-label="Menos">−</button>
                      <input type="number" id="qQty" inputmode="numeric" value="3" min="1" oninput="window.GM_DETAIL.calcReceipt()" required>
                      <button type="button" class="qty-btn" onclick="window.GM_DETAIL.stepQty(1)" aria-label="Más">+</button>
                    </div>
                  </div>
                  <div class="f-field full">
                    <label>Calendario de Disponibilidad (Inicio → Fin)</label>
                    <input type="hidden" id="qStart" value="${today}">
                    <div class="cal-box">
                      <div class="cal-head">
                        <button type="button" class="cal-nav-btn" onclick="window.GM_DETAIL.calPrevMonth()" aria-label="Mes anterior">‹</button>
                        <span class="cal-title" id="calTitle"></span>
                        <button type="button" class="cal-nav-btn" onclick="window.GM_DETAIL.calNextMonth()" aria-label="Mes siguiente">›</button>
                      </div>
                      <div class="cal-weekdays">
                        <span>Do</span><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span>
                      </div>
                      <div class="cal-days" id="calDays"></div>
                      <div class="cal-summary">
                        <span id="calSummaryText">Selecciona fecha de inicio y fin en obra</span>
                        <button type="button" style="border:none; background:none; color:var(--orange); font-weight:700; font-size:11.5px; cursor:pointer;" onclick="window.GM_DETAIL.calClear()">Limpiar</button>
                      </div>
                      <div class="cal-legend">
                        <span><i class="cal-dot" style="background:var(--orange);"></i> Seleccionado</span>
                        <span><i class="cal-dot" style="background:#CBD5E1;"></i> Ocupado / En obra</span>
                      </div>
                    </div>
                  </div>
                  <div class="f-field full">
                    <label>Traslado Cama Baja (Lowboy)</label>
                    <div class="f-box">
                      <select id="qTrans" onchange="window.GM_DETAIL.calcReceipt()">
                        <option value="yes" id="qTransYesOpt">${it.transportCost > 0 ? 'Con traslado a obra (desde ' + GM.fmtRD(it.transportCost) + ' · según km)' : 'Con traslado a obra (local RD$ 0 · según km)'}</option>
                        <option value="no">Retiro directo en patio (RD$ 0)</option>
                      </select>
                    </div>
                  </div>
                  <div class="f-field full">
                    <label>RNC (9 dígitos) o Cédula <small class="req-tag">Validación DGII</small></label>
                    <div class="f-box"><input type="text" id="qRnc" inputmode="numeric" placeholder="Ej. 1-01-01992-1" enterkeyhint="next" required></div>
                  </div>
                  <div class="f-field full">
                    <label>Contratista / Razón Social DGII <small class="req-tag">Búsqueda en vivo</small></label>
                    <div class="f-box"><input type="text" id="qRenter" placeholder="Escribe empresa o autocompleta por RNC" enterkeyhint="next" required></div>
                    <div id="qDgiiSuggestions" class="dgii-sugg-list"></div>
                    <div id="qDgiiStatus" class="dgii-badge" style="display:none;"></div>
                  </div>
                  <div class="f-field full">
                    <label>Dirección de Obra en RD <small class="req-tag">Mapa y Distancia</small></label>
                    <div class="geo-input-row">
                      <div class="f-box">
                        <input type="text" id="qAddr" placeholder="Sector, calle o proyecto (ej. Verón, Punta Cana)" enterkeyhint="search" onkeydown="if(event.key==='Enter'){event.preventDefault(); window.GM_DETAIL.searchWorksiteAddr();}" required>
                      </div>
                      <button type="button" class="geo-btn" onclick="window.GM_DETAIL.searchWorksiteAddr()" title="Buscar en mapa">🔍 Buscar</button>
                      <button type="button" class="geo-btn geo-btn-gps" onclick="window.GM_DETAIL.useMyLocation()" title="Usar mi ubicación GPS">📍 GPS</button>
                    </div>
                    <div id="qAddrSuggestions" class="dgii-sugg-list"></div>
                    <div class="geo-map-wrap">
                      <div id="worksiteMap" class="geo-map-canvas" aria-label="Mapa de ubicación de obra"></div>
                      <div class="geo-map-legend">
                        <span><i class="geo-pin-dot" style="background:#0D223A;"></i> Base (${esc(it.city)})</span>
                        <span><i class="geo-pin-dot" style="background:#B85A27;"></i> Obra (toca o arrastra)</span>
                      </div>
                    </div>
                    <div id="qGeoStatus" class="geo-status-card"></div>
                  </div>

                  <div class="f-field full">
                    <label>Permisos y Accesos de Obra (RD) <small class="req-tag">Obligatorio</small></label>
                    <div class="permit-chips" id="qPermitChips">
                      <button type="button" class="permit-chip" data-permit="Ayuntamiento / Vía pública" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🏛️ Ayuntamiento</button>
                      <button type="button" class="permit-chip" data-permit="INTRANT / DIGESETT" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🚧 INTRANT / DIGESETT</button>
                      <button type="button" class="permit-chip" data-permit="Medio Ambiente" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🌿 Medio Ambiente</button>
                      <button type="button" class="permit-chip" data-permit="Residencial / Condominio / Plaza" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🏘️ Residencial / Plaza</button>
                      <button type="button" class="permit-chip" data-permit="Salud Pública / Control de ruido" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🏥 Salud Pública / Ruido</button>
                      <button type="button" class="permit-chip" data-permit="Zona Franca / Hotel / Puerto" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">🏭 Zona Franca / Hotel</button>
                      <button type="button" class="permit-chip" data-permit="Terreno privado sin restricciones" onclick="window.GM_DETAIL.toggleWorksitePermit(this)">✅ Terreno privado libre</button>
                    </div>
                    <div class="permit-hint">${getPermitHintForCategory(it.category)}</div>
                    <label class="permit-decl">
                      <input type="checkbox" id="qPermitsDecl" required>
                      <span>Confirmo que la obra cuenta con los permisos y accesos vigentes seleccionados antes de la llegada del equipo. En caso de espera (<em>standby</em>), retención o viaje en vacío por falta de permisos, el contratista asume dichos costos.</span>
                    </label>
                  </div>

                  <div class="f-field full">
                    <label class="switch-row">
                      <div>
                        <strong>Comprobante Crédito Fiscal (e-NCF · e-CF 31)</strong>
                        <span>Desglosa ITBIS 18% con RNC activo en DGII</span>
                      </div>
                      <input type="checkbox" id="qNcf" checked style="display:none;" onchange="window.GM_DETAIL.calcReceipt()">
                      <div class="sw-knob"></div>
                    </label>
                  </div>

                  <div class="f-field full">
                    <label>Firma Táctil del Contratista <small style="color:var(--orange); cursor:pointer; font-weight:800;" onclick="window.GM_DETAIL.clearSig()">Limpiar firma</small></label>
                    <div class="sig-pad">
                      <canvas id="sigCanvas" width="520" height="118"></canvas>
                      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Firma aquí con el dedo o cursor</div>
                    </div>
                  </div>
                </div>

                <div class="receipt" id="qReceipt"></div>
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top:14px; min-height:50px; font-size:15px;">Firmar y Reservar Fechas</button>
              </form>
            </div>
          </div>
        </aside>
      </div>

      ${renderRelated(it)}

      <!-- BARRA INFERIOR FIJA EN MÓVIL -->
      <div class="mobile-cta-bar">
        <div class="mobile-cta-price">
          <strong>${GM.fmtRD(it.priceDay)}</strong>
          <span>por día • ${esc(it.city)}</span>
        </div>
        <div class="mobile-cta-btns">
          <button type="button" class="btn btn-ghost" style="padding:9px 11px; font-size:12px;" onclick="window.GM_DETAIL.nativeShare()">🔗</button>
          <a class="btn btn-wa" style="padding:9px 12px; font-size:12px;" target="_blank" rel="noopener" href="${waOwnerHref}">WhatsApp</a>
          <button type="button" class="btn btn-primary" style="padding:9px 14px; font-size:12px;" onclick="document.getElementById('bookingBox').scrollIntoView({behavior:'smooth'})">Cotizar</button>
        </div>
      </div>
    `;

    updateFavoriteButtons();
    renderCalendar();
    setupSig();
    calcReceipt();
    initWorksiteMap();
    renderReviewsSection();

    if (window.GM_DGII && window.GM_DGII.attachPair) {
      dgiiController = window.GM_DGII.attachPair({
        rncInputId: 'qRnc',
        nameInputId: 'qRenter',
        statusBoxId: 'qDgiiStatus',
        suggestionsBoxId: 'qDgiiSuggestions'
      });
    }
  }

  window.GM_DETAIL = {
    selectPhoto,
    copyShareLink,
    nativeShare,
    toggleFavorite,
    openSheet,
    closeSheet,
    activatePro,
    calcReceipt,
    stepQty,
    clearSig,
    confirmRent,
    calPrevMonth,
    calNextMonth,
    calPickDate,
    calClear,
    searchWorksiteAddr,
    pickGeoSuggestion,
    useMyLocation,
    setReviewStars,
    submitReview,
    toggleWorksitePermit
  };

  async function initPage() {
    renderPage();

    const params = new URLSearchParams(window.location.search);
    const rawId = CFG.equipmentId != null ? String(CFG.equipmentId) : params.get('id');

    if (rawId && window.GM_FIREBASE && window.GM_FIREBASE.isReady()) {
      if (!currentItem) {
        const cloudDoc = await window.GM_FIREBASE.getEquipmentById(rawId);
        if (cloudDoc) {
          state.equipment = [cloudDoc, ...state.equipment.filter(x => String(x.id) !== String(cloudDoc.id))];
          GM.saveState(state);
          renderPage();
        }
      }
      if (window.GM_FIREBASE.subscribeEquipmentById) {
        window.GM_FIREBASE.subscribeEquipmentById(rawId, (liveDoc) => {
          const wasMissing = !currentItem;
          state.equipment = [liveDoc, ...state.equipment.filter(x => String(x.id) !== String(liveDoc.id))];
          GM.saveState(state);
          if (wasMissing) {
            renderPage();
          } else {
            currentItem.busy = liveDoc.busy;
            const pill = document.getElementById('availPill');
            if (pill) {
              pill.classList.toggle('busy', Boolean(liveDoc.busy));
              pill.textContent = liveDoc.busy ? 'En Obra' : 'Disponible Hoy';
            }
          }
        });
      }
      if (window.GM_FIREBASE.subscribeReviews) {
        window.GM_FIREBASE.subscribeReviews(rawId, (list) => {
          cloudReviews = Array.isArray(list) ? list : [];
          renderReviewsSection();
        });
      }
    }
  }

  initPage();
})();
