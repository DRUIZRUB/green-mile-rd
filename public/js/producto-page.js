/* Green Mile RD — Dedicated Detail Page for Machinery Sales & Spare Parts (Live Buyer-Seller Chat + e-NCF Purchase) */
(function () {
  'use strict';

  const GM = window.GM_CATALOG;
  const FB = window.GM_FIREBASE;

  let currentKind = 'part'; // 'part' | 'sale'
  let currentItem = null;
  let activeRightTab = 'chat'; // 'chat' | 'buy'
  let allParts = [];
  let allSales = [];
  let chatMessages = [];
  let unsubChats = null;
  let dgiiController = null;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function digitsOnly(v) {
    return String(v || '').replace(/\D/g, '');
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

  function getPartCover(cat) {
    const found = (GM.PARTS_CATEGORIES || []).find((c) => c.id === cat);
    return found ? found.img : 'img/parts/part_hydraulics.jpg';
  }

  function getImages(item, isPart) {
    const imgs = [];
    if (Array.isArray(item.images)) {
      item.images.forEach((src) => { if (src && !imgs.includes(src)) imgs.push(src); });
    }
    if (item.img && !imgs.includes(item.img)) imgs.unshift(item.img);
    if (!imgs.length) imgs.push(isPart ? getPartCover(item.category) : GM.defaultCover(item.category));
    return imgs;
  }

  function isCurrentUserSeller() {
    const authOwner = (FB && FB.getCurrentOwner) ? FB.getCurrentOwner() : null;
    if (!authOwner || !currentItem) return false;
    const myRnc = digitsOnly(authOwner.rncDigits || authOwner.rncFormatted);
    return (
      (currentItem.ownerId && String(currentItem.ownerId) === String(authOwner.id)) ||
      (myRnc && myRnc === digitsOnly(currentItem.rnc))
    );
  }

  function selectGalleryImage(idx) {
    const imgs = getImages(currentItem, currentKind === 'part');
    const heroImg = document.getElementById('prodHeroImg');
    if (heroImg && imgs[idx]) heroImg.src = imgs[idx];
    document.querySelectorAll('.prod-thumb').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  }

  async function shareListing() {
    if (!currentItem) return;
    const isPart = currentKind === 'part';
    const price = isPart ? Number(currentItem.price || 0) : Number(currentItem.salePrice || 0);
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${currentItem.title} — Green Mile RD`,
          text: `${currentItem.title} (${GM.fmtRD(price)}) en ${currentItem.city || 'RD'}. Ver detalle en Green Mile RD:`,
          url: shareUrl
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await GM.copyToClipboard(shareUrl);
      toast('✓ Enlace copiado para compartir');
    } catch (_) {
      toast('Copia la URL directamente del navegador');
    }
  }

  function switchRightTab(tab) {
    activeRightTab = tab === 'buy' ? 'buy' : 'chat';
    const tabChatBtn = document.getElementById('tabBtnChat');
    const tabBuyBtn = document.getElementById('tabBtnBuy');
    const panelChat = document.getElementById('panelChatMode');
    const panelBuy = document.getElementById('panelBuyMode');
    if (tabChatBtn) tabChatBtn.classList.toggle('active', activeRightTab === 'chat');
    if (tabBuyBtn) tabBuyBtn.classList.toggle('active', activeRightTab === 'buy');
    if (panelChat) panelChat.style.display = activeRightTab === 'chat' ? 'block' : 'none';
    if (panelBuy) panelBuy.style.display = activeRightTab === 'buy' ? 'block' : 'none';
    if (activeRightTab === 'buy') updateReceipt();
  }

  function useQuickPrompt(text) {
    const input = document.getElementById('chatMsgInput');
    if (input) {
      input.value = text;
      input.focus();
    }
  }

  function formatShortTime(isoStr) {
    if (!isoStr) return 'Ahora';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return 'Ahora';
    }
  }

  function renderChatThread() {
    const box = document.getElementById('prodChatThread');
    if (!box) return;
    if (!chatMessages.length) {
      box.innerHTML = `
        <div class="chat-empty">
          <strong>💬 Pregunta o negocia directo con el vendedor</strong><br/>
          Confirma compatibilidad, pide medidas, agenda una inspección en patio o envía una oferta formal antes de cerrar tu compra con e-NCF.
        </div>
      `;
      return;
    }

    box.innerHTML = chatMessages.map((m) => {
      const isSellerMsg = m.senderRole === 'seller';
      const offerHtml = Number(m.offerPrice) > 0
        ? `<div class="chat-offer-pill">💰 Oferta propuesta: ${GM.fmtRD(Number(m.offerPrice))}</div>`
        : '';
      return `
        <div class="chat-bubble ${isSellerMsg ? 'seller' : 'buyer'}">
          <div class="chat-meta">
            <span>${isSellerMsg ? '🏢 Vendedor Verificado' : '👤 ' + esc(m.senderName || 'Cliente')}</span>
            <span>${esc(formatShortTime(m.createdAtIso))}</span>
          </div>
          <div>${esc(m.message)}</div>
          ${offerHtml}
        </div>
      `;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function submitChatMessage(e) {
    e.preventDefault();
    if (!currentItem) return;
    const msgEl = document.getElementById('chatMsgInput');
    const nameEl = document.getElementById('chatSenderName');
    const offerEl = document.getElementById('chatOfferPrice');
    const rawMsg = (msgEl?.value || '').trim();
    const senderName = (nameEl?.value || '').trim();
    const offerVal = Number(offerEl?.value || 0);

    if (rawMsg.length < 2) {
      toast('Escribe tu pregunta o propuesta para el vendedor');
      if (msgEl) msgEl.focus();
      return;
    }
    if (!senderName) {
      toast('Ingresa tu nombre o empresa para que el vendedor pueda responderte');
      if (nameEl) nameEl.focus();
      return;
    }

    const authOwner = (FB && FB.getCurrentOwner) ? FB.getCurrentOwner() : null;
    const isSeller = isCurrentUserSeller();
    const record = {
      id: Date.now(),
      itemId: String(currentItem.id),
      kind: currentKind,
      itemTitle: currentItem.title,
      sellerName: currentItem.owner || 'Vendedor Verificado',
      sellerRnc: currentItem.rnc || '',
      sellerOwnerId: currentItem.ownerId || '',
      senderRole: isSeller ? 'seller' : 'buyer',
      senderId: authOwner ? authOwner.id : 'guest',
      senderName,
      message: rawMsg,
      offerPrice: offerVal > 0 ? offerVal : 0,
      createdAtIso: new Date().toISOString()
    };

    chatMessages = [...chatMessages, record];
    renderChatThread();

    if (msgEl) msgEl.value = '';
    if (offerEl) offerEl.value = '';

    if (FB && FB.sendProductChatMessage) {
      await FB.sendProductChatMessage(record);
    }
    toast(isSeller ? '✓ Respuesta enviada al cliente' : '✓ Mensaje enviado al vendedor en Green Mile RD');
  }

  function updateReceipt() {
    if (!currentItem) return;
    const isPart = currentKind === 'part';
    const unitPrice = isPart ? Number(currentItem.price || 0) : Number(currentItem.salePrice || 0);
    const qtyEl = document.getElementById('buyQty');
    const qty = isPart ? Math.max(1, Number(qtyEl?.value || 1)) : 1;
    const subtotal = unitPrice * qty;
    const itbis = Math.round(subtotal * 0.18);
    const total = subtotal + itbis;

    const box = document.getElementById('prodReceiptBox');
    if (box) {
      box.innerHTML = `
        <div class="prod-r-row"><span>${isPart ? `Precio unitario × ${qty}` : 'Precio de venta acordado'}</span><strong>${GM.fmtRD(subtotal)}</strong></div>
        <div class="prod-r-row"><span>ITBIS (18% DGII • e-NCF)</span><span>${GM.fmtRD(itbis)}</span></div>
        <div class="prod-r-total"><span>Total Estimado (RD$)</span><span>${GM.fmtRD(total)}</span></div>
      `;
    }
    const btn = document.getElementById('prodSubmitBtn');
    if (btn) {
      btn.textContent = isPart
        ? `Confirmar Orden de Compra (${GM.fmtRD(total)})`
        : `Reservar Compra / Inspección (${GM.fmtRD(total)})`;
    }
  }

  async function submitOrder(e) {
    e.preventDefault();
    if (!currentItem) return;
    const isPart = currentKind === 'part';
    const unitPrice = isPart ? Number(currentItem.price || 0) : Number(currentItem.salePrice || 0);
    const qty = isPart ? Math.max(1, Number(document.getElementById('buyQty')?.value || 1)) : 1;
    const subtotal = unitPrice * qty;
    const itbis = Math.round(subtotal * 0.18);
    const total = subtotal + itbis;

    const buyerName = document.getElementById('buyBuyerName')?.value.trim() || '';
    const buyerRnc = document.getElementById('buyBuyerRnc')?.value.trim() || '';
    const buyerPhone = document.getElementById('buyBuyerPhone')?.value.trim() || '';
    if (!buyerName || !buyerRnc || buyerPhone.replace(/\D/g, '').length < 7) {
      toast('Completa tu nombre/empresa, RNC/Cédula y teléfono de contacto');
      return;
    }

    const authOwner = (FB && FB.getCurrentOwner) ? FB.getCurrentOwner() : null;
    const orderId = Date.now();
    const orderRec = {
      id: orderId,
      orderCode: `ORD-${String(orderId).slice(-5)}`,
      kind: currentKind,
      itemId: currentItem.id,
      itemTitle: currentItem.title,
      category: currentItem.category,
      condition: currentItem.condition || (isPart ? 'nueva' : 'usada'),
      partNumber: currentItem.partNumber || '',
      sellerName: currentItem.owner || 'Vendedor Verificado',
      sellerCity: currentItem.city || 'RD',
      qty,
      unitPrice,
      subtotal,
      itbis,
      total,
      deliveryMode: document.getElementById('buyDelivery')?.value || 'pickup',
      ncfType: document.getElementById('buyNcfType')?.value || 'E31',
      paymentMethod: document.getElementById('buyPayment')?.value || 'transfer',
      buyerId: authOwner ? authOwner.id : null,
      buyerName,
      buyerRnc,
      buyerPhone,
      notes: document.getElementById('buyNotes')?.value.trim() || '',
      status: 'en_revision',
      createdAtIso: new Date().toISOString()
    };

    if (FB && FB.saveOrder) {
      await Promise.race([
        FB.saveOrder(orderRec).catch(() => {}),
        new Promise((r) => setTimeout(r, 1500))
      ]);
    }

    const formPanel = document.getElementById('panelBuyMode');
    if (formPanel) {
      formPanel.innerHTML = `
        <div class="order-confirm-card">
          <span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:800; background:#059669; color:#fff; padding:4px 10px; border-radius:999px; text-transform:uppercase; margin-bottom:10px;">✓ Orden Confirmada</span>
          <h3 style="font-size:19px; color:#065F46; margin-bottom:6px;">Expediente ${esc(orderRec.orderCode)}</h3>
          <p style="font-size:13px; color:#047857; line-height:1.5; margin-bottom:14px;">
            Tu solicitud de compra ha sido registrada en <strong>Green Mile RD</strong>. Coordinaremos con <strong>${esc(orderRec.sellerName)}</strong> ${orderRec.deliveryMode === 'pickup' ? 'la inspección y entrega en patio' : 'el envío/despacho asegurado'} y la emisión de tu factura electrónica <strong>${esc(orderRec.ncfType)}</strong>.
          </p>
          <div style="background:#fff; border:1px solid #A7F3D0; border-radius:12px; padding:12px; font-size:12.5px; color:var(--navy); display:flex; flex-direction:column; gap:5px; margin-bottom:14px;">
            <div><strong>Artículo:</strong> ${esc(orderRec.itemTitle)} ${orderRec.qty > 1 ? `× ${orderRec.qty}` : ''}</div>
            <div><strong>Comprador:</strong> ${esc(orderRec.buyerName)} (${esc(orderRec.buyerRnc)})</div>
            <div><strong>Subtotal:</strong> ${GM.fmtRD(orderRec.subtotal)} + <strong>ITBIS 18%:</strong> ${GM.fmtRD(orderRec.itbis)}</div>
            <div style="font-size:15px; font-weight:800; color:var(--navy); border-top:1px solid var(--border); padding-top:6px; margin-top:3px;">Total con e-NCF: ${GM.fmtRD(orderRec.total)}</div>
          </div>
          <div class="no-print" style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn btn-navy" style="width:100%;" onclick="window.print()">🖨️ Imprimir / Guardar Comprobante</button>
            ${authOwner
              ? `<a class="btn btn-primary" style="width:100%; text-decoration:none; text-align:center;" href="./index.html?tab=profile">Ver en Mi Panel →</a>`
              : `<a class="btn btn-primary" style="width:100%; text-decoration:none; text-align:center;" href="./index.html?mode=${isPart ? 'parts' : 'sale'}">Seguir Explorando →</a>`}
          </div>
        </div>
      `;
    }
    toast(`✓ Orden ${orderRec.orderCode} registrada en Green Mile RD`);
  }

  function renderRelated() {
    const isPart = currentKind === 'part';
    const pool = (isPart ? allParts : allSales).filter((x) => String(x.id) !== String(currentItem.id));
    const scored = pool.map((x) => ({
      x,
      score: (x.category === currentItem.category ? 3 : 0) + (x.condition === currentItem.condition ? 1 : 0) + (x.city === currentItem.city ? 1 : 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, 4).map((s) => s.x);
    if (!picks.length) return '';

    return `
      <section class="related-section" style="margin-top:26px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <h2 style="font-size:19px; color:var(--navy);">${isPart ? 'Piezas y Repuestos Relacionados' : 'Otros Equipos en Venta en RD'}</h2>
          <a href="./index.html?mode=${isPart ? 'parts' : 'sale'}" style="font-size:13px; font-weight:800; color:var(--orange); text-decoration:none;">Ver todo el catálogo →</a>
        </div>
        <div class="related-prod-grid">
          ${picks.map((it) => {
            const isNew = String(it.condition || (isPart ? 'nueva' : 'usada')).toLowerCase() === 'nueva';
            const img = it.img || (isPart ? getPartCover(it.category) : GM.defaultCover(it.category));
            const price = isPart ? Number(it.price || 0) : Number(it.salePrice || 0);
            return `
              <a class="rel-prod-card" href="./producto.html?kind=${currentKind}&id=${encodeURIComponent(it.id)}">
                <div class="rel-prod-media">
                  <img src="${img}" alt="${esc(it.title)}" loading="lazy" />
                  <span style="position:absolute; bottom:8px; left:8px; background:${isNew ? '#059669' : '#D97706'}; color:#fff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:999px; text-transform:uppercase;">${isNew ? '✨ Nueva' : '🔧 Usada'}</span>
                </div>
                <div class="rel-prod-body">
                  <span style="font-size:10.5px; font-weight:800; color:var(--orange); text-transform:uppercase;">${esc(it.category)}</span>
                  <strong style="font-size:13.5px; color:var(--navy); line-height:1.3;">${esc(it.title)}</strong>
                  <span style="font-size:11.5px; color:var(--text-muted);">${esc(it.city || 'RD')}</span>
                  <strong style="font-size:15px; color:var(--navy); margin-top:auto; padding-top:6px;">${GM.fmtRD(price)}</strong>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderPage() {
    const root = document.getElementById('productPageContent');
    if (!root) return;

    const isPart = currentKind === 'part';
    const backLink = document.getElementById('backCatalogLink');
    const backLabel = document.getElementById('backCatalogLabel');
    if (backLink) backLink.href = `./index.html?mode=${isPart ? 'parts' : 'sale'}`;
    if (backLabel) backLabel.textContent = isPart ? 'Piezas' : 'Venta Equipos';

    if (!currentItem) {
      root.innerHTML = `
        <div class="panel not-found" style="text-align:center; padding:48px 24px;">
          <div style="font-size:40px; margin-bottom:10px;">${isPart ? '⚙️' : '🏷️'}</div>
          <h1 style="font-size:22px; color:var(--navy); margin-bottom:8px;">Publicación no encontrada</h1>
          <p style="font-size:14px; color:var(--text-muted); margin-bottom:20px;">Este artículo ya no está disponible o el enlace es incompleto.</p>
          <a class="btn btn-primary" href="./index.html?mode=${isPart ? 'parts' : 'sale'}" style="text-decoration:none;">← Volver al Catálogo</a>
        </div>
      `;
      return;
    }

    const item = currentItem;
    const isNew = String(item.condition || (isPart ? 'nueva' : 'usada')).toLowerCase() === 'nueva';
    const unitPrice = isPart ? Number(item.price || 0) : Number(item.salePrice || 0);
    const maxStock = isPart ? Math.max(1, Number(item.stock || 1)) : 1;
    const imgs = getImages(item, isPart);
    const authOwner = (FB && FB.getCurrentOwner) ? FB.getCurrentOwner() : null;
    const IMP = window.GM_IMPORT || null;
    const fulfill = isPart && IMP ? IMP.getFulfillmentMeta(item) : { isImport: false, badgeText: maxStock > 1 ? `Stock: ${maxStock}` : '1 disponible', pillBg: '#0D223A', pillColor: '#fff', originCountry: 'República Dominicana', leadTimeDays: '24–48 horas', longLabel: 'Disponible en Inventario RD' };
    const isIntlPart = Boolean(isPart && fulfill.isImport);
    const quickPrompts = isPart
      ? (isIntlPart
          ? [
              '¿Confirman compatibilidad con el serial/PIN de mi máquina?',
              '¿El precio incluye flete, aduanas DGA e ITBIS?',
              '¿Tienen versión OEM y también Aftermarket?',
              '¿En cuántos días exactos llega a Santo Domingo / obra?'
            ]
          : [
              '¿Sigue disponible en inventario?',
              '¿Es compatible con mi modelo de equipo?',
              '¿Hacen envío hoy mismo dentro de RD?',
              '¿Aceptan oferta por compra directa?'
            ])
      : [
          '¿Sigue disponible para inspección en patio?',
          '¿La matrícula y papeles están al día para traspaso?',
          '¿Aceptan oferta de contado o financiamiento?',
          '¿Pueden enviar video del equipo trabajando?'
        ];

    document.title = `${item.title} (${isNew ? 'Nueva' : 'Usada'}) | Green Mile Construction RD`;

    const thumbsHtml = imgs.length > 1
      ? `<div class="prod-thumbs">${imgs.map((src, i) => `
          <button type="button" class="prod-thumb ${i === 0 ? 'active' : ''}" onclick="window.GM_PRODUCT_PAGE.selectGalleryImage(${i})" aria-label="Ver foto ${i + 1}">
            <img src="${src}" alt="Foto ${i + 1}" />
          </button>`).join('')}</div>`
      : '';

    const specs = isPart
      ? [
          { k: 'Condición', v: isNew ? '✨ Nueva (Sellada / OEM)' : '🔧 Usada (Operativa / Revisada)' },
          { k: 'Disponibilidad / Modalidad', v: fulfill.longLabel },
          { k: 'Origen / Despacho', v: isIntlPart ? `🌍 ${fulfill.originCountry} → RD (${fulfill.leadTimeDays})` : `📍 ${item.city || 'Santo Domingo'}, República Dominicana` },
          { k: 'Número de Parte / OEM', v: item.partNumber || 'Consultar ficha' },
          { k: 'Marca', v: item.brand || 'OEM Heavy Duty' },
          { k: 'Equipos Compatibles', v: item.compatibleWith || 'Maquinaria Pesada RD' },
          ...(isIntlPart && item.fobUsd ? [{ k: 'Ref. FOB Exterior / Peso', v: `US$ ${Number(item.fobUsd).toLocaleString('en-US')} • ~${item.weightLb || 10} lb (DR-CAFTA/DGA incl.)` }] : [{ k: 'Unidades en Stock', v: `${maxStock} unidad${maxStock > 1 ? 'es' : ''} disponible${maxStock > 1 ? 's' : ''}` }]),
          { k: 'Garantía / Respaldo', v: item.warranty || 'Factura con e-NCF en Green Mile RD' }
        ]
      : [
          { k: 'Condición', v: isNew ? '✨ Nueva (0 Horas)' : '🔧 Usada (Operativa)' },
          { k: 'Categoría', v: item.category || 'Maquinaria Pesada' },
          { k: 'Año de Fabricación', v: String(item.year || 'Verificado') },
          { k: 'Horas / Kilometraje', v: item.hoursUsed || (isNew ? '0 hrs (Nueva)' : 'Verificado en patio') },
          { k: 'Potencia / Capacidad', v: item.power || 'Estándar industrial' },
          { k: 'Ubicación del Patio', v: `${item.city || 'Santo Domingo'}, República Dominicana` },
          { k: 'Garantía / Documentos', v: item.warranty || 'Matrícula y documentación al día' },
          { k: 'Facturación Fiscal', v: 'Comprobante Electrónico e-NCF (E31 / E32)' }
        ];

    const customImportHref = `./index.html?mode=parts&action=import&q=${encodeURIComponent(item.partNumber || item.title || '')}`;

    root.innerHTML = `
      <nav class="crumbs no-print" aria-label="Ruta de navegación" style="margin-bottom:14px; font-size:12.5px; color:var(--text-muted); display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <a href="./index.html" style="color:var(--navy); font-weight:700; text-decoration:none;">Catálogo RD</a>
        <span>›</span>
        <a href="./index.html?mode=${isPart ? 'parts' : 'sale'}" style="color:var(--navy); font-weight:700; text-decoration:none;">${isPart ? 'Piezas y Repuestos' : 'Venta de Maquinaria'}</a>
        <span>›</span>
        <span>${esc(item.category || '')}</span>
      </nav>

      <div class="detail-layout">
        <!-- LEFT COLUMN: MEDIA + TECHNICAL SPECS + DESCRIPTION -->
        <div class="detail-left" style="display:flex; flex-direction:column; gap:18px;">
          <section class="panel" style="padding:18px;">
            <div class="prod-hero-media">
              <img id="prodHeroImg" src="${imgs[0]}" alt="${esc(item.title)}" />
              <span class="prod-badge-tl">${isIntlPart ? `🌍 ${esc(fulfill.originCountry)}` : `📍 ${esc(item.city || 'Santo Domingo')}`}</span>
              <span class="prod-badge-bl" style="background:${isNew ? '#059669' : '#D97706'};">${isNew ? '✨ Nueva' : '🔧 Usada'}</span>
              <span class="prod-badge-br" style="background:${fulfill.pillBg}; color:${fulfill.pillColor};">${isPart ? esc(fulfill.badgeText) : 'EN VENTA'}</span>
            </div>
            ${thumbsHtml}

            <div style="margin-top:16px;">
              <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
                <span style="font-size:11px; font-weight:800; color:var(--orange); text-transform:uppercase; letter-spacing:0.04em;">${esc(item.category)}</span>
                ${isPart && item.partNumber ? `<span style="font-size:11px; font-family:monospace; font-weight:800; background:var(--navy-soft); color:var(--navy); padding:2px 8px; border-radius:6px;">${esc(item.partNumber)}</span>` : ''}
                ${isIntlPart ? `<span style="font-size:11px; font-weight:800; background:${fulfill.softBg}; color:${fulfill.softColor}; padding:2px 9px; border-radius:999px;">${esc(fulfill.badgeText)} • DGA + e-NCF Incluidos</span>` : ''}
              </div>
              <h1 style="font-size:24px; font-weight:800; color:var(--navy); line-height:1.22; margin-bottom:10px;">${esc(item.title)}</h1>

              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; background:${isIntlPart ? '#EFF6FF' : '#ECFDF5'}; border:1px solid ${isIntlPart ? '#BFDBFE' : '#A7F3D0'}; border-radius:12px; padding:11px 14px;">
                <div>
                  <strong style="font-size:13.5px; color:${isIntlPart ? '#1E3A8A' : '#065F46'}; display:block;">✓ ${esc(item.owner || 'Propietario Verificado DGII')}</strong>
                  <span style="font-size:12px; color:${isIntlPart ? '#1D4ED8' : '#047857'};">${isIntlPart ? `Importación gestionada desde ${esc(fulfill.originCountry)} • Desaduanaje DGA + e-NCF local` : `Vendedor verificado en Green Mile RD • ${esc(item.city || 'RD')} • Chat directo en la app`}</span>
                </div>
                <span style="font-size:11px; font-weight:800; background:${isIntlPart ? '#0369A1' : '#059669'}; color:#fff; padding:4px 10px; border-radius:999px;">${isIntlPart ? '🌍 Puesto en RD' : 'Compra Protegida'}</span>
              </div>
            </div>
          </section>

          <section class="panel" style="padding:20px;">
            <h2 style="font-size:17px; color:var(--navy); margin-bottom:4px;">Ficha Técnica y Condición</h2>
            <p style="font-size:12.5px; color:var(--text-muted);">${isIntlPart ? 'Importación gestionada llave en mano: validamos tu número de serie (PIN) antes de embarcar' : 'Información declarada por el propietario y validada para venta en República Dominicana'}</p>
            <div class="prod-spec-grid">
              ${specs.map((s) => `
                <div class="prod-spec-cell">
                  <small>${esc(s.k)}</small>
                  <strong>${esc(s.v)}</strong>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="panel" style="padding:20px;">
            <h2 style="font-size:17px; color:var(--navy); margin-bottom:8px;">Descripción y Garantía</h2>
            <p style="font-size:14px; color:var(--text-muted); line-height:1.65;">${esc(item.desc || 'Disponible para entrega o inspección coordinada en República Dominicana a través de Green Mile RD.')}</p>
            <div style="margin-top:14px; background:var(--navy-soft); border:1px solid #DCE5F0; border-left:4px solid var(--orange); border-radius:12px; padding:12px 14px; font-size:12.5px; color:var(--navy); line-height:1.5;">
              ${isIntlPart
                ? '<strong>🌍 Importación Llave en Mano (DGA + DGII):</strong> Green Mile Construction RD compra en origen, gestiona flete internacional, desaduanaje DGA (aplicando DR-CAFTA cuando corresponde) y te emite <strong>factura fiscal local e-CF</strong> deducible.'
                : '<strong>🛡️ Cierre Seguro en Green Mile RD:</strong> Habla directamente con el vendedor aquí para confirmar compatibilidad, acordar precio o agendar inspección en patio. Cuando estén listos, cierra la compra con <strong>factura electrónica e-NCF</strong> y respaldo de entrega.'}
            </div>
            ${isPart ? `
              <div class="no-print" style="margin-top:12px; background:linear-gradient(135deg, #0D223A 0%, #163558 100%); color:#fff; border-radius:13px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                  <strong style="font-size:13.5px; display:block; margin-bottom:2px;">✈️ ¿Necesitas otro número de parte o importarla de otro país?</strong>
                  <span style="font-size:12px; color:#CBD5E1;">Envíanos el Part Number o serial de tu máquina y te cotizamos puesto en obra RD (EE. UU., Europa o Asia).</span>
                </div>
                <a class="btn btn-primary" href="${customImportHref}" style="padding:9px 14px; font-size:12px; text-decoration:none; white-space:nowrap;">🌍 Solicitar Importación →</a>
              </div>
            ` : ''}
          </section>
        </div>

        <!-- RIGHT STICKY COLUMN: 2-TAB CONVERSION ENGINE (CHAT DIRECTO + COMPRA E-NCF) -->
        <aside class="detail-right">
          <div class="panel buy-panel-sticky" style="padding:20px;">
            <div class="buy-price-head">
              <span class="eyebrow">${isIntlPart ? `Importación Gestionada • ${esc(fulfill.leadTimeDays)}` : `${isPart ? 'Repuesto en Venta' : 'Maquinaria en Venta'} • ${isNew ? 'Nueva' : 'Usada'}`}</span>
              <div class="big-price">${GM.fmtRD(unitPrice)} <small>${isIntlPart ? 'puesto en RD' : (isPart ? '/ unidad' : '+ ITBIS')}</small></div>
              <span class="sub-note">${isIntlPart ? `✓ Flete ${fulfill.mode === 'sea' ? 'marítimo LCL' : 'aéreo express'} + Aduanas DGA + e-NCF local` : '✓ Negocia directo con el vendedor • Cierre con e-NCF protegido'}</span>
            </div>

            <div class="action-tabs no-print" role="tablist">
              <button type="button" class="action-tab active" id="tabBtnChat" onclick="window.GM_PRODUCT_PAGE.switchRightTab('chat')">💬 Hablar / Ofertar</button>
              <button type="button" class="action-tab" id="tabBtnBuy" onclick="window.GM_PRODUCT_PAGE.switchRightTab('buy')">${isIntlPart ? '✈️ Encargar / Comprar' : '🛒 Comprar / Reservar'}</button>
            </div>

            <!-- TAB 1: DIRECT IN-APP CHAT & OFFER NEGOTIATION WITH SELLER -->
            <div id="panelChatMode">
              <div class="chat-thread" id="prodChatThread"></div>

              <div class="quick-chips no-print">
                ${quickPrompts.map((q) => `<button type="button" class="quick-chip" onclick="window.GM_PRODUCT_PAGE.useQuickPrompt('${esc(q)}')">${esc(q)}</button>`).join('')}
              </div>

              <form id="prodChatForm" onsubmit="window.GM_PRODUCT_PAGE.submitChatMessage(event)">
                <div class="prod-form-grid">
                  <div class="prod-field full">
                    <label for="chatSenderName">${isCurrentUserSeller() ? 'Respondiendo como Vendedor' : 'Tu Nombre o Empresa'} <small>*</small></label>
                    <div class="prod-input-box">
                      <input type="text" id="chatSenderName" value="${esc(authOwner ? (authOwner.name || '') : '')}" placeholder="Ej. Ing. Carlos Méndez / Constructora Cibao" required />
                    </div>
                  </div>
                  ${!isCurrentUserSeller() ? `
                    <div class="prod-field full">
                      <label for="chatOfferPrice">Proponer Oferta (Opcional RD$) <small>Negociable</small></label>
                      <div class="prod-input-box">
                        <span class="prod-prefix">RD$</span>
                        <input type="number" id="chatOfferPrice" min="1" step="1" placeholder="${Math.round(unitPrice * 0.92)}" />
                      </div>
                    </div>
                  ` : ''}
                  <div class="prod-field full">
                    <label for="chatMsgInput">Mensaje directo al vendedor <small>*</small></label>
                    <div class="prod-input-box">
                      <textarea id="chatMsgInput" rows="2" placeholder="${isIntlPart ? 'Indica el número de serie (PIN) de tu máquina y ciudad de entrega para confirmar plazo exacto...' : (isPart ? 'Pregunta por compatibilidad, medidas, serie o envío en RD...' : 'Pregunta por historial, agenda inspección en patio o negocia precio...')}" required></textarea>
                    </div>
                  </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; min-height:46px; font-size:14px; margin-top:12px;">
                  💬 Enviar Mensaje al Vendedor
                </button>
              </form>

              <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                <span style="font-size:11.5px; color:var(--text-muted);">¿Ya confirmaste todo y deseas asegurarla?</span>
                <button type="button" class="btn btn-navy" style="padding:7px 12px; font-size:11.5px;" onclick="window.GM_PRODUCT_PAGE.switchRightTab('buy')">${isIntlPart ? '✈️ Encargar con e-NCF →' : '🛒 Reservar con e-NCF →'}</button>
              </div>
            </div>

            <!-- TAB 2: FORMAL PURCHASE / RESERVATION WITH E-NCF -->
            <div id="panelBuyMode" style="display:none;">
              <form id="prodOrderForm" onsubmit="window.GM_PRODUCT_PAGE.submitOrder(event)">
                <div class="prod-form-grid">
                  ${isPart ? `
                    <div class="prod-field">
                      <label for="buyQty">Cantidad <small>Disp: ${maxStock}</small></label>
                      <div class="prod-input-box">
                        <input type="number" id="buyQty" min="1" max="${maxStock}" value="1" oninput="window.GM_PRODUCT_PAGE.updateReceipt()" required />
                      </div>
                    </div>
                  ` : `<input type="hidden" id="buyQty" value="1" />`}

                  <div class="prod-field ${isPart ? '' : 'full'}">
                    <label for="buyDelivery">Entrega / Logística</label>
                    <div class="prod-input-box">
                      <select id="buyDelivery" onchange="window.GM_PRODUCT_PAGE.updateReceipt()">
                        ${isIntlPart
                          ? `<option value="shipping">${fulfill.mode === 'sea' ? '🚢 Importación Marítima LCL → Obra/Almacén RD' : '✈️ Importación Aérea Express → Obra/Almacén RD'}</option>
                             <option value="pickup">🏢 Retirar en almacén Green Mile Santo Domingo</option>`
                          : `<option value="pickup">🏢 Retiro / Inspección en patio (${esc(item.city || 'RD')})</option>
                             <option value="shipping">${isPart ? '📦 Envío por mensajería / carga en RD' : '🚛 Coordinar traslado en Lowboy en RD'}</option>`}
                      </select>
                    </div>
                  </div>

                  <div class="prod-field">
                    <label for="buyNcfType">Comprobante e-NCF</label>
                    <div class="prod-input-box">
                      <select id="buyNcfType">
                        <option value="E31">E31 • Crédito Fiscal</option>
                        <option value="E32">E32 • Consumo</option>
                      </select>
                    </div>
                  </div>

                  <div class="prod-field">
                    <label for="buyPayment">Método de Pago</label>
                    <div class="prod-input-box">
                      <select id="buyPayment">
                        <option value="transfer">🏦 Transferencia Bancaria</option>
                        ${isIntlPart ? '<option value="deposit_70_30">📦 Anticipo 70% al pedir / 30% al llegar a RD</option>' : '<option value="inspection">🤝 Inspección Previa en Patio</option>'}
                        <option value="card">💳 Tarjeta / Financiamiento</option>
                      </select>
                    </div>
                  </div>

                  <div class="prod-field full">
                    <label for="buyBuyerRnc">RNC / Cédula <small>* Validación DGII</small></label>
                    <div class="prod-input-box">
                      <input type="text" id="buyBuyerRnc" inputmode="numeric" value="${esc(authOwner ? (authOwner.rncFormatted || '') : '')}" placeholder="Ej. 1-31-00000-1" required />
                    </div>
                  </div>

                  <div class="prod-field full">
                    <label for="buyBuyerName">Nombre o Empresa <small>* Obligatorio</small></label>
                    <div class="prod-input-box">
                      <input type="text" id="buyBuyerName" value="${esc(authOwner ? (authOwner.name || '') : '')}" placeholder="Ej. Constructora del Este, S.R.L." required />
                    </div>
                    <div id="buyDgiiSuggestions" class="dgii-sugg-list"></div>
                    <div id="buyDgiiStatus" class="dgii-badge" style="display:none;"></div>
                  </div>

                  <div class="prod-field full">
                    <label for="buyBuyerPhone">Teléfono de Contacto en RD <small>* Confidencial</small></label>
                    <div class="prod-input-box">
                      <span class="prod-prefix">🇩🇴 +1</span>
                      <input type="tel" id="buyBuyerPhone" value="${esc(authOwner ? (authOwner.phone || '') : '')}" placeholder="809-555-0199" required />
                    </div>
                  </div>

                  <div class="prod-field full">
                    <label for="buyNotes">${isIntlPart ? 'Número de Serie (PIN) de tu máquina y dirección de obra *' : 'Notas / Dirección de entrega (Opcional)'}</label>
                    <div class="prod-input-box">
                      <textarea id="buyNotes" rows="2" placeholder="${isIntlPart ? 'Ej. Serial CAT0320DK... • Entregar en obra Punta Cana' : (isPart ? 'Ej. Despachar a taller en Santiago o confirmar compatibilidad...' : 'Ej. Deseo agendar inspección mecánica esta semana...')}" ${isIntlPart ? 'required' : ''}></textarea>
                    </div>
                  </div>
                </div>

                <div class="prod-receipt" id="prodReceiptBox"></div>

                <button type="submit" class="btn btn-primary" id="prodSubmitBtn" style="width:100%; min-height:48px; font-size:14.5px;">
                  ${isIntlPart ? '✈️ Confirmar Pedido de Importación' : 'Confirmar Orden de Compra'}
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>

      ${renderRelated()}
    `;

    renderChatThread();
    updateReceipt();

    if (window.GM_DGII && window.GM_DGII.attachPair) {
      dgiiController = window.GM_DGII.attachPair({
        rncInputId: 'buyBuyerRnc',
        nameInputId: 'buyBuyerName',
        statusBoxId: 'buyDgiiStatus',
        suggestionsBoxId: 'buyDgiiSuggestions'
      });
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    currentKind = params.get('kind') === 'sale' ? 'sale' : 'part';
    const id = params.get('id');
    if (params.get('tab') === 'buy') activeRightTab = 'buy';

    const defaultParts = GM.DEFAULT_PARTS || [];
    const defaultSales = GM.DEFAULT_SALE_MACHINES || [];
    const localEq = (GM.loadState().equipment || []).filter((e) => e.listingType === 'sale' || e.listingType === 'both');

    allParts = (FB && FB.getLocalParts) ? FB.getLocalParts(defaultParts) : defaultParts.slice();
    const localSales = (FB && FB.getLocalSales) ? FB.getLocalSales(defaultSales) : defaultSales.slice();
    const saleMap = new Map();
    localSales.forEach((s) => saleMap.set(String(s.id), s));
    localEq.forEach((e) => saleMap.set(String(e.id), e));
    allSales = Array.from(saleMap.values());

    if (id) {
      currentItem = (currentKind === 'part' ? allParts : allSales).find((x) => String(x.id) === String(id)) || null;
      if (!currentItem && FB) {
        if (currentKind === 'part' && FB.getPartById) {
          currentItem = await FB.getPartById(id);
        } else if (currentKind === 'sale' && FB.getSaleMachineById) {
          currentItem = await FB.getSaleMachineById(id);
        }
      }
    }

    renderPage();
    if (activeRightTab === 'buy') switchRightTab('buy');

    if (currentItem && FB && FB.subscribeProductChats) {
      unsubChats = FB.subscribeProductChats(currentItem.id, currentKind, (msgs) => {
        chatMessages = Array.isArray(msgs) ? msgs : [];
        renderChatThread();
      });
    }
  }

  window.GM_PRODUCT_PAGE = {
    selectGalleryImage,
    shareListing,
    switchRightTab,
    useQuickPrompt,
    submitChatMessage,
    updateReceipt,
    submitOrder
  };

  window.addEventListener('beforeunload', () => {
    try { if (unsubChats) unsubChats(); } catch (_) {}
  });

  init();
})();
