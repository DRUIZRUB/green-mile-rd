/* Green Mile Construction RD — Motor Fiscal e-CF (DGII), Pagos con Tarjeta, Flujo Gubernamental E45 y Back-Office Administrativo */
(function (global) {
  const CONFIG_STORAGE_KEY = 'gm_rd_admin_config_v1';
  const PAYOUTS_STORAGE_KEY = 'gm_rd_payouts_v1';

  const NCF_TYPES = {
    E31: {
      code: 'E31',
      dgiiType: '31',
      legacy: 'B01',
      name: 'Factura de Crédito Fiscal Electrónica',
      shortName: 'Crédito Fiscal (e-CF 31)',
      badge: 'e-CF 31',
      itbisRate: 0.18,
      requiresActiveRnc: true,
      isGov: false,
      isExempt: false,
      isrRetentionRate: 0,
      desc: 'Constructoras y empresas con RNC activo DGII (deduce gasto e ITBIS 18%)'
    },
    E32: {
      code: 'E32',
      dgiiType: '32',
      legacy: 'B02',
      name: 'Factura de Consumo Electrónica',
      shortName: 'Consumo (e-CF 32)',
      badge: 'e-CF 32',
      itbisRate: 0.18,
      requiresActiveRnc: false,
      isGov: false,
      isExempt: false,
      isrRetentionRate: 0,
      desc: 'Personas físicas o proyectos particulares (Cédula / Consumidor Final)'
    },
    E45: {
      code: 'E45',
      dgiiType: '45',
      legacy: 'B15',
      name: 'Comprobante Gubernamental Electrónico',
      shortName: 'Gubernamental (e-CF 45)',
      badge: 'e-CF 45',
      itbisRate: 0.18,
      requiresActiveRnc: true,
      isGov: true,
      isExempt: false,
      isrRetentionRate: 0.05,
      desc: 'Ministerios, alcaldías e instituciones estatales no comerciales (Ley 340-06 · Ret. 5% ISR)'
    },
    E44: {
      code: 'E44',
      dgiiType: '44',
      legacy: 'B14',
      name: 'Comprobante Regímenes Especiales Electrónico',
      shortName: 'Rég. Especial (e-CF 44)',
      badge: 'e-CF 44',
      itbisRate: 0,
      requiresActiveRnc: true,
      isGov: false,
      isExempt: true,
      isrRetentionRate: 0,
      desc: 'Zonas Francas, proyectos CONFOTUR o entidad con exención vigente DGII (ITBIS 0%)'
    }
  };

  const PAYMENT_METHODS = {
    card: {
      id: 'card',
      label: 'Tarjeta de Crédito / Débito',
      shortLabel: 'Tarjeta (3DS)',
      icon: '💳',
      instant: true,
      desc: 'Visa, Mastercard o AMEX • Aprobación inmediata y bloqueo instantáneo de fechas'
    },
    transfer: {
      id: 'transfer',
      label: 'Transferencia Bancaria / LBTR',
      shortLabel: 'Transferencia',
      icon: '🏦',
      instant: false,
      desc: 'Depósito o transferencia a cuentas corporativas Green Mile RD (Popular, Banreservas, BHD)'
    },
    gov_po: {
      id: 'gov_po',
      label: 'Orden de Compra Estatal / Libramiento SIGEF',
      shortLabel: 'OC Estado / SIGEF',
      icon: '🏛️',
      instant: false,
      desc: 'Trámite institucional Ley 340-06 • Crédito gubernamental 30–60 días vía Tesorería Nacional'
    },
    credit: {
      id: 'credit',
      label: 'Crédito Corporativo (15–30 días)',
      shortLabel: 'Crédito Corp.',
      icon: '📄',
      instant: false,
      desc: 'Exclusivo para constructoras con cuenta corporativa aprobada o Plan Green Mile Pro'
    }
  };

  const ORDER_STAGES = {
    pending_validation: { id: 'pending_validation', step: 1, label: 'Pendiente Validación Pago', tone: 'warn' },
    gov_review: { id: 'gov_review', step: 2, label: 'Revisión Expediente Estatal', tone: 'info' },
    payment_verified: { id: 'payment_verified', step: 3, label: 'Pago / OC Verificado', tone: 'ok' },
    invoiced_dispatched: { id: 'invoiced_dispatched', step: 4, label: 'e-NCF Emitido · En Obra', tone: 'navy' },
    conduce_signed: { id: 'conduce_signed', step: 5, label: 'Conduce Conformado', tone: 'ok' },
    gov_filed: { id: 'gov_filed', step: 6, label: 'Radicado Tesorería (SIGEF)', tone: 'info' },
    settled: { id: 'settled', step: 7, label: 'Cobrado y Liquidado', tone: 'done' },
    cancelled: { id: 'cancelled', step: 8, label: 'Anulado / e-CF 34', tone: 'err' }
  };

  const GOV_CHECKLIST_ITEMS = [
    { key: 'rncVerified', label: 'RNC institucional validado en DGII como entidad pública no comercial (Norma 05-19)' },
    { key: 'poReceived', label: 'Orden de Compra (OC) o Contrato Administrativo DGCP recibido y verificado' },
    { key: 'capVerified', label: 'Certificación de Apropiación Presupuestaria (CAP / Preventivo SIGEF) adjunta' },
    { key: 'compliancePack', label: 'Paquete Green Mile RD vigente adjunto: RPE Activo + Certificación DGII + Certificación TSS' },
    { key: 'conduceStamped', label: 'Conduce de entrega y Acta de Recepción Conformada firmada y sellada en obra pública' },
    { key: 'encfFiled', label: 'Factura Electrónica e-CF 45 emitida y radicada en Cuentas por Pagar (con acuse)' },
    { key: 'treasuryPaid', label: 'Libramiento recibido vía Tesorería Nacional (SIGEF) en cuenta bancaria corporativa' },
    { key: 'isrLetterReceived', label: 'Carta de Retención 5% ISR (Art. 309) recibida y archivada para crédito anual IR-2' }
  ];

  const DEFAULT_ADMIN_CONFIG = {
    companyName: 'GREEN MILE CONSTRUCTION RD, S.R.L.',
    commercialName: 'Green Mile Construction RD',
    rnc: '1-32-05073-8',
    address: 'Av. Winston Churchill, Ens. Piantini, Santo Domingo, D.N., República Dominicana',
    phone: '+1 (809) 555-0100',
    whatsapp: '18095550100',
    email: 'facturacion@greenmilerd.com',
    rpeNumber: 'RPE-2026-04819',
    dgiiCertExpiry: '2026-12-31',
    tssCertExpiry: '2026-12-31',
    ecfCertStatus: 'Activo (Emisor Electrónico DGII · Ley 32-23)',
    banks: [
      { bank: 'Banco Popular Dominicano', type: 'Cuenta Corriente RD$', number: '809-441820-3', sigefPrimary: true },
      { bank: 'Banreservas', type: 'Cuenta Corriente RD$ (Tesorería SIGEF)', number: '960-018492-5', sigefPrimary: true },
      { bank: 'Banco BHD', type: 'Cuenta Empresarial RD$', number: '214-889103-001-2', sigefPrimary: false }
    ],
    standardCommissionPct: 12,
    govCommissionPct: 15,
    cardFeePct: 3.25,
    cardItbisRetentionPct: 2.0,
    govIsrRetentionPct: 5.0,
    adminPin: '2026',
    sequences: {
      E31: { prefix: 'E31', label: 'Crédito Fiscal Electrónico', next: 101, max: 5000, expires: '2027-12-31' },
      E32: { prefix: 'E32', label: 'Factura de Consumo Electrónica', next: 101, max: 5000, expires: '2027-12-31' },
      E45: { prefix: 'E45', label: 'Gubernamental Electrónico', next: 15, max: 1000, expires: '2027-12-31' },
      E44: { prefix: 'E44', label: 'Regímenes Especiales Electrónico', next: 8, max: 1000, expires: '2027-12-31' },
      E34: { prefix: 'E34', label: 'Nota de Crédito Electrónica', next: 1, max: 500, expires: '2027-12-31' },
      E41: { prefix: 'E41', label: 'Comprobante de Compras Electrónico', next: 25, max: 1000, expires: '2027-12-31' }
    }
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtRD(n) {
    const val = Math.round(Number(n) || 0);
    return 'RD$ ' + val.toLocaleString('en-US');
  }

  function fmtRDDecimal(n) {
    const val = Number(n) || 0;
    return 'RD$ ' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadAdminConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || 'null');
      if (!saved) return deepClone(DEFAULT_ADMIN_CONFIG);
      const merged = Object.assign(deepClone(DEFAULT_ADMIN_CONFIG), saved);
      merged.sequences = Object.assign(deepClone(DEFAULT_ADMIN_CONFIG.sequences), saved.sequences || {});
      return merged;
    } catch (_) {
      return deepClone(DEFAULT_ADMIN_CONFIG);
    }
  }

  function saveAdminConfigLocal(cfg) {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
    if (global.GM_FIREBASE && global.GM_FIREBASE.isReady && global.GM_FIREBASE.isReady() && global.GM_FIREBASE.saveAdminConfig) {
      global.GM_FIREBASE.saveAdminConfig(cfg).catch(() => {});
    }
    return cfg;
  }

  function loadPayouts() {
    try {
      return JSON.parse(localStorage.getItem(PAYOUTS_STORAGE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function savePayoutsLocal(list) {
    try {
      localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(list || []));
    } catch (_) {}
  }

  function formatEncf(prefix, seqNum) {
    const p = String(prefix || 'E31').toUpperCase().slice(0, 3);
    const num = Math.max(1, Number(seqNum) || 1);
    return p + String(num).padStart(10, '0');
  }

  function generateSecurityCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function issueNextEncf(typeCode) {
    const code = NCF_TYPES[typeCode] || ['E34', 'E41'].includes(typeCode) ? typeCode : 'E31';
    const cfg = loadAdminConfig();
    if (!cfg.sequences[code]) {
      cfg.sequences[code] = { prefix: code, label: code, next: 1, max: 1000, expires: '2027-12-31' };
    }
    const seq = cfg.sequences[code];
    const currentNum = Number(seq.next) || 1;
    const encf = formatEncf(code, currentNum);
    seq.next = currentNum + 1;
    saveAdminConfigLocal(cfg);
    return {
      encf,
      typeCode: code,
      expires: seq.expires || '2027-12-31',
      securityCode: generateSecurityCode(),
      issuedAt: new Date().toISOString()
    };
  }

  /* Detecta si un RNC/Razón Social corresponde a una institución gubernamental en RD */
  function detectGovEntity(rncRaw, razonSocial) {
    const digits = String(rncRaw || '').replace(/\D/g, '');
    const nameUpper = String(razonSocial || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    const govKeywords = [
      'MINISTERIO', 'AYUNTAMIENTO', 'ALCALDIA', 'DIRECCION GENERAL',
      'INSTITUTO NACIONAL', 'PRESIDENCIA DE LA REPUBLICA', 'SENADO',
      'CAMARA DE DIPUTADOS', 'PROCURADURIA', 'INAPA', 'CAASD', 'CORAASAN',
      'CORAAMOCA', 'CORAAPLATA', 'MOPC', 'OBRAS PUBLICAS', 'EGEHID',
      'INTRANT', 'OPRET', 'GOBERNACION', 'CONSEJO NACIONAL', 'SERVICIO NACIONAL',
      'JUNTA DISTRITAL', 'TESORERIA NACIONAL', 'CONTRALORIA', 'SUPERINTENDENCIA',
      'COMISION PRESIDENCIAL', 'AUTORIDAD PORTUARIA', 'INDHRI', 'INDRHI', 'INABIE'
    ];

    const keywordHit = govKeywords.some((kw) => nameUpper.includes(kw));
    const rncStartsWith4 = digits.length === 9 && digits.startsWith('4');

    return {
      isLikelyGov: keywordHit || (rncStartsWith4 && nameUpper.length > 0 && !nameUpper.includes('IGLESIA') && !nameUpper.includes('FUNDACION')),
      rncStartsWith4,
      keywordHit
    };
  }

  /* Validador de Tarjeta de Crédito / Débito (Luhn + Red + Vencimiento + CVV — PCI-Safe) */
  function formatCardNumber(raw) {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 16);
    if (/^3[47]/.test(d)) {
      return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
    }
    return d.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function formatCardExpiry(raw) {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) return d.slice(0, 2) + '/' + d.slice(2);
    return d;
  }

  function detectCardBrand(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (/^4/.test(d)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'AMEX';
    if (/^6(?:011|5)/.test(d)) return 'Discover';
    return 'Tarjeta';
  }

  function luhnCheck(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = parseInt(d[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validateCard({ number, expiry, cvv, holder }) {
    const digits = String(number || '').replace(/\D/g, '');
    const brand = detectCardBrand(digits);
    const cleanHolder = String(holder || '').trim();
    const cleanCvv = String(cvv || '').replace(/\D/g, '');

    if (cleanHolder.length < 3) {
      return { valid: false, error: 'Ingresa el nombre del titular tal como figura en la tarjeta.' };
    }
    if ((brand === 'AMEX' && digits.length !== 15) || (brand !== 'AMEX' && digits.length < 16)) {
      return { valid: false, error: 'Número de tarjeta incompleto. Verifica los dígitos.' };
    }
    if (!luhnCheck(digits)) {
      return { valid: false, error: 'Número de tarjeta inválido (falló verificación Luhn).' };
    }

    const expMatch = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
    if (!expMatch) {
      return { valid: false, error: 'Fecha de vencimiento inválida. Usa formato MM/AA.' };
    }
    const mm = Number(expMatch[1]);
    const yy = 2000 + Number(expMatch[2]);
    if (mm < 1 || mm > 12) {
      return { valid: false, error: 'El mes de vencimiento debe estar entre 01 y 12.' };
    }
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    if (yy < curY || (yy === curY && mm < curM)) {
      return { valid: false, error: 'La tarjeta ingresada está vencida.' };
    }

    const expectedCvvLen = brand === 'AMEX' ? 4 : 3;
    if (cleanCvv.length !== expectedCvvLen) {
      return { valid: false, error: `El código de seguridad (CVV) debe tener ${expectedCvvLen} dígitos.` };
    }

    const authCode = 'GM' + String(Math.floor(100000 + Math.random() * 900000));
    return {
      valid: true,
      brand,
      last4: digits.slice(-4),
      holder: cleanHolder.toUpperCase(),
      expiry: expMatch[0],
      authCode,
      processedAt: new Date().toISOString()
    };
  }

  /* Motor Central de Cálculo Fiscal, Retenciones y Liquidación al Propietario */
  function calculateFinancials({
    baseAmount = 0,
    proDiscount = 0,
    transportCost = 0,
    ncfType = 'E31',
    paymentMethod = 'card',
    govApplyItbisRet = false,
    commissionPct = null,
    ownerRnc = '',
    config = null
  }) {
    const cfg = config || loadAdminConfig();
    const ncfMeta = NCF_TYPES[ncfType] || NCF_TYPES.E31;

    const base = Math.max(0, Math.round(Number(baseAmount) || 0));
    const disc = Math.max(0, Math.round(Number(proDiscount) || 0));
    const trans = Math.max(0, Math.round(Number(transportCost) || 0));
    const netSubtotal = Math.max(0, base - disc + trans);

    const itbisRate = ncfMeta.itbisRate;
    const itbis = Math.round(netSubtotal * itbisRate);
    const total = netSubtotal + itbis;

    // Retenciones Gubernamentales (e-CF 45 / Ley 11-92 Art. 309 + Norma 02-05 si aplica)
    const govIsrRetention = ncfMeta.isGov ? Math.round(netSubtotal * ((cfg.govIsrRetentionPct || 5) / 100)) : 0;
    const govItbisRetention = (ncfMeta.isGov && govApplyItbisRet) ? Math.round(itbis * 0.30) : 0;
    const expectedTreasuryNet = total - govIsrRetention - govItbisRetention;

    // Conciliación de Tarjeta (Comisión Adquirencia + Retención 2% ITBIS Norma 08-04 / 06-23)
    const isCard = paymentMethod === 'card';
    const cardGatewayFee = isCard ? Math.round(total * ((cfg.cardFeePct || 3.25) / 100)) : 0;
    const cardItbisRetention = isCard ? Math.round(total * ((cfg.cardItbisRetentionPct || 2.0) / 100)) : 0;

    let expectedBankDeposit = total;
    if (isCard) {
      expectedBankDeposit = total - cardGatewayFee - cardItbisRetention;
    } else if (ncfMeta.isGov) {
      expectedBankDeposit = expectedTreasuryNet;
    }

    // Liquidación al Propietario del Equipo
    const defaultComm = ncfMeta.isGov ? (cfg.govCommissionPct || 15) : (cfg.standardCommissionPct || 12);
    const gmCommissionPct = commissionPct != null ? Number(commissionPct) : defaultComm;
    const gmCommissionAmount = Math.round(netSubtotal * (gmCommissionPct / 100));
    const ownerGrossPayout = Math.max(0, netSubtotal - gmCommissionAmount);

    const ownerDigits = String(ownerRnc || '').replace(/\D/g, '');
    const ownerIsIndividual = ownerDigits.length === 11;
    const ownerFiscalDoc = ownerIsIndividual ? 'E41 (Comprobante de Compras)' : 'E31 (Factura Crédito Fiscal Propietario)';
    const ownerItbisBilled = Math.round(ownerGrossPayout * 0.18);
    // Si es Persona Física (Cédula 11 dígitos): Green Mile emite e-CF 41 y retiene 100% ITBIS + 10% ISR (o 2% servicio técnico; usamos 10% ISR estándar servicios/alquiler persona física)
    // Si es Persona Jurídica (RNC 9 dígitos): Propietario factura e-CF 31 con ITBIS 18% (Green Mile paga subtotal + 70% ITBIS si aplica Norma 02-05/07-07, o 100% ITBIS si exento de retención)
    const ownerIsrRetained = ownerIsIndividual ? Math.round(ownerGrossPayout * 0.10) : 0;
    const ownerItbisRetained = ownerIsIndividual ? ownerItbisBilled : Math.round(ownerItbisBilled * 0.30);
    const ownerNetTransfer = ownerIsIndividual
      ? (ownerGrossPayout - ownerIsrRetained)
      : (ownerGrossPayout + ownerItbisBilled - ownerItbisRetained);

    const gmNetMargin = gmCommissionAmount - cardGatewayFee;

    return {
      ncfType: ncfMeta.code,
      ncfMeta,
      base,
      disc,
      trans,
      netSubtotal,
      itbisRate,
      itbis,
      total,
      govIsrRetention,
      govItbisRetention,
      expectedTreasuryNet,
      cardGatewayFee,
      cardItbisRetention,
      expectedBankDeposit,
      gmCommissionPct,
      gmCommissionAmount,
      ownerGrossPayout,
      ownerIsIndividual,
      ownerFiscalDoc,
      ownerItbisBilled,
      ownerIsrRetained,
      ownerItbisRetained,
      ownerNetTransfer,
      gmNetMargin
    };
  }

  /* Normaliza reservas antiguas (retrocompatibilidad con bookings creados antes de v2) */
  function normalizeBooking(raw) {
    const b = Object.assign({}, raw || {});
    const ncfType = b.ncfType || (b.ncf === false ? 'E32' : 'E31');
    const paymentMethod = b.paymentMethod || (ncfType === 'E45' ? 'gov_po' : 'transfer');
    const defaultStage = ncfType === 'E45'
      ? 'gov_review'
      : (paymentMethod === 'card' && b.paymentStatus === 'paid' ? 'invoiced_dispatched' : 'pending_validation');

    const cfg = loadAdminConfig();
    const fin = calculateFinancials({
      baseAmount: b.baseAmount != null ? b.baseAmount : (b.netSubtotal || 0),
      proDiscount: b.proDiscount || 0,
      transportCost: b.transportCost || 0,
      ncfType,
      paymentMethod,
      govApplyItbisRet: Boolean(b.govApplyItbisRet),
      commissionPct: b.gmCommissionPct != null ? b.gmCommissionPct : null,
      ownerRnc: b.ownerRnc || '',
      config: cfg
    });

    // Respect original stored numbers if already computed
    const netSubtotal = b.netSubtotal != null ? Number(b.netSubtotal) : fin.netSubtotal;
    const itbis = b.itbis != null ? Number(b.itbis) : fin.itbis;
    const total = b.total != null ? Number(b.total) : fin.total;

    return Object.assign({}, b, {
      ncfType,
      ncfMeta: NCF_TYPES[ncfType] || NCF_TYPES.E31,
      paymentMethod,
      paymentStatus: b.paymentStatus || (paymentMethod === 'card' ? 'paid' : 'pending'),
      stage: b.stage || defaultStage,
      netSubtotal,
      itbis,
      total,
      govIsrRetention: b.govIsrRetention != null ? Number(b.govIsrRetention) : (ncfType === 'E45' ? Math.round(netSubtotal * 0.05) : 0),
      govItbisRetention: b.govItbisRetention != null ? Number(b.govItbisRetention) : (ncfType === 'E45' && b.govApplyItbisRet ? Math.round(itbis * 0.30) : 0),
      cardGatewayFee: b.cardGatewayFee != null ? Number(b.cardGatewayFee) : (paymentMethod === 'card' ? Math.round(total * ((cfg.cardFeePct || 3.25) / 100)) : 0),
      cardItbisRetention: b.cardItbisRetention != null ? Number(b.cardItbisRetention) : (paymentMethod === 'card' ? Math.round(total * ((cfg.cardItbisRetentionPct || 2) / 100)) : 0),
      govChecklist: Object.assign({}, b.govChecklist || {}),
      govData: Object.assign({
        poNumber: '',
        capNumber: '',
        entityEmail: '',
        paymentTermsDays: 45,
        filedDate: '',
        libramientoNumber: '',
        isrLetterNumber: ''
      }, b.govData || {}),
      conduce: Object.assign({
        number: '',
        signedDate: '',
        receiverName: '',
        notes: ''
      }, b.conduce || {}),
      settlement: Object.assign({
        status: 'pending',
        commissionPct: b.gmCommissionPct != null ? Number(b.gmCommissionPct) : fin.gmCommissionPct,
        ownerGrossPayout: fin.ownerGrossPayout,
        ownerNetTransfer: fin.ownerNetTransfer,
        ownerFiscalDoc: fin.ownerFiscalDoc,
        ownerNcf: '',
        transferRef: '',
        paidDate: ''
      }, b.settlement || {})
    });
  }

  /* Genera un código QR SVG determinístico para la representación impresa e-CF (DGII) */
  function buildDeterministicQrSvg(seedText, size = 96) {
    const cells = 21;
    let hash = 2166136261;
    const str = String(seedText || 'GREEN-MILE-RD');
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const isFinder = (r, c) =>
      (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);

    let rects = '';
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        let on = false;
        if (isFinder(r, c)) {
          const lr = r < 7 ? r : r - (cells - 7);
          const lc = c < 7 ? c : c - (cells - 7);
          on = (lr === 0 || lr === 6 || lc === 0 || lc === 6) || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
        } else {
          const h = Math.imul(hash ^ ((r * 31 + c * 17) * 2654435761), 1597334677);
          on = ((h >>> 24) & 3) === 0 || ((r + c) % 5 === 0 && ((h >>> 16) & 1) === 1);
        }
        if (on) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0D223A"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${cells} ${cells}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:4px;">${rects}</svg>`;
  }

  function paymentSummaryText(b) {
    const pm = PAYMENT_METHODS[b.paymentMethod] || PAYMENT_METHODS.transfer;
    if (b.paymentMethod === 'card' && b.cardInfo) {
      return `${pm.icon} ${b.cardInfo.brand} •••• ${b.cardInfo.last4} (Aut. ${b.cardInfo.authCode})`;
    }
    if (b.paymentMethod === 'gov_po') {
      return `${pm.icon} Orden de Compra ${b.govData?.poNumber || 'Pendiente'} • Libramiento ${b.govData?.paymentTermsDays || 45}d`;
    }
    if (b.paymentMethod === 'transfer') {
      return `${pm.icon} Transferencia${b.transferBank ? ' (' + b.transferBank + ')' : ''}${b.transferRef ? ' • Ref: ' + b.transferRef : ''}`;
    }
    return `${pm.icon} ${pm.label}`;
  }

  function paymentStatusBadge(b) {
    if (b.stage === 'cancelled') return { text: 'ANULADA', color: '#991B1B', bg: '#FEF2F2' };
    if (b.paymentStatus === 'paid') return { text: 'PAGADO', color: '#065F46', bg: '#ECFDF5' };
    if (b.paymentMethod === 'gov_po' || b.ncfType === 'E45') return { text: 'CRÉDITO ESTATAL (SIGEF)', color: '#1E40AF', bg: '#EFF6FF' };
    if (b.paymentMethod === 'credit') return { text: 'CRÉDITO CORPORATIVO', color: '#92400E', bg: '#FFFBEB' };
    return { text: 'PENDIENTE VALIDACIÓN', color: '#92400E', bg: '#FFFBEB' };
  }

  /* =========================================================
     REPRESENTACIÓN IMPRESA: CONTRATO DIGITAL FIRMADO
     ========================================================= */
  function buildPrintableContractHtml(rawBooking, config, logoSrc) {
    const cfg = config || loadAdminConfig();
    const b = normalizeBooking(rawBooking);
    const ncfMeta = b.ncfMeta;
    const pBadge = paymentStatusBadge(b);
    const rangeLabel = b.endDate && b.endDate !== b.startDate
      ? `del ${esc(b.startDate)} al ${esc(b.endDate)}`
      : `desde ${esc(b.startDate || 'A coordinar')}`;
    const expectedNetGov = b.total - (b.govIsrRetention || 0) - (b.govItbisRetention || 0);
    const gpsLine = (b.worksiteLat != null && b.worksiteLng != null)
      ? `<br><a href="https://www.google.com/maps?q=${esc(b.worksiteLat)},${esc(b.worksiteLng)}" target="_blank" rel="noopener" style="color:#B85A27; font-weight:700;">📍 GPS: ${Number(b.worksiteLat).toFixed(5)}, ${Number(b.worksiteLng).toFixed(5)}</a>`
      : '';
    const distLine = b.distanceKm
      ? `<div><strong>Logística / Traslado Lowboy:</strong> ${esc(b.distanceKm)} km desde ${esc(b.city)} ${b.transportCost > 0 ? `(${fmtRD(b.transportCost)})` : '(Retiro en patio)'}</div>`
      : '';
    const permitsBlock = Array.isArray(b.worksitePermits) && b.worksitePermits.length
      ? `<div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:10px 12px; font-size:11.5px; color:#78350F; margin-bottom:12px;">
          <strong>Permisos y Accesos de Obra RD:</strong> ${b.worksitePermits.map(esc).join(' • ')}<br>
          <span style="font-size:10.5px;">El contratista declara contar con estos permisos vigentes antes de la llegada del equipo y asume costos de standby, retención o viaje en vacío por falta de permisos.</span>
        </div>`
      : '';

    return `
      <div style="border:1.5px solid #CBD5E1; border-radius:14px; padding:22px; background:#fff; color:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid #0D223A; padding-bottom:12px; margin-bottom:14px; gap:12px;">
          <div>
            <strong style="font-size:16px; color:#0D223A; display:block;">${esc(cfg.companyName)}</strong>
            <div style="font-size:11px; color:#475569;">RNC: ${esc(cfg.rnc)} • RPE Estado: ${esc(cfg.rpeNumber)}</div>
            <div style="font-size:11.5px; font-weight:800; color:#B85A27; margin-top:2px;">CONTRATO DIGITAL #GM-${String(b.id).slice(-6)}</div>
          </div>
          ${logoSrc ? `<img src="${esc(logoSrc)}" style="height:54px; object-fit:contain;" alt="Green Mile RD">` : ''}
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
          <span style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:99px; background:#0D223A; color:#fff;">${esc(ncfMeta.badge)} • ${esc(ncfMeta.name)}</span>
          <span style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:99px; background:${pBadge.bg}; color:${pBadge.color};">${pBadge.text}</span>
          ${b.encfNumber ? `<span style="font-size:11px; font-weight:800; padding:4px 10px; border-radius:99px; background:#FEF4EE; color:#B85A27;">e-NCF: ${esc(b.encfNumber)}</span>` : ''}
        </div>

        <div style="font-size:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div style="background:#F8FAFC; padding:11px; border-radius:10px; border:1px solid #E2E8F0;">
            <strong style="color:#0D223A; display:block; margin-bottom:3px;">GESTOR Y FACTURADOR</strong>
            ${esc(cfg.commercialName)}<br>
            RNC: ${esc(cfg.rnc)}<br>
            Tel: ${esc(cfg.phone)}<br>
            ${esc(cfg.email)}
          </div>
          <div style="background:#F8FAFC; padding:11px; border-radius:10px; border:1px solid #E2E8F0;">
            <strong style="color:#0D223A; display:block; margin-bottom:3px;">${ncfMeta.isGov ? 'ENTIDAD CONTRATANTE (ESTADO)' : 'CONTRATISTA / CLIENTE'}</strong>
            ${esc(b.renter)}<br>
            RNC/Cédula: ${esc(b.renterRnc)}<br>
            Obra: ${esc(b.address)}${gpsLine}
            ${b.exemptionCode ? `<br>Res. Exención DGII: <strong>${esc(b.exemptionCode)}</strong>` : ''}
          </div>
        </div>

        ${ncfMeta.isGov ? `
          <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:11px 12px; font-size:12px; margin-bottom:14px; color:#1E3A8A;">
            <strong style="display:block; margin-bottom:4px;">🏛️ EXPEDIENTE GUBERNAMENTAL (LEY 340-06 · COMPROBANTE e-CF 45)</strong>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px;">
              <span><strong>Orden de Compra / Contrato:</strong> ${esc(b.govData.poNumber || 'Pendiente adjuntar')}</span>
              <span><strong>Cert. Presupuestaria (CAP):</strong> ${esc(b.govData.capNumber || 'N/A')}</span>
              <span><strong>Correo Institucional:</strong> ${esc(b.govData.entityEmail || 'N/A')}</span>
              <span><strong>Plazo Libramiento SIGEF:</strong> ${esc(b.govData.paymentTermsDays || 45)} días</span>
            </div>
          </div>
        ` : ''}

        <div style="font-size:12.5px; margin-bottom:12px; line-height:1.55;">
          <div><strong>Maquinaria Asignada:</strong> ${esc(b.title)} (${esc(b.city)})</div>
          ${distLine}
          <div><strong>Período de Alquiler:</strong> ${esc(b.qty)} ${esc(b.unitLabel)} (${rangeLabel})</div>
          <div><strong>Modalidad de Pago:</strong> ${esc(paymentSummaryText(b))}</div>
        </div>
        ${permitsBlock}

        <div style="background:#F1F5F9; padding:13px 14px; border-radius:10px; font-size:12.5px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Subtotal Neto (Equipo + Traslado):</span><span>${fmtRD(b.netSubtotal)}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>${ncfMeta.isExempt ? 'ITBIS 0% (Exento · e-CF 44)' : `ITBIS 18% (${ncfMeta.badge})`}</span>
            <span>${fmtRD(b.itbis)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; color:#0D223A; border-top:1px solid #CBD5E1; margin-top:6px; padding-top:6px;">
            <span>Total Facturado (${esc(ncfMeta.badge)}):</span><span>${fmtRD(b.total)}</span>
          </div>
          ${ncfMeta.isGov ? `
            <div style="border-top:1px dashed #94A3B8; margin-top:8px; padding-top:8px; font-size:11.5px; color:#334155;">
              <div style="display:flex; justify-content:space-between;"><span>(−) Retención 5% ISR Estado (Art. 309 Cód. Tributario):</span><span>− ${fmtRD(b.govIsrRetention)}</span></div>
              ${b.govItbisRetention > 0 ? `<div style="display:flex; justify-content:space-between;"><span>(−) Retención 30% ITBIS Estatal (Norma 02-05):</span><span>− ${fmtRD(b.govItbisRetention)}</span></div>` : ''}
              <div style="display:flex; justify-content:space-between; font-weight:800; color:#1E40AF; margin-top:3px;"><span>Desembolso Neto Esperado Tesorería Nacional:</span><span>${fmtRD(expectedNetGov)}</span></div>
            </div>
          ` : ''}
        </div>

        <div style="font-size:10.5px; color:#475569; line-height:1.45; margin-bottom:14px; border-top:1px solid #E2E8F0; padding-top:10px;">
          <strong>Cláusulas Esenciales:</strong> (1) Green Mile Construction RD centraliza la facturación electrónica (e-CF / DGII), el cobro y la liquidación al propietario contra conduce conformado en obra. (2) El contratista garantiza acceso seguro y resguardo de la unidad durante la vigencia del contrato. (3) Queda prohibida la contratación directa por fuera de la plataforma (cláusula anti-elusión).
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; text-align:center; margin-top:10px;">
          <div>
            <div style="height:52px; display:flex; align-items:flex-end; justify-content:center; border-bottom:1px solid #0D223A; margin-bottom:4px; font-style:italic; font-weight:800; color:#0D223A; font-size:13px; padding-bottom:6px;">Green Mile RD · Autorizado</div>
            <span style="font-size:10.5px; font-weight:700; color:#475569;">Gestor / Facturador e-CF</span>
          </div>
          <div>
            ${b.signature
              ? `<img src="${b.signature}" alt="Firma" style="height:52px; border-bottom:1px solid #0D223A; margin:0 auto 4px; display:block;">`
              : `<div style="height:52px; border-bottom:1px solid #0D223A; margin-bottom:4px;"></div>`}
            <span style="font-size:10.5px; font-weight:700; color:#0D223A;">Firma Digital — ${esc(b.renter)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     REPRESENTACIÓN IMPRESA: FACTURA ELECTRÓNICA e-CF (DGII)
     ========================================================= */
  function buildPrintableInvoiceHtml(rawBooking, config, logoSrc) {
    const cfg = config || loadAdminConfig();
    const b = normalizeBooking(rawBooking);
    const ncfMeta = b.ncfMeta;
    const isOfficial = Boolean(b.encfNumber);
    const docNumber = b.encfNumber || `PROFORMA-${String(b.id).slice(-6)}`;
    const secCode = b.encfSecurityCode || 'PENDIE';
    const issueDate = b.encfIssuedAt ? new Date(b.encfIssuedAt).toLocaleDateString('es-DO') : new Date(b.id || Date.now()).toLocaleDateString('es-DO');
    const expDate = b.encfExpires || (cfg.sequences[b.ncfType] && cfg.sequences[b.ncfType].expires) || '2027-12-31';
    const qrSvg = buildDeterministicQrSvg(`${cfg.rnc}|${docNumber}|${b.renterRnc}|${b.total}|${secCode}`, 92);
    const expectedNetGov = b.total - (b.govIsrRetention || 0) - (b.govItbisRetention || 0);

    return `
      <div style="border:1.5px solid #0D223A; border-radius:14px; padding:22px; background:#fff; color:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px; border-bottom:2px solid #0D223A; padding-bottom:14px; margin-bottom:14px; flex-wrap:wrap;">
          <div style="flex:1; min-width:220px;">
            ${logoSrc ? `<img src="${esc(logoSrc)}" style="height:40px; object-fit:contain; margin-bottom:6px; display:block;" alt="Green Mile RD">` : ''}
            <strong style="font-size:15px; color:#0D223A; display:block;">${esc(cfg.companyName)}</strong>
            <div style="font-size:11px; color:#475569; line-height:1.45;">
              RNC: <strong>${esc(cfg.rnc)}</strong> • RPE: <strong>${esc(cfg.rpeNumber)}</strong><br>
              ${esc(cfg.address)}<br>
              Tel: ${esc(cfg.phone)} • ${esc(cfg.email)}
            </div>
          </div>
          <div style="background:#F8FAFC; border:1.5px solid #0D223A; border-radius:10px; padding:11px 13px; min-width:235px;">
            <div style="font-size:10px; font-weight:800; color:#B85A27; text-transform:uppercase; letter-spacing:0.4px;">
              ${isOfficial ? 'COMPROBANTE FISCAL ELECTRÓNICO (e-CF)' : 'FACTURA PROFORMA · PENDIENTE EMISIÓN e-NCF'}
            </div>
            <strong style="font-size:13px; color:#0D223A; display:block; margin:2px 0;">${esc(ncfMeta.name)}</strong>
            <div style="font-size:13px; font-weight:900; color:#0D223A; font-family:monospace; letter-spacing:0.6px;">e-NCF: ${esc(docNumber)}</div>
            <div style="font-size:10.5px; color:#475569; margin-top:4px;">
              Fecha Emisión: <strong>${esc(issueDate)}</strong><br>
              Válido hasta: <strong>${esc(expDate)}</strong>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:11.5px; margin-bottom:14px;">
          <div style="background:#F8FAFC; padding:10px 12px; border-radius:9px; border:1px solid #E2E8F0;">
            <strong style="color:#0D223A; display:block; margin-bottom:3px;">DATOS DEL COMPRADOR</strong>
            Razón Social: <strong>${esc(b.renter)}</strong><br>
            RNC / Cédula: <strong>${esc(b.renterRnc)}</strong><br>
            Proyecto / Obra: ${esc(b.address)}
            ${b.exemptionCode ? `<br>Resolución Exención: <strong>${esc(b.exemptionCode)}</strong>` : ''}
          </div>
          <div style="background:#F8FAFC; padding:10px 12px; border-radius:9px; border:1px solid #E2E8F0;">
            <strong style="color:#0D223A; display:block; margin-bottom:3px;">CONDICIONES DE PAGO Y REFERENCIA</strong>
            Forma de Pago: <strong>${esc(paymentSummaryText(b))}</strong><br>
            Contrato Ref.: <strong>#GM-${String(b.id).slice(-6)}</strong><br>
            ${b.ncfType === 'E45' ? `Orden de Compra: <strong>${esc(b.govData.poNumber || 'Por registrar')}</strong><br>CAP / SIGEF: <strong>${esc(b.govData.capNumber || 'N/A')}</strong>` : `Conduce Obra: <strong>${esc(b.conduce.number || 'Pendiente entrega')}</strong>`}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
          <thead>
            <tr style="background:#0D223A; color:#fff; text-align:left;">
              <th style="padding:8px 10px; border-radius:6px 0 0 0;">Cant.</th>
              <th style="padding:8px 10px;">Descripción del Servicio</th>
              <th style="padding:8px 10px; text-align:right;">ITBIS</th>
              <th style="padding:8px 10px; text-align:right; border-radius:0 6px 0 0;">Valor Neto</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:9px 10px; font-weight:700;">${esc(b.qty)} ${esc(b.unitLabel)}</td>
              <td style="padding:9px 10px;">
                <strong>Alquiler ${esc(b.title)}</strong><br>
                <span style="font-size:11px; color:#64748B;">Ubicación: ${esc(b.city)} • Fechas: ${esc(b.startDate || '')}${b.endDate && b.endDate !== b.startDate ? ' al ' + esc(b.endDate) : ''}</span>
              </td>
              <td style="padding:9px 10px; text-align:right;">${ncfMeta.isExempt ? '0% Exento' : '18%'}</td>
              <td style="padding:9px 10px; text-align:right; font-weight:700;">${fmtRDDecimal(b.netSubtotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div style="display:flex; gap:12px; align-items:center; flex:1; min-width:220px;">
            ${qrSvg}
            <div style="font-size:10.5px; color:#475569; line-height:1.45;">
              <strong style="color:#0D223A; display:block;">Timbre Fiscal Electrónico DGII</strong>
              Código de Seguridad: <strong style="font-family:monospace; color:#0D223A;">${esc(secCode)}</strong><br>
              Estado DGII: <strong>${isOfficial ? 'Aceptado Electrónicamente (Ley 32-23)' : 'Borrador / Proforma'}</strong><br>
              Verificable en portal e-CF de Impuestos Internos.
            </div>
          </div>

          <div style="min-width:275px; background:#F1F5F9; border-radius:10px; padding:12px 14px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; gap:14px; margin-bottom:4px;"><span>Monto Gravado:</span><span>${fmtRDDecimal(ncfMeta.isExempt ? 0 : b.netSubtotal)}</span></div>
            ${ncfMeta.isExempt ? `<div style="display:flex; justify-content:space-between; gap:14px; margin-bottom:4px;"><span>Monto Exento (e-CF 44):</span><span>${fmtRDDecimal(b.netSubtotal)}</span></div>` : ''}
            <div style="display:flex; justify-content:space-between; gap:14px; margin-bottom:4px;"><span>ITBIS 18%:</span><span>${fmtRDDecimal(b.itbis)}</span></div>
            <div style="display:flex; justify-content:space-between; gap:14px; font-size:14.5px; font-weight:900; color:#0D223A; border-top:1.5px solid #94A3B8; margin-top:6px; padding-top:6px;">
              <span>TOTAL FACTURA:</span><span>${fmtRDDecimal(b.total)}</span>
            </div>
            ${b.ncfType === 'E45' ? `
              <div style="border-top:1px dashed #94A3B8; margin-top:7px; padding-top:7px; font-size:11px; color:#1E40AF;">
                <div style="display:flex; justify-content:space-between; gap:14px;"><span>Ret. 5% ISR Estado (Art. 309):</span><span style="white-space:nowrap;">− ${fmtRDDecimal(b.govIsrRetention)}</span></div>
                ${b.govItbisRetention > 0 ? `<div style="display:flex; justify-content:space-between; gap:14px;"><span>Ret. 30% ITBIS Estado:</span><span style="white-space:nowrap;">− ${fmtRDDecimal(b.govItbisRetention)}</span></div>` : ''}
                <div style="display:flex; justify-content:space-between; gap:14px; font-weight:800; margin-top:3px;"><span>Neto Libramiento SIGEF:</span><span style="white-space:nowrap;">${fmtRDDecimal(expectedNetGov)}</span></div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     CARÁTULA DE RADICACIÓN GUBERNAMENTAL (LEY 340-06 / SIGEF)
     ========================================================= */
  function buildGovDossierHtml(rawBooking, config, logoSrc) {
    const cfg = config || loadAdminConfig();
    const b = normalizeBooking(rawBooking);
    const sigefBank = (cfg.banks || []).find((x) => x.sigefPrimary) || (cfg.banks || [])[0] || { bank: 'Banreservas', number: 'Por configurar', type: 'Corriente RD$' };
    const expectedNet = b.total - (b.govIsrRetention || 0) - (b.govItbisRetention || 0);

    return `
      <div style="border:2px solid #0D223A; border-radius:14px; padding:22px; background:#fff; color:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0D223A; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <div style="font-size:10.5px; font-weight:800; color:#B85A27; text-transform:uppercase;">EXPEDIENTE DE RADICACIÓN DE COBRO ESTATAL • LEY 340-06</div>
            <strong style="font-size:17px; color:#0D223A;">${esc(cfg.companyName)}</strong>
            <div style="font-size:11.5px; color:#475569;">RNC: ${esc(cfg.rnc)} • RPE Proveedor del Estado: <strong>${esc(cfg.rpeNumber)}</strong></div>
          </div>
          ${logoSrc ? `<img src="${esc(logoSrc)}" style="height:44px; object-fit:contain;" alt="Green Mile RD">` : ''}
        </div>

        <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:12px;">
          <strong style="color:#1E3A8A; display:block; margin-bottom:6px;">DESTINATARIO — DEPARTAMENTO DE CUENTAS POR PAGAR / COMPRAS PÚBLICAS</strong>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 14px;">
            <div><strong>Institución:</strong> ${esc(b.renter)}</div>
            <div><strong>RNC Institucional:</strong> ${esc(b.renterRnc)}</div>
            <div><strong>No. Orden de Compra / Contrato:</strong> ${esc(b.govData.poNumber || 'PENDIENTE')}</div>
            <div><strong>No. CAP / Preventivo SIGEF:</strong> ${esc(b.govData.capNumber || 'N/A')}</div>
            <div><strong>Factura e-CF 45 (e-NCF):</strong> ${esc(b.encfNumber || 'Pendiente de emisión')}</div>
            <div><strong>Conduce / Acta Conformada:</strong> ${esc(b.conduce.number || 'Pendiente firma obra')}</div>
          </div>
        </div>

        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:12px;">
          <strong style="color:#0D223A; display:block; margin-bottom:6px;">RESUMEN FINANCIERO Y RETENCIONES DE LEY (ART. 309 CÓD. TRIBUTARIO)</strong>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>Servicio: ${esc(b.title)} (${b.qty} ${esc(b.unitLabel)} en ${esc(b.city)})</span><strong>${fmtRDDecimal(b.netSubtotal)}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>ITBIS 18% Transparentado (e-CF 45):</span><span>${fmtRDDecimal(b.itbis)}</span></div>
          <div style="display:flex; justify-content:space-between; font-weight:800; color:#0D223A; border-top:1px solid #CBD5E1; padding-top:4px; margin-top:4px;"><span>Monto Total Factura e-CF 45:</span><span>${fmtRDDecimal(b.total)}</span></div>
          <div style="display:flex; justify-content:space-between; color:#B45309; margin-top:4px;"><span>(−) Retención 5% ISR Proveedores del Estado (Art. 309 lit. e):</span><span>− ${fmtRDDecimal(b.govIsrRetention)}</span></div>
          ${b.govItbisRetention > 0 ? `<div style="display:flex; justify-content:space-between; color:#B45309;"><span>(−) Retención 30% ITBIS Estatal (Norma 02-05):</span><span>− ${fmtRDDecimal(b.govItbisRetention)}</span></div>` : ''}
          <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:900; color:#065F46; border-top:1.5px solid #065F46; margin-top:6px; padding-top:6px;">
            <span>NETO A LIBRAR POR TESORERÍA NACIONAL (SIGEF):</span><span>${fmtRDDecimal(expectedNet)}</span>
          </div>
        </div>

        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:12px;">
          <strong style="color:#0D223A; display:block; margin-bottom:6px;">CUENTA BANCARIA REGISTRADA EN DIGECOG / SIGEF</strong>
          Beneficiario: <strong>${esc(cfg.companyName)}</strong> (RNC ${esc(cfg.rnc)})<br>
          Banco: <strong>${esc(sigefBank.bank)}</strong> • ${esc(sigefBank.type)} • Cuenta No.: <strong>${esc(sigefBank.number)}</strong>
        </div>

        <div style="font-size:12px; margin-bottom:14px;">
          <strong style="color:#0D223A; display:block; margin-bottom:6px;">DOCUMENTOS ADJUNTOS EN EL EXPEDIENTE</strong>
          <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:5px;">
            ${GOV_CHECKLIST_ITEMS.map((item) => `
              <li>${b.govChecklist[item.key] ? '☑' : '☐'} ${esc(item.label)}</li>
            `).join('')}
          </ul>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:22px; font-size:11px; text-align:center;">
          <div style="border-top:1px solid #0D223A; padding-top:6px;">
            <strong>Preparado por Administración Green Mile RD</strong><br>
            Certificación DGII vigente hasta ${esc(cfg.dgiiCertExpiry)} • TSS ${esc(cfg.tssCertExpiry)}
          </div>
          <div style="border-top:1px solid #0D223A; padding-top:6px;">
            <strong>Acuse de Recibo — Institución Estatal</strong><br>
            Nombre, Firma, Sello y Fecha de Radicación
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     COMPROBANTE DE LIQUIDACIÓN AL PROPIETARIO
     ========================================================= */
  function buildOwnerSettlementHtml(rawBooking, config, logoSrc) {
    const cfg = config || loadAdminConfig();
    const b = normalizeBooking(rawBooking);
    const fin = calculateFinancials({
      baseAmount: b.netSubtotal,
      ncfType: b.ncfType,
      paymentMethod: b.paymentMethod,
      commissionPct: b.settlement.commissionPct,
      ownerRnc: b.ownerRnc,
      config: cfg
    });

    return `
      <div style="border:1.5px solid #0D223A; border-radius:14px; padding:22px; background:#fff; color:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0D223A; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <div style="font-size:10.5px; font-weight:800; color:#059669; text-transform:uppercase;">COMPROBANTE DE LIQUIDACIÓN A PROPIETARIO</div>
            <strong style="font-size:16px; color:#0D223A;">${esc(cfg.companyName)}</strong>
            <div style="font-size:11px; color:#475569;">Contrato #GM-${String(b.id).slice(-6)} • Conduce: ${esc(b.conduce.number || 'Registrado')}</div>
          </div>
          ${logoSrc ? `<img src="${esc(logoSrc)}" style="height:40px; object-fit:contain;" alt="Green Mile RD">` : ''}
        </div>

        <div style="font-size:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:11px 13px; margin-bottom:14px;">
          <strong>PROPIETARIO DEL EQUIPO:</strong> ${esc(b.owner)}<br>
          <strong>RNC / Cédula:</strong> ${esc(b.ownerRnc || 'N/A')} (${fin.ownerIsIndividual ? 'Persona Física — Aplica e-CF 41' : 'Persona Jurídica — Factura e-CF 31'})<br>
          <strong>Equipo Alquilado:</strong> ${esc(b.title)} (${b.qty} ${esc(b.unitLabel)} en ${esc(b.city)})<br>
          <strong>Documento Fiscal Soporte:</strong> ${esc(b.settlement.ownerNcf || fin.ownerFiscalDoc)}
        </div>

        <div style="background:#F1F5F9; border-radius:10px; padding:13px 14px; font-size:12.5px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Valor Servicio Base + Traslado (Sin ITBIS):</span><span>${fmtRDDecimal(b.netSubtotal)}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:#B85A27;"><span>(−) Comisión Intermediación Green Mile RD (${fin.gmCommissionPct}%):</span><span>− ${fmtRDDecimal(fin.gmCommissionAmount)}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:700;"><span>Subtotal Bruto Propietario:</span><span>${fmtRDDecimal(fin.ownerGrossPayout)}</span></div>
          ${fin.ownerIsIndividual ? `
            <div style="display:flex; justify-content:space-between; color:#92400E;"><span>(−) Retención 10% ISR Persona Física (DGII e-CF 41):</span><span>− ${fmtRDDecimal(fin.ownerIsrRetained)}</span></div>
            <div style="display:flex; justify-content:space-between; color:#64748B; font-size:11px;"><span>ITBIS 18% Retenido 100% (Declarado en IT-1):</span><span>${fmtRDDecimal(fin.ownerItbisRetained)}</span></div>
          ` : `
            <div style="display:flex; justify-content:space-between;"><span>(+) ITBIS 18% Facturado por Propietario (e-CF 31):</span><span>+ ${fmtRDDecimal(fin.ownerItbisBilled)}</span></div>
            <div style="display:flex; justify-content:space-between; color:#92400E;"><span>(−) Retención 30% ITBIS (Norma 02-05 / 07-07):</span><span>− ${fmtRDDecimal(fin.ownerItbisRetained)}</span></div>
          `}
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:900; color:#065F46; border-top:1.5px solid #065F46; margin-top:7px; padding-top:7px;">
            <span>MONTO NETO TRANSFERIDO AL PROPIETARIO:</span><span>${fmtRDDecimal(fin.ownerNetTransfer)}</span>
          </div>
        </div>

        <div style="font-size:11.5px; color:#475569;">
          Estado Liquidación: <strong>${b.settlement.status === 'paid' ? 'PAGADA / TRANSFERIDA' : 'PROGRAMADA'}</strong> •
          Ref. Transferencia: <strong>${esc(b.settlement.transferRef || 'Pendiente')}</strong> •
          Fecha Pago: <strong>${esc(b.settlement.paidDate || 'Pendiente')}</strong>
        </div>
      </div>
    `;
  }

  /* =========================================================
     EXPORTADORES FISCALES DGII (FORMATO 607 Y FORMATO 606)
     ========================================================= */
  function csvCell(v) {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return `"${s}"`;
  }

  function exportDGII607CSV(bookingsList) {
    const headers = [
      'RNC_Cedula', 'Tipo_Identificacion', 'Numero_Comprobante_Fiscal', 'Tipo_Ingreso',
      'Fecha_Comprobante', 'Monto_Facturado', 'ITBIS_Facturado', 'ITBIS_Retenido_Terceros',
      'ISR_Retenido_Terceros', 'Efectivo', 'Cheque_Transferencia_Deposito',
      'Tarjeta_Debito_Credito', 'Venta_a_Credito', 'Estado_Operacion'
    ];
    const rows = [headers.map(csvCell).join(',')];

    (bookingsList || []).forEach((raw) => {
      const b = normalizeBooking(raw);
      if (b.stage === 'cancelled') return;
      const digits = String(b.renterRnc || '').replace(/\D/g, '');
      const tipoId = digits.length === 9 ? '1' : (digits.length === 11 ? '2' : '3');
      const fecha = (b.encfIssuedAt || new Date(b.id || Date.now()).toISOString()).slice(0, 10).replace(/-/g, '');
      const itbisRetTerceros = (b.govItbisRetention || 0) + (b.paymentMethod === 'card' ? (b.cardItbisRetention || 0) : 0);
      const isrRetTerceros = b.govIsrRetention || 0;
      const transferAmt = b.paymentMethod === 'transfer' ? b.total : 0;
      const cardAmt = b.paymentMethod === 'card' ? b.total : 0;
      const creditAmt = (b.paymentMethod === 'gov_po' || b.paymentMethod === 'credit') ? b.total : 0;

      rows.push([
        digits,
        tipoId,
        b.encfNumber || `PEND-${String(b.id).slice(-6)}`,
        '01 - Ingresos por Operaciones',
        fecha,
        b.netSubtotal.toFixed(2),
        b.itbis.toFixed(2),
        itbisRetTerceros.toFixed(2),
        isrRetTerceros.toFixed(2),
        '0.00',
        transferAmt.toFixed(2),
        cardAmt.toFixed(2),
        creditAmt.toFixed(2),
        b.stage
      ].map(csvCell).join(','));
    });

    return rows.join('\n');
  }

  function exportDGII606CSV(bookingsList, config) {
    const cfg = config || loadAdminConfig();
    const headers = [
      'RNC_Cedula_Propietario', 'Tipo_Id', 'Tipo_Bienes_Servicios', 'NCF_Propietario_o_E41',
      'Fecha_Comprobante', 'Monto_Servicios', 'ITBIS_Facturado', 'ITBIS_Retenido',
      'ISR_Retenido', 'Neto_Pagado_Propietario', 'Ref_Transferencia', 'Estado'
    ];
    const rows = [headers.map(csvCell).join(',')];

    (bookingsList || []).forEach((raw) => {
      const b = normalizeBooking(raw);
      if (b.stage === 'cancelled') return;
      const fin = calculateFinancials({
        baseAmount: b.netSubtotal,
        ncfType: b.ncfType,
        paymentMethod: b.paymentMethod,
        commissionPct: b.settlement.commissionPct,
        ownerRnc: b.ownerRnc,
        config: cfg
      });
      const digits = String(b.ownerRnc || '').replace(/\D/g, '');
      const tipoId = digits.length === 9 ? '1' : '2';
      const fecha = (b.settlement.paidDate || new Date(b.id || Date.now()).toISOString().slice(0, 10)).replace(/-/g, '');

      rows.push([
        digits,
        tipoId,
        '05 - Arrendamientos',
        b.settlement.ownerNcf || (fin.ownerIsIndividual ? 'E41-PENDIENTE' : 'E31-PROPIETARIO'),
        fecha,
        fin.ownerGrossPayout.toFixed(2),
        fin.ownerItbisBilled.toFixed(2),
        fin.ownerItbisRetained.toFixed(2),
        fin.ownerIsrRetained.toFixed(2),
        fin.ownerNetTransfer.toFixed(2),
        b.settlement.transferRef || '',
        b.settlement.status
      ].map(csvCell).join(','));
    });

    return rows.join('\n');
  }

  function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8;') {
    const blob = new Blob(['\uFEFF' + content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 200);
  }

  global.GM_BILLING = {
    NCF_TYPES,
    PAYMENT_METHODS,
    ORDER_STAGES,
    GOV_CHECKLIST_ITEMS,
    DEFAULT_ADMIN_CONFIG,
    fmtRD,
    fmtRDDecimal,
    loadAdminConfig,
    saveAdminConfigLocal,
    loadPayouts,
    savePayoutsLocal,
    formatEncf,
    generateSecurityCode,
    issueNextEncf,
    detectGovEntity,
    formatCardNumber,
    formatCardExpiry,
    detectCardBrand,
    luhnCheck,
    validateCard,
    calculateFinancials,
    normalizeBooking,
    paymentSummaryText,
    paymentStatusBadge,
    buildPrintableContractHtml,
    buildPrintableInvoiceHtml,
    buildGovDossierHtml,
    buildOwnerSettlementHtml,
    exportDGII607CSV,
    exportDGII606CSV,
    downloadTextFile
  };
})(window);
