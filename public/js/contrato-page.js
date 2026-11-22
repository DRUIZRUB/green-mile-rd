/* Green Mile RD — Dedicated Detail Page for Signed Contract, e-CF Invoice & Gov Dossier */
(function () {
  'use strict';

  const GM = window.GM_CATALOG;
  const FB = window.GM_FIREBASE;
  const BILL = window.GM_BILLING;
  const LOGO_SRC = './logo.png?v=20261122-6';

  let currentBooking = null;
  let activeDocTab = 'contract';
  let isNewlyCreated = false;
  let unsubBooking = null;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2800);
  }

  function decodeHashBooking(hashStr) {
    const m = String(hashStr || '').match(/bk=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      return obj && obj.id != null ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function getAuthenticatedOwner() {
    return (FB && FB.getCurrentOwner) ? FB.getCurrentOwner() : null;
  }

  function syncBackLink() {
    const backLink = document.getElementById('backPanelLink');
    const backLabel = document.getElementById('backLinkLabel');
    const owner = getAuthenticatedOwner();
    if (!backLink) return;
    if (owner) {
      backLink.href = './index.html?tab=profile';
      if (backLabel) backLabel.textContent = 'Mi Panel';
    } else {
      backLink.href = './index.html';
      if (backLabel) backLabel.textContent = 'Catálogo';
    }
  }

  function renderErrorState(title, message, showLoginCta = false) {
    const root = document.getElementById('contractPageRoot');
    if (!root) return;
    const owner = getAuthenticatedOwner();
    root.innerHTML = `
      <div class="state-card">
        <div style="font-size:38px; margin-bottom:10px;">${showLoginCta ? '🔒' : '📄'}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          ${showLoginCta
            ? `<a class="btn btn-primary" href="./index.html?login=1&next=profile">👤 Iniciar Sesión en Green Mile RD</a>`
            : ''}
          <a class="btn btn-navy" href="${owner ? './index.html?tab=profile' : './index.html'}">← ${owner ? 'Volver a Mi Panel' : 'Ir al Catálogo'}</a>
        </div>
      </div>
    `;
  }

  function switchDocTab(tab) {
    activeDocTab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('doc', tab);
    window.history.replaceState({}, '', url.toString());
    renderDocumentPage();
  }

  async function copyDocumentLink() {
    const shareUrl = window.location.href.split('#')[0];
    try {
      if (GM && GM.copyToClipboard) {
        await GM.copyToClipboard(shareUrl);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      toast('✓ Enlace del expediente copiado');
    } catch (_) {
      toast('Copia la dirección directamente desde tu navegador');
    }
  }

  function renderDocumentPage() {
    const root = document.getElementById('contractPageRoot');
    if (!root || !currentBooking || !BILL) return;

    const b = BILL.normalizeBooking(currentBooking);
    const isGov = b.ncfType === 'E45';
    if (activeDocTab === 'gov' && !isGov) activeDocTab = 'contract';

    const pBadge = BILL.paymentStatusBadge(b);
    const contractCode = `#GM-${String(b.id).slice(-6)}`;
    const isDispatchReady = (
      b.paymentStatus === 'paid' ||
      b.stage === 'invoiced_dispatched' ||
      b.stage === 'conduce_signed' ||
      b.stage === 'gov_filed' ||
      b.stage === 'settled'
    );

    document.title = `Contrato ${contractCode} — ${b.title || 'Expediente Digital'} | Green Mile RD`;

    let docHtml = '';
    if (activeDocTab === 'invoice') {
      docHtml = BILL.buildPrintableInvoiceHtml(b, null, LOGO_SRC);
    } else if (activeDocTab === 'gov' && isGov) {
      docHtml = BILL.buildGovDossierHtml(b, null, LOGO_SRC);
    } else {
      docHtml = BILL.buildPrintableContractHtml(b, null, LOGO_SRC);
    }

    const trackClientHref = `./tracking.html?booking=${encodeURIComponent(b.id)}`;
    const absTrackClient = new URL(trackClientHref, window.location.href).href;
    const waTrackMsg = encodeURIComponent(
      `🚚 *Seguimiento de Despacho — Green Mile RD*\nContrato ${contractCode} • ${b.title}\nObra: ${b.address}\n\nSigue la unidad rumbo a obra en tiempo real:\n${absTrackClient}`
    );

    const dispatchBanner = isDispatchReady
      ? `
        <div class="no-print" style="padding:16px 18px; border-radius:16px; background:var(--surface); border:1.5px solid #DCE5F0; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; box-shadow:var(--shadow-sm);">
          <div style="min-width:220px; flex:1;">
            <div style="font-size:11.5px; font-weight:800; color:var(--navy); text-transform:uppercase; letter-spacing:0.04em;">🚚 Seguimiento de Despacho a Obra</div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:3px;">Sigue en el mapa la ruta del equipo en lowboy con ETA real y llegada a obra.</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <a class="btn btn-primary" href="${trackClientHref}">🗺️ Seguir Despacho GPS</a>
            <a class="btn btn-ghost" style="color:#15803D; border-color:#BBF7D0; background:#F0FDF4;" href="https://wa.me/?text=${waTrackMsg}" target="_blank" rel="noopener">📲 Compartir WhatsApp</a>
          </div>
        </div>
      `
      : `
        <div class="no-print" style="padding:14px 18px; border-radius:16px; background:#FFFBEB; border:1px solid #FDE68A; font-size:13px; color:#92400E; line-height:1.55;">
          <strong>📍 Despacho y Seguimiento GPS (etapa posterior al contrato):</strong> Una vez Administración valide ${isGov ? 'tu Orden de Compra / expediente estatal (e-CF 45)' : 'tu pago / transferencia'} y autorice la salida de la unidad, se habilitará el enlace de seguimiento GPS en vivo rumbo a la obra.
        </div>
      `;

    const owner = getAuthenticatedOwner();
    const createdBannerHtml = isNewlyCreated
      ? `
        <div class="created-banner no-print" style="display:flex;">
          <span>✓ Contrato digital firmado y expediente ${esc(contractCode)} registrado correctamente.</span>
          <button type="button" class="btn btn-navy" style="padding:8px 14px; font-size:12px;" onclick="window.print()">🖨️ Descargar / Imprimir PDF</button>
        </div>
      `
      : '';

    root.innerHTML = `
      ${createdBannerHtml}

      <section class="doc-summary-card no-print">
        <div class="doc-summary-top">
          <div>
            <div class="doc-badges">
              <span class="doc-pill" style="background:${isGov ? '#EFF6FF' : '#0D223A'}; color:${isGov ? '#1E40AF' : '#fff'};">${esc(b.ncfType || 'E31')}</span>
              <span class="doc-pill" style="background:${pBadge.bg}; color:${pBadge.color};">${esc(pBadge.text)}</span>
              <span class="doc-pill" style="background:var(--orange-soft); color:var(--orange);">${esc(contractCode)}</span>
              ${b.encfNumber ? `<span class="doc-pill" style="background:#F8FAFC; border:1px solid var(--border); color:var(--navy); font-family:monospace;">${esc(b.encfNumber)}</span>` : ''}
            </div>
            <h1 class="doc-title">${esc(b.title || 'Contrato de Alquiler de Maquinaria')}</h1>
            <div class="doc-meta">
              <strong>Contratista:</strong> ${esc(b.renter || 'N/A')} ${b.renterRnc ? `(${esc(b.renterRnc)})` : ''} •
              <strong>Obra:</strong> ${esc(b.address || b.city || 'República Dominicana')}
              ${b.startDate ? ` • <strong>Fechas:</strong> ${esc(b.startDate)}${b.endDate && b.endDate !== b.startDate ? ' → ' + esc(b.endDate) : ''}` : ''}
            </div>
          </div>

          <div class="doc-total-box">
            <small>Total Facturado</small>
            <strong>${BILL.fmtRD(b.total || 0)}</strong>
          </div>
        </div>

        <div class="doc-tabs ${isGov ? 'three-cols' : ''}" role="tablist" aria-label="Documentos del expediente">
          <button type="button" class="doc-tab ${activeDocTab === 'contract' ? 'active' : ''}" onclick="window.GM_CONTRACT_PAGE.switchDocTab('contract')">📄 Contrato Digital</button>
          <button type="button" class="doc-tab ${activeDocTab === 'invoice' ? 'active' : ''}" onclick="window.GM_CONTRACT_PAGE.switchDocTab('invoice')">🧾 ${b.encfNumber ? 'Factura ' + esc(b.ncfType) : 'Proforma ' + esc(b.ncfType)}</button>
          ${isGov ? `<button type="button" class="doc-tab ${activeDocTab === 'gov' ? 'active' : ''}" onclick="window.GM_CONTRACT_PAGE.switchDocTab('gov')">🏛️ Expediente Estado E45</button>` : ''}
        </div>
      </section>

      <article class="doc-paper-stage" id="printableDocumentSheet">
        ${docHtml}
      </article>

      <section class="doc-actions-card no-print">
        ${dispatchBanner}

        <div class="doc-toolbar">
          <div class="doc-toolbar-group">
            <button type="button" class="btn btn-navy" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
            <button type="button" class="btn btn-ghost" onclick="window.GM_CONTRACT_PAGE.copyDocumentLink()">🔗 Copiar Enlace</button>
          </div>
          <div class="doc-toolbar-group">
            ${owner ? `<a class="btn btn-ghost" href="./index.html?tab=profile">← Volver a Mi Panel</a>` : `<a class="btn btn-ghost" href="./index.html">← Explorar Catálogo</a>`}
            ${owner ? `<a class="btn btn-ghost" href="./admin.html">⚙️ Centro Administrativo</a>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  async function init() {
    syncBackLink();

    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking');
    const requestedDoc = params.get('doc');
    isNewlyCreated = params.get('created') === '1';

    if (requestedDoc && ['contract', 'invoice', 'gov'].includes(requestedDoc)) {
      activeDocTab = requestedDoc;
    }

    const hashBooking = decodeHashBooking(window.location.hash);

    if (!bookingId && !hashBooking) {
      renderErrorState(
        'Expediente no especificado',
        'Selecciona un contrato o factura e-CF desde tu Panel para visualizar su detalle completo.',
        !getAuthenticatedOwner()
      );
      return;
    }

    // 1. Instant local lookup
    const state = GM ? GM.loadState() : { bookings: [] };
    const localList = Array.isArray(state.bookings) ? state.bookings : [];
    let found = bookingId
      ? localList.find((x) => String(x.id) === String(bookingId)) || null
      : null;

    if (!found && hashBooking) {
      found = hashBooking;
    }

    if (found) {
      currentBooking = found;
      renderDocumentPage();
    }

    // 2. Fetch latest record from Cloud Firestore
    if (bookingId && FB && FB.isReady()) {
      try {
        const cloudDoc = await FB.getBookingById(bookingId);
        if (cloudDoc) {
          currentBooking = cloudDoc;
          renderDocumentPage();
        }
      } catch (_) {}

      if (FB.subscribeBookingById) {
        unsubBooking = FB.subscribeBookingById(bookingId, (liveDoc) => {
          if (liveDoc) {
            currentBooking = liveDoc;
            renderDocumentPage();
          }
        });
      }
    }

    if (!currentBooking) {
      renderErrorState(
        'No encontramos este contrato',
        'Es posible que el enlace haya expirado o que necesites iniciar sesión en la cuenta correspondiente.',
        !getAuthenticatedOwner()
      );
    }
  }

  window.GM_CONTRACT_PAGE = {
    switchDocTab,
    copyDocumentLink
  };

  window.addEventListener('beforeunload', () => {
    try { if (unsubBooking) unsubBooking(); } catch (_) {}
  });

  init();
})();
