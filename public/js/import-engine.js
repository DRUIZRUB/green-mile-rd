/* Green Mile Construction RD — Motor de Importación Internacional de Repuestos (Landed Cost DGA/DGII + Tracking 7 Etapas) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GM_IMPORT = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DEFAULT_IMPORT_CONFIG = {
    usdToDop: 60.5,
    airRateUsdPerLb: 7.5,
    airMinUsd: 35,
    seaRateUsdPerLb: 2.25,
    seaMinUsd: 85,
    originPickupUsd: 25,
    insurancePct: 1.8,
    caftaTariffPct: 0,
    nonCaftaTariffPct: 8,
    customsBrokerUsd: 95,
    managementFeePct: 12,
    localDeliveryRD: 2500,
    depositPct: 70
  };

  const ORIGINS = {
    usa_miami: {
      id: 'usa_miami',
      label: 'EE. UU. (Miami / Houston)',
      shortLabel: 'EE. UU.',
      flag: '🇺🇸',
      cafta: true,
      airDays: '4–7 días hábiles',
      seaDays: '12–18 días hábiles',
      hub: 'Almacén Miami, FL'
    },
    europe: {
      id: 'europe',
      label: 'Europa (Alemania / Italia / UK)',
      shortLabel: 'Europa',
      flag: '🇪🇺',
      cafta: false,
      airDays: '6–10 días hábiles',
      seaDays: '22–30 días hábiles',
      hub: 'Hub Aéreo/Marítimo Europa'
    },
    asia: {
      id: 'asia',
      label: 'Asia (Japón / Corea / China)',
      shortLabel: 'Asia',
      flag: '🌏',
      cafta: false,
      airDays: '7–12 días hábiles',
      seaDays: '28–40 días hábiles',
      hub: 'Consolidador Asia → RD'
    },
    any: {
      id: 'any',
      label: 'Mejor origen disponible (Green Mile busca)',
      shortLabel: 'Internacional',
      flag: '🌍',
      cafta: true,
      airDays: '5–9 días hábiles',
      seaDays: '15–28 días hábiles',
      hub: 'Red Internacional Green Mile'
    }
  };

  const SHIPPING_MODES = {
    air: {
      id: 'air',
      label: '✈️ Aéreo Express (Piezas urgentes / ligeras)',
      shortLabel: '✈️ Aéreo Express',
      icon: '✈️',
      desc: 'Ideal para sensores, ECU, inyectores, válvulas, kits de sellos y urgencias en obra'
    },
    sea: {
      id: 'sea',
      label: '🚢 Marítimo Consolidado LCL (Carga pesada)',
      shortLabel: '🚢 Marítimo LCL',
      icon: '🚢',
      desc: 'Ideal para cadenas, rodillos, bombas hidráulicas pesadas, cilindros, transmisiones y motores'
    }
  };

  const QUALITY_OPTIONS = {
    best_option: { id: 'best_option', label: 'Cotizar OEM + Aftermarket (Comparar)' },
    oem: { id: 'oem', label: 'Original de Fábrica (OEM)' },
    aftermarket: { id: 'aftermarket', label: 'Aftermarket Heavy Duty (ej. CTP / ITR / Berco)' },
    used_reman: { id: 'used_reman', label: 'Usada / Remanufacturada Verificada' }
  };

  const IMPORT_STAGES = [
    { id: 'requested', step: 1, pct: 12, label: 'Solicitud Recibida', shortLabel: 'Solicitada', icon: '📥', bg: '#EFF6FF', color: '#1E40AF' },
    { id: 'quoted', step: 2, pct: 28, label: 'Cotización Lista (Esperando Aprobación)', shortLabel: 'Cotizada', icon: '💬', bg: '#FEF3C7', color: '#92400E' },
    { id: 'approved_paid', step: 3, pct: 42, label: 'Aprobada · Anticipo/Pago Confirmado', shortLabel: 'Aprobada', icon: '✅', bg: '#ECFDF5', color: '#065F46' },
    { id: 'purchased_origin', step: 4, pct: 56, label: 'Comprada al Proveedor Exterior', shortLabel: 'Comprada', icon: '🛒', bg: '#EEF2FF', color: '#3730A3' },
    { id: 'warehouse_origin', step: 5, pct: 68, label: 'Recibida en Almacén Origen / Miami', shortLabel: 'Almacén Origen', icon: '📦', bg: '#F3E8FF', color: '#6B21A8' },
    { id: 'in_transit', step: 6, pct: 80, label: 'En Tránsito Internacional hacia RD', shortLabel: 'En Tránsito', icon: '✈️', bg: '#E0F2FE', color: '#0369A1' },
    { id: 'customs_dga', step: 7, pct: 90, label: 'En Aduanas RD (DGA) / Desaduanaje', shortLabel: 'Aduanas DGA', icon: '🛃', bg: '#FEF3C7', color: '#B45309' },
    { id: 'delivered', step: 8, pct: 100, label: 'Entregada en Obra / Patio + e-NCF', shortLabel: 'Entregada', icon: '🎉', bg: '#DCFCE7', color: '#166534' }
  ];

  const CANCELLED_STAGE = {
    id: 'cancelled',
    step: 0,
    pct: 0,
    label: 'Cancelada',
    shortLabel: 'Cancelada',
    icon: '✕',
    bg: '#FEE2E2',
    color: '#991B1B'
  };

  function getStageMeta(stageId) {
    if (stageId === 'cancelled') return CANCELLED_STAGE;
    return IMPORT_STAGES.find((s) => s.id === stageId) || IMPORT_STAGES[0];
  }

  function getOriginMeta(originId) {
    return ORIGINS[originId] || ORIGINS.usa_miami;
  }

  function getShippingMeta(modeId) {
    return SHIPPING_MODES[modeId] || SHIPPING_MODES.air;
  }

  function getQualityLabel(qualityId) {
    return (QUALITY_OPTIONS[qualityId] && QUALITY_OPTIONS[qualityId].label) || 'Original OEM / Aftermarket';
  }

  function getActiveConfig(overrideCfg) {
    let stored = {};
    try {
      if (typeof window !== 'undefined' && window.GM_BILLING && window.GM_BILLING.loadAdminConfig) {
        const adm = window.GM_BILLING.loadAdminConfig();
        if (adm && adm.importConfig) stored = adm.importConfig;
      }
    } catch (_) {}
    return Object.assign({}, DEFAULT_IMPORT_CONFIG, stored || {}, overrideCfg || {});
  }

  function fmtUSD(n) {
    const val = Number(n) || 0;
    return 'US$ ' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtRD(n) {
    const val = Math.round(Number(n) || 0);
    return 'RD$ ' + val.toLocaleString('en-US');
  }

  /**
   * Calcula el costo estimado "Puesto en Obra RD" (Landed Cost) aplicando normativa aduanal dominicana:
   * - Decreto 402-05: Envíos aéreos courier con valor FOB <= US$ 200 están exentos de arancel e ITBIS DGA.
   * - DR-CAFTA / Partida 8431: Repuestos de maquinaria pesada origen EE. UU. pueden aplicar 0% arancel.
   * - ITBIS 18% sobre (CIF + Arancel) + gestión de corredor aduanal cuando FOB > US$ 200 o marítimo.
   */
  function calculateLandedCost({
    fobUsd = 0,
    qty = 1,
    weightLb = 5,
    origin = 'usa_miami',
    shippingMode = 'air',
    applyCafta = true,
    includeLocalDelivery = true,
    config = null
  } = {}) {
    const cfg = getActiveConfig(config);
    const orig = getOriginMeta(origin);
    const mode = shippingMode === 'sea' ? 'sea' : 'air';
    const safeQty = Math.max(1, Math.round(Number(qty) || 1));
    const unitFob = Math.max(0, Number(fobUsd) || 0);
    const unitWeight = Math.max(0.5, Number(weightLb) || 1);

    const subtotalFobUsd = +(unitFob * safeQty).toFixed(2);
    const totalWeightLb = +(unitWeight * safeQty).toFixed(2);

    const freightUsd = mode === 'sea'
      ? +Math.max(cfg.seaMinUsd, totalWeightLb * cfg.seaRateUsdPerLb).toFixed(2)
      : +Math.max(cfg.airMinUsd, totalWeightLb * cfg.airRateUsdPerLb).toFixed(2);

    const originHandlingUsd = subtotalFobUsd > 0 ? +Number(cfg.originPickupUsd || 0).toFixed(2) : 0;
    const insuranceUsd = subtotalFobUsd > 0
      ? +Math.max(5, subtotalFobUsd * ((Number(cfg.insurancePct) || 0) / 100)).toFixed(2)
      : 0;

    const cifUsd = +(subtotalFobUsd + freightUsd + insuranceUsd).toFixed(2);

    // Exención de minimis RD (Decreto 402-05): Courier aéreo <= US$ 200 FOB
    const deMinimisExempt = subtotalFobUsd > 0 && subtotalFobUsd <= 200 && mode === 'air';
    const caftaApplied = !deMinimisExempt && Boolean(orig.cafta) && applyCafta !== false;

    let tariffPct = 0;
    let tariffUsd = 0;
    let dgaItbisUsd = 0;
    let customsBrokerUsd = 0;

    if (subtotalFobUsd > 0 && !deMinimisExempt) {
      tariffPct = caftaApplied ? Number(cfg.caftaTariffPct || 0) : Number(cfg.nonCaftaTariffPct || 8);
      tariffUsd = +(cifUsd * (tariffPct / 100)).toFixed(2);
      dgaItbisUsd = +((cifUsd + tariffUsd) * 0.18).toFixed(2);
      customsBrokerUsd = +Number(cfg.customsBrokerUsd || 0).toFixed(2);
    }

    const managementFeeUsd = subtotalFobUsd > 0
      ? +Math.max(25, subtotalFobUsd * ((Number(cfg.managementFeePct) || 12) / 100)).toFixed(2)
      : 0;

    const localDeliveryRD = includeLocalDelivery ? Math.round(Number(cfg.localDeliveryRD) || 0) : 0;
    const localDeliveryUsd = +(localDeliveryRD / (Number(cfg.usdToDop) || 60.5)).toFixed(2);

    const totalUsd = subtotalFobUsd > 0
      ? +(subtotalFobUsd + originHandlingUsd + freightUsd + insuranceUsd + tariffUsd + dgaItbisUsd + customsBrokerUsd + managementFeeUsd + localDeliveryUsd).toFixed(2)
      : 0;

    const rate = Number(cfg.usdToDop) || 60.5;
    const totalRD = Math.round(totalUsd * rate);

    const depositPct = totalUsd > 500 ? Math.min(100, Math.max(50, Number(cfg.depositPct) || 70)) : 100;
    const depositRD = Math.round(totalRD * (depositPct / 100));
    const balanceRD = Math.max(0, totalRD - depositRD);

    return {
      hasPriceEstimate: subtotalFobUsd > 0,
      usdToDop: rate,
      qty: safeQty,
      unitFobUsd: unitFob,
      subtotalFobUsd,
      totalWeightLb,
      origin: orig,
      shippingMode: mode,
      etaLabel: mode === 'sea' ? orig.seaDays : orig.airDays,
      originHandlingUsd,
      freightUsd,
      insuranceUsd,
      cifUsd,
      deMinimisExempt,
      caftaApplied,
      tariffPct,
      tariffUsd,
      dgaItbisUsd,
      customsBrokerUsd,
      managementFeePct: Number(cfg.managementFeePct) || 12,
      managementFeeUsd,
      localDeliveryRD,
      localDeliveryUsd,
      totalUsd,
      totalRD,
      depositPct,
      depositRD,
      balanceRD
    };
  }

  /**
   * Metadatos de disponibilidad para piezas del catálogo híbrido (En Stock RD vs Bajo Pedido Internacional).
   */
  function getFulfillmentMeta(part) {
    const f = String((part && part.fulfillment) || 'local_rd').toLowerCase();
    if (f === 'import_air') {
      const originLabel = (part && part.originCountry) || 'EE. UU.';
      const lead = (part && part.leadTimeDays) || '4–7 días';
      return {
        isImport: true,
        mode: 'air',
        badgeText: `✈️ Import. ${lead}`,
        longLabel: `Bajo Pedido Internacional Aéreo (${originLabel} → RD • ${lead})`,
        pillBg: '#0369A1',
        pillColor: '#FFFFFF',
        softBg: '#E0F2FE',
        softColor: '#0369A1',
        originCountry: originLabel,
        leadTimeDays: lead
      };
    }
    if (f === 'import_sea') {
      const originLabel = (part && part.originCountry) || 'EE. UU. / Asia';
      const lead = (part && part.leadTimeDays) || '15–22 días';
      return {
        isImport: true,
        mode: 'sea',
        badgeText: `🚢 Import. ${lead}`,
        longLabel: `Bajo Pedido Internacional Marítimo (${originLabel} → RD • ${lead})`,
        pillBg: '#1E3A8A',
        pillColor: '#FFFFFF',
        softBg: '#EEF2FF',
        softColor: '#1E3A8A',
        originCountry: originLabel,
        leadTimeDays: lead
      };
    }
    const stockNum = Math.max(1, Number((part && part.stock) || 1));
    return {
      isImport: false,
      mode: 'local',
      badgeText: stockNum > 1 ? `🟢 Stock RD: ${stockNum}` : '🟢 En Stock RD',
      longLabel: `Disponible en Inventario RD (Entrega 24–48h)`,
      pillBg: '#0D223A',
      pillColor: '#FFFFFF',
      softBg: '#ECFDF5',
      softColor: '#065F46',
      originCountry: 'República Dominicana',
      leadTimeDays: '24–48 horas'
    };
  }

  /**
   * Renderiza una barra compacta de progreso internacional de 8 etapas (para Mi Panel y Admin).
   */
  function renderProgressTrackHtml(currentStageId) {
    const meta = getStageMeta(currentStageId);
    if (currentStageId === 'cancelled') {
      return `<div style="background:#FEE2E2; color:#991B1B; border-radius:8px; padding:6px 10px; font-size:11.5px; font-weight:700;">✕ Solicitud cancelada</div>`;
    }
    const stepsHtml = IMPORT_STAGES.map((st) => {
      const done = st.step <= meta.step;
      const active = st.step === meta.step;
      return `
        <div style="flex:1; min-width:56px; text-align:center;">
          <div style="height:6px; border-radius:99px; background:${done ? (active ? '#B85A27' : '#059669') : '#E2E8F0'}; margin-bottom:4px;"></div>
          <div style="font-size:9.5px; font-weight:${active ? '800' : '600'}; color:${active ? '#0D223A' : (done ? '#065F46' : '#94A3B8')}; line-height:1.15;">${st.icon} ${st.shortLabel}</div>
        </div>
      `;
    }).join('');
    return `<div style="display:flex; gap:4px; align-items:flex-start; overflow-x:auto; padding:4px 0;">${stepsHtml}</div>`;
  }

  return {
    DEFAULT_IMPORT_CONFIG,
    ORIGINS,
    SHIPPING_MODES,
    QUALITY_OPTIONS,
    IMPORT_STAGES,
    CANCELLED_STAGE,
    getStageMeta,
    getOriginMeta,
    getShippingMeta,
    getQualityLabel,
    getActiveConfig,
    fmtUSD,
    fmtRD,
    calculateLandedCost,
    getFulfillmentMeta,
    renderProgressTrackHtml
  };
});
