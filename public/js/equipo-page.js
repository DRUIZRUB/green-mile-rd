/* Green Mile Construction RD — Página Individual de Anuncio con Facturación e-CF, Pago con Tarjeta y Flujo Gubernamental E45 */
(function () {
  const GM = window.GM_CATALOG;
  const BILL = window.GM_BILLING;
  const CFG = window.GM_PAGE || { basePrefix: './', equipmentId: null };
  const BASE = CFG.basePrefix || './';

  let state = GM.loadState();
  let currentItem = null;
  let sigSigned = false;
  let selectedNcfType = 'E31';
  let selectedPaymentMethod = 'card';
  let activeContractRecord = null;
  let activeContractTab = 'contract';

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
    toast._t = setTimeout(() => { el.style.display = 'none'; }, 3200);
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

  async function copyBankAccount(acctNum) {
    try {
      await GM.copyToClipboard(acctNum);
      toast(`Cuenta ${acctNum} copiada`);
    } catch (_) {
      toast('No se pudo copiar la cuenta');
    }
  }

  async function nativeShare() {
    if (!currentItem) return;
    const url = GM.getShareUrl(currentItem, BASE);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${currentItem.title} en ${currentItem.city} — Green Mile RD`,
          text: `${currentItem.title} (${GM.fmtRD(currentItem.priceDay)}/día) en ${currentItem.city}. Alquiler directo con e-NCF en Green Mile RD.`,
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

  /* =========================================================
     SELECTOR DE COMPROBANTE e-CF Y MÉTODO DE PAGO
     ========================================================= */
  function selectNcfType(code, autoSwitchPay = true) {
    if (!BILL || !BILL.NCF_TYPES[code]) return;
    selectedNcfType = code;

    document.querySelectorAll('.ncf-card').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.ncf === code);
    });

    const govPanel = document.getElementById('govFieldsPanel');
    const exemptPanel = document.getElementById('exemptFieldsPanel');
    const govBanner = document.getElementById('govDetectBanner');

    if (govPanel) govPanel.style.display = code === 'E45' ? 'flex' : 'none';
    if (exemptPanel) exemptPanel.style.display = code === 'E44' ? 'flex' : 'none';
    if (govBanner && code === 'E45') govBanner.style.display = 'none';

    if (autoSwitchPay) {
      if (code === 'E45') {
        selectPaymentMethod('gov_po');
      } else if (selectedPaymentMethod === 'gov_po') {
        selectPaymentMethod('card');
      }
    }

    updateSubmitButtonLabel();
    calcReceipt();
  }

  function selectPaymentMethod(methodId) {
    if (!BILL || !BILL.PAYMENT_METHODS[methodId]) return;
    selectedPaymentMethod = methodId;

    document.querySelectorAll('.pay-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.pay === methodId);
    });

    const cardBox = document.getElementById('payCardPanel');
    const transferBox = document.getElementById('payTransferPanel');
    const govPayBox = document.getElementById('payGovPoPanel');
    const creditBox = document.getElementById('payCreditPanel');

    if (cardBox) cardBox.style.display = methodId === 'card' ? 'flex' : 'none';
    if (transferBox) transferBox.style.display = methodId === 'transfer' ? 'flex' : 'none';
    if (govPayBox) govPayBox.style.display = methodId === 'gov_po' ? 'flex' : 'none';
    if (creditBox) creditBox.style.display = methodId === 'credit' ? 'flex' : 'none';

    updateSubmitButtonLabel();
    calcReceipt();
  }

  function updateSubmitButtonLabel() {
    const btn = document.getElementById('bookingSubmitBtn');
    if (!btn) return;
    const b = currentBreakdown();
    if (selectedPaymentMethod === 'card') {
      btn.textContent = `💳 Pagar ${GM.fmtRD(b.total)} y Emitir ${selectedNcfType}`;
    } else if (selectedNcfType === 'E45' || selectedPaymentMethod === 'gov_po') {
      btn.textContent = `🏛️ Firmar y Radicar Expediente Estatal (e-CF 45)`;
    } else if (selectedPaymentMethod === 'transfer') {
      btn.textContent = `🏦 Firmar Contrato y Reservar (Transferencia)`;
    } else {
      btn.textContent = `📄 Firmar y Solicitar Crédito Corporativo`;
    }
  }

  function onCardNumberInput(el) {
    if (!BILL) return;
    el.value = BILL.formatCardNumber(el.value);
    const brand = BILL.detectCardBrand(el.value);
    const pill = document.getElementById('cardBrandPill');
    if (pill) {
      pill.textContent = brand.toUpperCase();
    }
  }

  function onCardExpiryInput(el) {
    if (!BILL) return;
    el.value = BILL.formatCardExpiry(el.value);
  }

  function currentBreakdown() {
    const it = currentItem;
    const mode = document.getElementById('qMode').value;
    const qty = Math.max(1, Number(document.getElementById('qQty').value) || 1);
    const trans = document.getElementById('qTrans').value === 'yes' ? (it.transportCost || 0) : 0;
    const govApplyItbisRet = Boolean(document.getElementById('qGovItbisRet')?.checked);

    let unit = it.priceDay, label = 'días';
    if (mode === 'hour') { unit = it.priceHour; label = 'horas'; }
    if (mode === 'week') { unit = it.priceWeek; label = 'semanas'; }

    const base = unit * qty;
    const disc = state.isPro ? Math.round(base * 0.10) : 0;

    if (BILL) {
      const fin = BILL.calculateFinancials({
        baseAmount: base,
        proDiscount: disc,
        transportCost: trans,
        ncfType: selectedNcfType,
        paymentMethod: selectedPaymentMethod,
        govApplyItbisRet,
        ownerRnc: it.rnc || ''
      });
      return Object.assign(fin, { qty, unit, label, govApplyItbisRet, ncf: selectedNcfType !== 'E32' });
    }

    const net = base - disc + trans;
    const itbis = Math.round(net * 0.18);
    return { qty, unit, label, base, disc, trans, netSubtotal: net, itbis, total: net + itbis, ncf: true, ncfType: 'E31' };
  }

  function calcReceipt() {
    const box = document.getElementById('qReceipt');
    if (!currentItem || !box) return;
    const b = currentBreakdown();
    const ncfMeta = (BILL && BILL.NCF_TYPES[b.ncfType]) || { badge: 'e-CF 31', isExempt: false, isGov: false };

    box.innerHTML = `
      <div class="r-row"><span>${GM.fmtRD(b.unit)} × ${b.qty} ${b.label}</span><span>${GM.fmtRD(b.base)}</span></div>
      ${b.disc > 0 ? `<div class="r-row" style="color:var(--success); font-weight:700;"><span>Descuento Pro (-10%)</span><span>- ${GM.fmtRD(b.disc)}</span></div>` : ''}
      ${b.trans > 0 ? `<div class="r-row"><span>Traslado Lowboy</span><span>${GM.fmtRD(b.trans)}</span></div>` : ''}
      <div class="r-row">
        <span>${ncfMeta.isExempt ? 'ITBIS 0% (Exento · e-CF 44)' : `ITBIS 18% (${ncfMeta.badge})`}</span>
        <span>${GM.fmtRD(b.itbis)}</span>
      </div>
      <div class="r-total"><span>Total a Facturar (${ncfMeta.badge})</span><span>${GM.fmtRD(b.total)}</span></div>
      ${ncfMeta.isGov ? `
        <div class="r-subnote">
          <strong style="font-size:11px; color:#1E40AF;">Proyección de Retenciones Estatales al Libramiento:</strong>
          <div class="r-row"><span>(−) Retención 5% ISR Estado (Art. 309)</span><span>− ${GM.fmtRD(b.govIsrRetention)}</span></div>
          ${b.govItbisRetention > 0 ? `<div class="r-row"><span>(−) Retención 30% ITBIS (Norma 02-05)</span><span>− ${GM.fmtRD(b.govItbisRetention)}</span></div>` : ''}
          <div class="r-row" style="font-weight:800;"><span>Desembolso Neto Tesorería SIGEF</span><span>${GM.fmtRD(b.expectedTreasuryNet)}</span></div>
        </div>
      ` : ''}
      ${selectedPaymentMethod === 'card' ? `
        <div style="margin-top:8px; font-size:11px; color:#065F46; font-weight:700;">
          ⚡ Cargo inmediato con tarjeta • Emisión automática de ${ncfMeta.badge} y bloqueo de fechas al instante.
        </div>
      ` : ''}
    `;
    updateSubmitButtonLabel();
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
      b.stage !== 'cancelled' && (String(b.equipmentId) === String(currentItem.id) || b.title === currentItem.title)
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

    const ncfMeta = BILL.NCF_TYPES[selectedNcfType] || BILL.NCF_TYPES.E31;

    if (dgiiController) {
      const check = await dgiiController.validateBeforeSubmit({
        requireActiveForNcf: ncfMeta.requiresActiveRnc,
        ncfCode: selectedNcfType
      });
      if (!check.valid) {
        toast(check.error);
        document.getElementById('qRnc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // Validación Comprobante Gubernamental (e-CF 45)
    let govData = { poNumber: '', capNumber: '', entityEmail: '', paymentTermsDays: 45 };
    if (selectedNcfType === 'E45') {
      const poNumber = (document.getElementById('qGovPo')?.value || '').trim();
      const capNumber = (document.getElementById('qGovCap')?.value || '').trim();
      const entityEmail = (document.getElementById('qGovEmail')?.value || '').trim();
      const paymentTermsDays = Number(document.getElementById('qGovTerms')?.value || 45);
      if (poNumber.length < 3) {
        toast('Ingresa el No. de Orden de Compra o Contrato DGCP para facturación estatal (e-CF 45)');
        document.getElementById('qGovPo')?.focus();
        return;
      }
      if (!entityEmail || !entityEmail.includes('@')) {
        toast('Ingresa el correo institucional de la unidad de Compras o Cuentas por Pagar');
        document.getElementById('qGovEmail')?.focus();
        return;
      }
      govData = { poNumber, capNumber, entityEmail, paymentTermsDays };
    }

    // Validación Régimen Especial (e-CF 44)
    let exemptionCode = '';
    if (selectedNcfType === 'E44') {
      exemptionCode = (document.getElementById('qExemptCode')?.value || '').trim();
      if (exemptionCode.length < 4) {
        toast('Ingresa el No. de Resolución o Carnet de Exención DGII para aplicar e-CF 44 (ITBIS 0%)');
        document.getElementById('qExemptCode')?.focus();
        return;
      }
    }

    // Validación de Tarjeta (si eligió pago con tarjeta)
    let cardInfo = null;
    if (selectedPaymentMethod === 'card') {
      const cardCheck = BILL.validateCard({
        holder: document.getElementById('cHolder')?.value,
        number: document.getElementById('cNumber')?.value,
        expiry: document.getElementById('cExpiry')?.value,
        cvv: document.getElementById('cCvv')?.value
      });
      if (!cardCheck.valid) {
        toast(cardCheck.error);
        document.getElementById('payCardPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      cardInfo = {
        brand: cardCheck.brand,
        last4: cardCheck.last4,
        holder: cardCheck.holder,
        expiry: cardCheck.expiry,
        authCode: cardCheck.authCode,
        processedAt: cardCheck.processedAt
      };
    }

    if (!sigSigned) {
      toast('Dibuja tu firma en pantalla para continuar');
      document.getElementById('sigCanvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const submitBtn = document.getElementById('bookingSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = selectedPaymentMethod === 'card'
        ? '🔒 Autorizando tarjeta (3D Secure) y emitiendo e-NCF…'
        : '⏳ Registrando contrato y expediente fiscal…';
    }

    if (selectedPaymentMethod === 'card') {
      await new Promise(r => setTimeout(r, 650));
    }

    const b = currentBreakdown();
    const sig = document.getElementById('sigCanvas').toDataURL('image/png');
    const isCardPaid = selectedPaymentMethod === 'card';
    const issued = isCardPaid ? BILL.issueNextEncf(selectedNcfType) : null;

    const initialStage = selectedNcfType === 'E45'
      ? (isCardPaid ? 'invoiced_dispatched' : 'gov_review')
      : (isCardPaid ? 'invoiced_dispatched' : 'pending_validation');

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
      startDate: calState.start,
      endDate: calState.end || calState.start,
      qty: b.qty,
      unitLabel: b.label,
      baseAmount: b.base,
      proDiscount: b.disc,
      transportCost: b.trans,
      netSubtotal: b.netSubtotal,
      itbis: b.itbis,
      total: b.total,
      ncf: selectedNcfType !== 'E32',
      ncfType: selectedNcfType,
      encfNumber: issued ? issued.encf : '',
      encfSecurityCode: issued ? issued.securityCode : '',
      encfExpires: issued ? issued.expires : '',
      encfIssuedAt: issued ? issued.issuedAt : '',
      exemptionCode,
      paymentMethod: selectedPaymentMethod,
      paymentStatus: isCardPaid ? 'paid' : 'pending',
      cardInfo,
      transferBank: selectedPaymentMethod === 'transfer' ? (document.getElementById('qTransferBank')?.value || '') : '',
      transferRef: selectedPaymentMethod === 'transfer' ? (document.getElementById('qTransferRef')?.value || '').trim() : '',
      govApplyItbisRet: b.govApplyItbisRet,
      govIsrRetention: b.govIsrRetention,
      govItbisRetention: b.govItbisRetention,
      cardGatewayFee: b.cardGatewayFee,
      cardItbisRetention: b.cardItbisRetention,
      gmCommissionPct: b.gmCommissionPct,
      govData,
      govChecklist: selectedNcfType === 'E45' ? {
        rncVerified: true,
        poReceived: Boolean(govData.poNumber),
        capVerified: Boolean(govData.capNumber),
        compliancePack: true,
        conduceStamped: false,
        encfFiled: Boolean(issued),
        treasuryPaid: isCardPaid,
        isrLetterReceived: false
      } : {},
      stage: initialStage,
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
    if (submitBtn) {
      submitBtn.disabled = false;
      updateSubmitButtonLabel();
    }

    openContract(rec, isCardPaid ? 'invoice' : 'contract');
    toast(isCardPaid
      ? `✓ Pago aprobado (${cardInfo.authCode}) y ${rec.encfNumber} emitido`
      : (selectedNcfType === 'E45'
        ? '✓ Expediente Gubernamental (e-CF 45) registrado y enviado a Administración'
        : '✓ Contrato firmado y reserva enviada a validación'));
  }

  function switchContractTab(tab) {
    activeContractTab = tab;
    renderContractModalBody();
  }

  function renderContractModalBody() {
    if (!activeContractRecord || !BILL) return;
    const b = activeContractRecord;
    const logoSrc = BASE + 'logo.png';
    const isGov = (b.ncfType === 'E45');

    let docHtml = '';
    if (activeContractTab === 'invoice') {
      docHtml = BILL.buildPrintableInvoiceHtml(b, null, logoSrc);
    } else if (activeContractTab === 'gov' && isGov) {
      docHtml = BILL.buildGovDossierHtml(b, null, logoSrc);
    } else {
      docHtml = BILL.buildPrintableContractHtml(b, null, logoSrc);
    }

    document.getElementById('contractBody').innerHTML = `
      <div class="doc-tabs no-print">
        <button type="button" class="doc-tab ${activeContractTab === 'contract' ? 'active' : ''}" onclick="window.GM_DETAIL.switchContractTab('contract')">📄 Contrato Digital</button>
        <button type="button" class="doc-tab ${activeContractTab === 'invoice' ? 'active' : ''}" onclick="window.GM_DETAIL.switchContractTab('invoice')">🧾 ${b.encfNumber ? 'Factura ' + esc(b.ncfType) : 'Proforma ' + esc(b.ncfType)}</button>
        ${isGov ? `<button type="button" class="doc-tab ${activeContractTab === 'gov' ? 'active' : ''}" onclick="window.GM_DETAIL.switchContractTab('gov')">🏛️ Carátula Estado</button>` : ''}
      </div>
      ${docHtml}
      <div class="no-print" style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button type="button" class="btn btn-navy" style="flex:1;" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
        <a class="btn btn-ghost" href="${BASE}admin.html" style="font-size:12px;">⚙️ Gestionar en Admin</a>
      </div>
    `;
  }

  function openContract(b, initialTab = 'contract') {
    activeContractRecord = b;
    activeContractTab = initialTab;
    renderContractModalBody();
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
    const adminCfg = BILL ? BILL.loadAdminConfig() : { banks: [], rpeNumber: 'RPE Activo' };
    const shareUrl = GM.getShareUrl(it, BASE);
    const shareText = getShareText(it, shareUrl);
    const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const GREEN_MILE_WA = adminCfg.whatsapp || '18095550100';
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

    const banksHtml = (adminCfg.banks || []).map(bk => `
      <div class="bank-row">
        <div>
          <strong>${esc(bk.bank)}</strong>
          <span>${esc(bk.type)} • <code>${esc(bk.number)}</code></span>
        </div>
        <button type="button" class="bank-copy-btn" onclick="window.GM_DETAIL.copyBankAccount('${esc(bk.number)}')">Copiar</button>
      </div>
    `).join('');

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
                <div class="spec-item"><span>Traslado Lowboy (Ida)</span><strong>${it.transportCost > 0 ? GM.fmtRD(it.transportCost) : 'Incluido / Retiro en patio'}</strong></div>
                <div class="spec-item"><span>Disponibilidad</span><strong id="specAvail">${it.busy ? 'En Obra (consultar fecha)' : 'Disponible Hoy'}</strong></div>
                <div class="spec-item"><span>Facturación e-CF DGII</span><strong>e-CF 31 · 32 · 45 (Estado) · 44</strong></div>
              </div>

              <h3 class="section-label">Descripción y Aditamentos</h3>
              <p class="desc-text">${esc(it.desc)}</p>

              <!-- GESTIÓN CENTRALIZADA GREEN MILE RD -->
              <div class="owner-card">
                <div class="owner-meta">
                  <small>Cobro, Facturación y Garantía • Green Mile RD</small>
                  <strong>Equipo Verificado #GM-${esc(it.id)}</strong>
                  <span>Tarjeta · Transferencia · Proveedor del Estado (${esc(adminCfg.rpeNumber)}) • Facturación e-NCF</span>
                </div>
                <div class="owner-actions">
                  <a class="btn btn-wa" target="_blank" rel="noopener" href="${waOwnerHref}">💬 Solicitar vía Green Mile</a>
                  <a class="btn btn-ghost" style="background:rgba(255,255,255,0.12); color:#fff; border-color:rgba(255,255,255,0.28);" href="${telHref}">📞 Llamar</a>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- COLUMNA DERECHA: COTIZADOR + FACTURACIÓN e-CF + PAGO + FIRMA -->
        <aside class="booking-col" id="bookingBox">
          <div class="panel">
            <div class="booking-head">
              <div>
                <h2>Cotizar, Facturar y Pagar</h2>
                <p>e-CF 31 / 32 / 45 (Estado) • Tarjeta o Transferencia</p>
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
                        <option value="yes">${it.transportCost > 0 ? 'Con traslado a obra (' + GM.fmtRD(it.transportCost) + ')' : 'Traslado incluido (RD$ 0)'}</option>
                        <option value="no">Retiro directo en patio (RD$ 0)</option>
                      </select>
                    </div>
                  </div>

                  <!-- DATOS FISCALES + VALIDACIÓN DGII -->
                  <div class="f-field full">
                    <label>RNC (9 dígitos) o Cédula <small class="req-tag">Validación DGII</small></label>
                    <div class="f-box"><input type="text" id="qRnc" inputmode="numeric" placeholder="Ej. 1-01-01992-1 o 4-01-00755-1" enterkeyhint="next" required></div>
                  </div>
                  <div class="f-field full">
                    <label>Contratista / Institución (Razón Social DGII) <small class="req-tag">Búsqueda en vivo</small></label>
                    <div class="f-box"><input type="text" id="qRenter" placeholder="Escribe empresa, institución o autocompleta por RNC" enterkeyhint="next" required></div>
                    <div id="qDgiiSuggestions" class="dgii-sugg-list"></div>
                    <div id="qDgiiStatus" class="dgii-badge" style="display:none;"></div>
                    <div id="govDetectBanner" class="gov-detect-banner" style="display:none; margin-top:4px;">
                      <span>🏛️ Detectamos una <strong>institución del Estado</strong> en DGII. Aplica <strong>e-CF 45 (Gubernamental)</strong>.</span>
                      <button type="button" onclick="window.GM_DETAIL.selectNcfType('E45', true)">Activar e-CF 45</button>
                    </div>
                  </div>
                  <div class="f-field full">
                    <label>Dirección de Obra en RD</label>
                    <div class="f-box"><input type="text" id="qAddr" placeholder="Sector, calle o referencia del proyecto" enterkeyhint="next" required></div>
                  </div>

                  <!-- MODO DE FACTURACIÓN ELECTRÓNICA (e-CF / DGII) -->
                  <div class="f-field full">
                    <label>Modo de Facturación (e-CF · DGII) <small class="req-tag">Ley 32-23</small></label>
                    <div class="ncf-grid">
                      <button type="button" class="ncf-card selected" data-ncf="E31" onclick="window.GM_DETAIL.selectNcfType('E31', true)">
                        <span class="ncf-code"><span>e-CF 31</span><span>ITBIS 18%</span></span>
                        <strong>Crédito Fiscal</strong>
                        <small>Empresas y constructoras (antes B01)</small>
                      </button>
                      <button type="button" class="ncf-card" data-ncf="E32" onclick="window.GM_DETAIL.selectNcfType('E32', true)">
                        <span class="ncf-code"><span>e-CF 32</span><span>ITBIS 18%</span></span>
                        <strong>Consumo</strong>
                        <small>Particular / Cédula (antes B02)</small>
                      </button>
                      <button type="button" class="ncf-card" data-ncf="E45" onclick="window.GM_DETAIL.selectNcfType('E45', true)">
                        <span class="ncf-code"><span>e-CF 45</span><span>5% ISR</span></span>
                        <strong>🏛️ Gubernamental</strong>
                        <small>Estado, Ministerios y Alcaldías (antes B15)</small>
                      </button>
                      <button type="button" class="ncf-card" data-ncf="E44" onclick="window.GM_DETAIL.selectNcfType('E44', true)">
                        <span class="ncf-code"><span>e-CF 44</span><span>0% Exento</span></span>
                        <strong>Régimen Especial</strong>
                        <small>Zona Franca / CONFOTUR (antes B14)</small>
                      </button>
                    </div>
                  </div>

                  <!-- BLOQUE CONDICIONAL: EXPEDIENTE GUBERNAMENTAL e-CF 45 -->
                  <div id="govFieldsPanel" class="f-field full sub-panel gov-panel" style="display:none;">
                    <div class="sub-panel-head">
                      <strong>🏛️ Expediente Gubernamental (e-CF 45 · Ley 340-06)</strong>
                      <span class="dgii-pill ok" style="background:#1D4ED8;">${esc(adminCfg.rpeNumber)}</span>
                    </div>
                    <div class="sub-panel-note">
                      <strong>¿Cómo gestiona Green Mile RD tu comprobante gubernamental?</strong>
                      <ul>
                        <li>Validamos el RNC estatal (Norma 05-19) y adjuntamos nuestro paquete vigente: <strong>RPE activo + Certificación DGII + Certificación TSS</strong>.</li>
                        <li>Emitimos factura electrónica <strong>e-CF 45</strong> (antiguo B15) con ITBIS 18% transparentado y desglosamos la <strong>retención de ley 5% ISR Estado (Art. 309)</strong> al libramiento SIGEF.</li>
                        <li>Despachamos contra Orden de Compra verificada y radicamos expediente con Conduce sellado en Cuentas por Pagar.</li>
                      </ul>
                    </div>
                    <div class="f-field full">
                      <label>No. Orden de Compra / Contrato DGCP <small class="req-tag">* Obligatorio</small></label>
                      <div class="f-box"><input type="text" id="qGovPo" placeholder="Ej. MOPC-DAF-CM-2026-0148"></div>
                    </div>
                    <div class="f-field full">
                      <label>Certificación Apropiación Presupuestaria (CAP / SIGEF)</label>
                      <div class="f-box"><input type="text" id="qGovCap" placeholder="Ej. CAP-2026-00921 (opcional si ya figura en OC)"></div>
                    </div>
                    <div class="f-field full">
                      <label>Correo Institucional Compras / Cuentas por Pagar <small class="req-tag">* Obligatorio</small></label>
                      <div class="f-box"><input type="email" id="qGovEmail" placeholder="compras@institucion.gob.do"></div>
                    </div>
                    <div class="f-field full">
                      <label>Plazo de Libramiento Tesorería (SIGEF)</label>
                      <div class="f-box">
                        <select id="qGovTerms">
                          <option value="30">30 días contra recepción conformada</option>
                          <option value="45" selected>45 días (estándar institucional)</option>
                          <option value="60">60 días (proyectos de infraestructura)</option>
                        </select>
                      </div>
                    </div>
                    <label class="switch-row" style="background:#fff; padding:10px 12px;">
                      <div>
                        <strong style="font-size:12px;">Aplicar retención 30% ITBIS estatal</strong>
                        <span style="font-size:11px;">Marca si la entidad retiene 30% del ITBIS (Norma 02-05)</span>
                      </div>
                      <input type="checkbox" id="qGovItbisRet" style="display:none;" onchange="window.GM_DETAIL.calcReceipt()">
                      <div class="sw-knob"></div>
                    </label>
                  </div>

                  <!-- BLOQUE CONDICIONAL: EXENCIÓN e-CF 44 -->
                  <div id="exemptFieldsPanel" class="f-field full sub-panel" style="display:none;">
                    <div class="sub-panel-head">
                      <strong>🏷️ Regímenes Especiales (e-CF 44 · ITBIS 0%)</strong>
                    </div>
                    <div class="f-field full">
                      <label>No. Resolución / Carnet de Exención DGII <small class="req-tag">* Obligatorio</small></label>
                      <div class="f-box"><input type="text" id="qExemptCode" placeholder="Ej. RES-CONFOTUR-2026-0412 / ZF-0082"></div>
                    </div>
                    <div style="font-size:11.5px; color:var(--text-muted);">
                      Aplica a empresas de Zona Franca, proyectos turísticos amparados en Ley 158-01 (CONFOTUR) u organismos internacionales con certificación vigente DGII.
                    </div>
                  </div>

                  <!-- MÉTODO DE PAGO -->
                  <div class="f-field full">
                    <label>Forma de Pago</label>
                    <div class="pay-methods-list">
                      <button type="button" class="pay-opt selected" data-pay="card" onclick="window.GM_DETAIL.selectPaymentMethod('card')">
                        <strong>💳 Tarjeta</strong>
                        <small>Visa / MC / AMEX · 3DS</small>
                      </button>
                      <button type="button" class="pay-opt" data-pay="transfer" onclick="window.GM_DETAIL.selectPaymentMethod('transfer')">
                        <strong>🏦 Transferencia</strong>
                        <small>Popular · Banreservas · BHD</small>
                      </button>
                      <button type="button" class="pay-opt" data-pay="gov_po" onclick="window.GM_DETAIL.selectPaymentMethod('gov_po')">
                        <strong>🏛️ OC Estatal</strong>
                        <small>Libramiento SIGEF</small>
                      </button>
                      <button type="button" class="pay-opt" data-pay="credit" onclick="window.GM_DETAIL.selectPaymentMethod('credit')">
                        <strong>📄 Crédito Corp.</strong>
                        <small>15–30 días · Pro</small>
                      </button>
                    </div>
                  </div>

                  <!-- PANEL DE PAGO CON TARJETA -->
                  <div id="payCardPanel" class="f-field full sub-panel card-panel">
                    <div class="sub-panel-head">
                      <strong>💳 Pago Seguro con Tarjeta</strong>
                      <span class="card-brand-pill" id="cardBrandPill">VISA · MC · AMEX</span>
                    </div>
                    <div class="f-field full">
                      <label>Nombre en la Tarjeta</label>
                      <div class="f-box"><input type="text" id="cHolder" placeholder="COMO APARECE EN LA TARJETA" autocomplete="cc-name"></div>
                    </div>
                    <div class="f-field full">
                      <label>Número de Tarjeta</label>
                      <div class="f-box"><input type="text" id="cNumber" inputmode="numeric" maxlength="19" placeholder="4532 •••• •••• ••••" oninput="window.GM_DETAIL.onCardNumberInput(this)" autocomplete="cc-number"></div>
                    </div>
                    <div class="f-grid">
                      <div class="f-field">
                        <label>Vencimiento</label>
                        <div class="f-box"><input type="text" id="cExpiry" inputmode="numeric" maxlength="5" placeholder="MM/AA" oninput="window.GM_DETAIL.onCardExpiryInput(this)" autocomplete="cc-exp"></div>
                      </div>
                      <div class="f-field">
                        <label>CVV / CVC</label>
                        <div class="f-box"><input type="password" id="cCvv" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="cc-csc"></div>
                      </div>
                    </div>
                    <div class="card-security-row">
                      <span>🔒 Cifrado TLS + 3D Secure • PCI-DSS</span>
                      <span>Solo últimos 4 dígitos</span>
                    </div>
                  </div>

                  <!-- PANEL DE TRANSFERENCIA BANCARIA -->
                  <div id="payTransferPanel" class="f-field full sub-panel" style="display:none;">
                    <div class="sub-panel-head">
                      <strong>🏦 Cuentas Corporativas — ${esc(adminCfg.companyName)}</strong>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted);">RNC Beneficiario: <strong>${esc(adminCfg.rnc)}</strong></div>
                    ${banksHtml}
                    <div class="f-field full">
                      <label>Banco Origen</label>
                      <div class="f-box">
                        <select id="qTransferBank">
                          <option value="Banco Popular">Banco Popular Dominicano</option>
                          <option value="Banreservas">Banreservas</option>
                          <option value="Banco BHD">Banco BHD</option>
                          <option value="Scotiabank">Scotiabank RD</option>
                          <option value="Asociación Popular (APAP)">APAP / Banesco / Otro LBTR</option>
                        </select>
                      </div>
                    </div>
                    <div class="f-field full">
                      <label>No. de Referencia / Comprobante <small>Opcional ahora</small></label>
                      <div class="f-box"><input type="text" id="qTransferRef" placeholder="Ej. LBTR-8849201 (o envíalo luego por WhatsApp)"></div>
                    </div>
                  </div>

                  <!-- PANEL DE ORDEN DE COMPRA ESTATAL -->
                  <div id="payGovPoPanel" class="f-field full sub-panel gov-panel" style="display:none;">
                    <div class="sub-panel-head">
                      <strong>🏛️ Pago vía Tesorería Nacional / Libramiento SIGEF</strong>
                    </div>
                    <div style="font-size:11.5px; color:#1E3A8A; line-height:1.45;">
                      No requiere cargo en tarjeta. Al firmar, tu solicitud entra automáticamente al módulo de <strong>Gestión Gubernamental</strong> de Green Mile RD para verificar la Orden de Compra, emitir el <strong>e-CF 45</strong> y coordinar el despacho a obra pública.
                    </div>
                  </div>

                  <!-- PANEL DE CRÉDITO CORPORATIVO -->
                  <div id="payCreditPanel" class="f-field full sub-panel" style="display:none;">
                    <div class="sub-panel-head">
                      <strong>📄 Línea de Crédito Corporativo (15–30 días)</strong>
                    </div>
                    <div style="font-size:11.5px; color:var(--text-muted); line-height:1.45;">
                      Sujeto a validación de RNC activo en DGII y aprobación del departamento de Tesorería de Green Mile RD. La factura electrónica <strong>e-CF 31</strong> se emite contra confirmación del despacho.
                    </div>
                  </div>

                  <!-- FIRMA DIGITAL -->
                  <div class="f-field full">
                    <label>Firma Táctil del Contratista / Responsable <small style="color:var(--orange); cursor:pointer; font-weight:800;" onclick="window.GM_DETAIL.clearSig()">Limpiar firma</small></label>
                    <div class="sig-pad">
                      <canvas id="sigCanvas" width="520" height="118"></canvas>
                      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Firma aquí con el dedo o cursor</div>
                    </div>
                  </div>
                </div>

                <div class="receipt" id="qReceipt"></div>
                <button type="submit" id="bookingSubmitBtn" class="btn btn-primary" style="width:100%; margin-top:14px; min-height:50px; font-size:14.5px;">💳 Pagar y Emitir e-CF 31</button>
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
    selectNcfType(selectedNcfType, false);
    selectPaymentMethod(selectedPaymentMethod);
    calcReceipt();

    if (window.GM_DGII && window.GM_DGII.attachPair) {
      dgiiController = window.GM_DGII.attachPair({
        rncInputId: 'qRnc',
        nameInputId: 'qRenter',
        statusBoxId: 'qDgiiStatus',
        suggestionsBoxId: 'qDgiiSuggestions',
        onRecordChange: (rec) => {
          const banner = document.getElementById('govDetectBanner');
          if (!banner || !BILL) return;
          if (rec && rec.found && selectedNcfType !== 'E45') {
            const det = BILL.detectGovEntity(rec.digits, rec.razonSocial);
            banner.style.display = det.isLikelyGov ? 'flex' : 'none';
          } else {
            banner.style.display = 'none';
          }
        }
      });
    }
  }

  window.GM_DETAIL = {
    selectPhoto,
    copyShareLink,
    copyBankAccount,
    nativeShare,
    toggleFavorite,
    openSheet,
    closeSheet,
    activatePro,
    selectNcfType,
    selectPaymentMethod,
    onCardNumberInput,
    onCardExpiryInput,
    switchContractTab,
    calcReceipt,
    stepQty,
    clearSig,
    confirmRent,
    calPrevMonth,
    calNextMonth,
    calPickDate,
    calClear
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
    }
  }

  initPage();
})();
