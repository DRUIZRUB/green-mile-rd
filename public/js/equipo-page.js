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

  function itemImageSrc(item) {
    const resolved = GM.resolveAsset(item.img, BASE);
    return resolved || GM.defaultCover(item.category);
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

  function currentBreakdown() {
    const it = currentItem;
    const mode = document.getElementById('qMode').value;
    const qty = Math.max(1, Number(document.getElementById('qQty').value) || 1);
    const trans = document.getElementById('qTrans').value === 'yes' ? (it.transportCost || 0) : 0;
    const ncf = document.getElementById('qNcf').checked;

    let unit = it.priceDay, label = 'días';
    if (mode === 'hour') { unit = it.priceHour; label = 'horas'; }
    if (mode === 'week') { unit = it.priceWeek; label = 'semanas'; }

    const base = unit * qty;
    const disc = state.isPro ? Math.round(base * 0.10) : 0;
    const net = base - disc + trans;
    const itbis = ncf ? Math.round(net * 0.18) : 0;
    const total = net + itbis;
    return { qty, unit, label, base, disc, trans, net, itbis, total, ncf };
  }

  function calcReceipt() {
    const box = document.getElementById('qReceipt');
    if (!currentItem || !box) return;
    const b = currentBreakdown();
    box.innerHTML = `
      <div class="r-row"><span>${GM.fmtRD(b.unit)} × ${b.qty} ${b.label}</span><span>${GM.fmtRD(b.base)}</span></div>
      ${b.disc > 0 ? `<div class="r-row" style="color:var(--success); font-weight:700;"><span>Descuento Pro (-10%)</span><span>- ${GM.fmtRD(b.disc)}</span></div>` : ''}
      ${b.trans > 0 ? `<div class="r-row"><span>Traslado Lowboy</span><span>${GM.fmtRD(b.trans)}</span></div>` : ''}
      ${b.ncf ? `<div class="r-row"><span>ITBIS 18% (B01)</span><span>${GM.fmtRD(b.itbis)}</span></div>` : ''}
      <div class="r-total"><span>Total a Pagar</span><span>${GM.fmtRD(b.total)}</span></div>
    `;
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

  function confirmRent(e) {
    e.preventDefault();
    if (!sigSigned) {
      toast('Dibuja tu firma en pantalla para continuar');
      return;
    }
    const b = currentBreakdown();
    const sig = document.getElementById('sigCanvas').toDataURL('image/png');
    const rec = {
      id: Date.now(),
      title: currentItem.title,
      city: currentItem.city,
      owner: currentItem.owner,
      ownerRnc: currentItem.rnc || 'N/A',
      ownerPhone: currentItem.phone,
      renter: document.getElementById('qRenter').value.trim(),
      renterRnc: document.getElementById('qRnc').value.trim(),
      address: document.getElementById('qAddr').value.trim(),
      startDate: document.getElementById('qStart').value,
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

    const pill = document.getElementById('availPill');
    if (pill) {
      pill.classList.add('busy');
      pill.textContent = 'En Obra';
    }
    const specAvail = document.getElementById('specAvail');
    if (specAvail) specAvail.textContent = 'Reservado / En Obra';

    openContract(rec);
    toast('¡Contrato emitido y firmado!');
  }

  function openContract(b) {
    const logoSrc = BASE + 'logo.png';
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
            <strong style="color:var(--navy); display:block;">ARRENDADOR</strong>
            ${esc(b.owner)}<br>RNC: ${esc(b.ownerRnc)}<br>Tel: +1 ${esc(b.ownerPhone)}
          </div>
          <div style="background:var(--bg); padding:10px; border-radius:10px;">
            <strong style="color:var(--navy); display:block;">CONTRATISTA</strong>
            ${esc(b.renter)}<br>RNC: ${esc(b.renterRnc)}<br>Obra: ${esc(b.address)}
          </div>
        </div>
        <p style="font-size:13px; margin-bottom:6px;"><strong>Equipo:</strong> ${esc(b.title)} (${esc(b.city)})</p>
        <p style="font-size:13px; margin-bottom:12px;"><strong>Plazo:</strong> ${b.qty} ${esc(b.unitLabel)} desde ${esc(b.startDate)}</p>
        <div style="background:var(--navy-soft); padding:12px; border-radius:10px; font-size:13px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between;"><span>Subtotal Neto:</span><span>${GM.fmtRD(b.netSubtotal)}</span></div>
          ${b.ncf ? `<div style="display:flex; justify-content:space-between;"><span>ITBIS 18% (NCF B01):</span><span>${GM.fmtRD(b.itbis)}</span></div>` : ''}
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
    const waOwnerMsg = encodeURIComponent(`Hola ${it.owner}, vi tu anuncio "${it.title}" (${it.city}) en Green Mile App RD y quiero consultar disponibilidad:\n${shareUrl}`);
    const waOwnerHref = `https://wa.me/${GM.cleanWA(it.phone)}?text=${waOwnerMsg}`;
    const telHref = `tel:+${GM.cleanWA(it.phone)}`;
    const today = new Date().toISOString().split('T')[0];
    const fallbackCat = esc(it.category).replace(/'/g, "\\'");
    const weekSavings = it.priceDay > 0 ? Math.max(0, Math.round((1 - (it.priceWeek / (it.priceDay * 6))) * 100)) : 0;

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
              <img src="${itemImageSrc(it)}" alt="${esc(it.title)}" onerror="this.onerror=null;this.src=window.GM_CATALOG.defaultCover('${fallbackCat}')">
              <div class="media-badges-top">
                <span class="pill pill-city">📍 ${esc(it.city)}, RD</span>
                <span class="pill pill-code">Ref. #GM-${esc(it.id)}</span>
              </div>
              <div class="media-badges-bottom">
                <span id="availPill" class="pill pill-avail ${it.busy ? 'busy' : ''}">${it.busy ? 'En Obra' : 'Disponible Hoy'}</span>
                ${it.operator ? '<span class="pill pill-op">👷 Con Operador Certificado</span>' : ''}
              </div>
            </div>

            <div class="panel-pad">
              <div class="eq-cat-label">${esc(it.category)}</div>
              <h1 class="eq-heading">${esc(it.title)}</h1>
              <div class="eq-subline">
                <span>⚡ ${esc(it.power || 'Estándar')}</span>
                <span>📅 Año ${esc(it.year || 'Verificado')}</span>
                <span>🏢 ${esc(it.owner)}</span>
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
                <div class="spec-item"><span>Traslado Lowboy (Ida)</span><strong>${it.transportCost > 0 ? GM.fmtRD(it.transportCost) : 'Incluido / Retiro en patio'}</strong></div>
                <div class="spec-item"><span>Disponibilidad</span><strong id="specAvail">${it.busy ? 'En Obra (consultar fecha)' : 'Disponible Hoy'}</strong></div>
                <div class="spec-item"><span>Facturación Fiscal</span><strong>Comprobante NCF B01 (18% ITBIS)</strong></div>
              </div>

              <h3 class="section-label">Descripción y Aditamentos</h3>
              <p class="desc-text">${esc(it.desc)}</p>

              <!-- PROVEEDOR / CONTACTO DIRECTO -->
              <div class="owner-card">
                <div class="owner-meta">
                  <small>Propietario Verificado • Green Mile RD</small>
                  <strong>${esc(it.owner)}</strong>
                  <span>RNC: ${esc(it.rnc || 'N/A')} • Base en ${esc(it.city)} • +1 ${esc(it.phone)}</span>
                </div>
                <div class="owner-actions">
                  <a class="btn btn-wa" target="_blank" rel="noopener" href="${waOwnerHref}">💬 WhatsApp Directo</a>
                  <a class="btn btn-ghost" style="background:rgba(255,255,255,0.12); color:#fff; border-color:rgba(255,255,255,0.28);" href="${telHref}">📞 Llamar</a>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- COLUMNA DERECHA: COTIZADOR + CONTRATO DIGITAL NCF -->
        <aside class="booking-col" id="bookingBox">
          <div class="panel">
            <div class="booking-head">
              <div>
                <h2>Cotizar y Contratar</h2>
                <p>Cálculo con ITBIS (NCF B01) y firma digital</p>
              </div>
              <button type="button" class="pro-pill ${state.isPro ? 'active' : ''}" id="bookingProBtn" onclick="window.GM_DETAIL.openSheet('proSheet')">
                ${state.isPro ? '⭐ Pro (-10%)' : '⭐ Plan Pro'}
              </button>
            </div>

            <div class="panel-pad">
              <form onsubmit="window.GM_DETAIL.confirmRent(event)">
                <div class="f-grid">
                  <div class="f-field">
                    <label>Modalidad</label>
                    <div class="f-box">
                      <select id="qMode" onchange="window.GM_DETAIL.calcReceipt()">
                        <option value="day">Por Días (${GM.fmtRD(it.priceDay)})</option>
                        <option value="hour">Por Horas (${GM.fmtRD(it.priceHour)})</option>
                        <option value="week">Por Semanas (${GM.fmtRD(it.priceWeek)})</option>
                      </select>
                    </div>
                  </div>
                  <div class="f-field">
                    <label>Cantidad</label>
                    <div class="f-box"><input type="number" id="qQty" value="3" min="1" oninput="window.GM_DETAIL.calcReceipt()" required></div>
                  </div>
                  <div class="f-field">
                    <label>Inicio en Obra</label>
                    <div class="f-box"><input type="date" id="qStart" value="${today}" min="${today}" required></div>
                  </div>
                  <div class="f-field">
                    <label>Traslado Lowboy</label>
                    <div class="f-box">
                      <select id="qTrans" onchange="window.GM_DETAIL.calcReceipt()">
                        <option value="yes">${it.transportCost > 0 ? 'Con traslado (' + GM.fmtRD(it.transportCost) + ')' : 'Traslado incluido (RD$ 0)'}</option>
                        <option value="no">Retiro en patio</option>
                      </select>
                    </div>
                  </div>
                  <div class="f-field">
                    <label>Contratista / Empresa</label>
                    <div class="f-box"><input type="text" id="qRenter" placeholder="Constructora Cibao SRL" required></div>
                  </div>
                  <div class="f-field">
                    <label>RNC / Cédula</label>
                    <div class="f-box"><input type="text" id="qRnc" placeholder="1-30-12345-6" required></div>
                  </div>
                  <div class="f-field full">
                    <label>Dirección de Obra en RD</label>
                    <div class="f-box"><input type="text" id="qAddr" placeholder="Sector, calle o referencia del proyecto" required></div>
                  </div>

                  <div class="f-field full">
                    <label class="switch-row">
                      <div>
                        <strong>Comprobante Crédito Fiscal (NCF B01)</strong>
                        <span>Agrega ITBIS 18% desglosado</span>
                      </div>
                      <input type="checkbox" id="qNcf" checked style="display:none;" onchange="window.GM_DETAIL.calcReceipt()">
                      <div class="sw-knob"></div>
                    </label>
                  </div>

                  <div class="f-field full">
                    <label>Firma Táctil del Contratista <small style="color:var(--orange); cursor:pointer;" onclick="window.GM_DETAIL.clearSig()">Limpiar</small></label>
                    <div class="sig-pad">
                      <canvas id="sigCanvas" width="520" height="100"></canvas>
                      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Firma aquí con el dedo o cursor</div>
                    </div>
                  </div>
                </div>

                <div class="receipt" id="qReceipt"></div>
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top:14px; padding:13px;">Firmar y Generar Contrato PDF</button>
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
    setupSig();
    calcReceipt();
  }

  window.GM_DETAIL = {
    copyShareLink,
    nativeShare,
    toggleFavorite,
    openSheet,
    closeSheet,
    activatePro,
    calcReceipt,
    clearSig,
    confirmRent
  };

  renderPage();
})();
