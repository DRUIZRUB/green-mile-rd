'use strict';

const https = require('node:https');
const crypto = require('node:crypto');
const { getConfig, isPaymentLiveConfigured } = require('../config');

/**
 * Procesador Multi-Pasarela de Pagos con Tarjeta para República Dominicana.
 * Soporta:
 *  - Azul (Banco Popular Dominicano — Webservices JSON + mTLS + Failover automático)
 *  - CardNET (República Dominicana — e-Commerce REST con Idempotency Key)
 *  - Visanet Dominicana / CyberSource (REST v2 con firma HTTP HMAC-SHA256)
 *  - Stripe (Internacional / DOP en centavos)
 *  - Sandbox (Validación Luhn + vencimiento + CVV mientras se configuran API keys)
 *
 * REGLA PCI-DSS: Nunca registra en logs ni retorna el número completo de tarjeta ni el CVV.
 */

function cleanDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function detectCardBrand(digits) {
  const d = cleanDigits(digits);
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^6(?:011|5)/.test(d)) return 'Discover';
  return 'Tarjeta';
}

function luhnCheck(digits) {
  const d = cleanDigits(digits);
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

function parseExpiry(expiryStr) {
  const m = String(expiryStr || '').trim().match(/^(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const rawYear = m[2];
  const yearFull = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  if (month < 1 || month > 12) return null;
  return {
    month,
    monthStr: String(month).padStart(2, '0'),
    yearFull,
    year2: String(yearFull).slice(-2),
    yyyymm: `${yearFull}${String(month).padStart(2, '0')}`
  };
}

function validateCardPayload(card) {
  const digits = cleanDigits(card && card.number);
  const brand = detectCardBrand(digits);
  const holder = String((card && card.holder) || '').trim();
  const cvv = cleanDigits(card && card.cvv);
  const exp = parseExpiry(card && card.expiry);

  if (holder.length < 3) return { valid: false, error: 'Nombre del titular inválido.' };
  if ((brand === 'AMEX' && digits.length !== 15) || (brand !== 'AMEX' && digits.length < 16)) {
    return { valid: false, error: 'Número de tarjeta incompleto.' };
  }
  if (!luhnCheck(digits)) return { valid: false, error: 'Número de tarjeta inválido (Luhn).' };
  if (!exp) return { valid: false, error: 'Fecha de vencimiento inválida (MM/AA).' };

  const now = new Date();
  if (exp.yearFull < now.getFullYear() || (exp.yearFull === now.getFullYear() && exp.month < now.getMonth() + 1)) {
    return { valid: false, error: 'La tarjeta está vencida.' };
  }

  const expectedCvv = brand === 'AMEX' ? 4 : 3;
  if (cvv.length !== expectedCvv) {
    return { valid: false, error: `CVV inválido (${expectedCvv} dígitos requeridos).` };
  }

  return {
    valid: true,
    digits,
    brand,
    last4: digits.slice(-4),
    holder: holder.toUpperCase(),
    exp,
    cvv
  };
}

function toCentsString(amountRD) {
  return String(Math.round((Number(amountRD) || 0) * 100));
}

function httpsJsonRequest(urlString, { method = 'POST', headers = {}, body = null, cert = null, key = null, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    const reqHeaders = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, headers);
    if (payload != null) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: reqHeaders,
      timeout: timeoutMs
    };
    if (cert && key) {
      options.cert = cert;
      options.key = key;
    }

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Tiempo de espera agotado conectando con la pasarela de pagos'));
    });
    if (payload != null) req.write(payload);
    req.end();
  });
}

/* ============================================================================
   ADAPTADOR 1: AZUL (BANCO POPULAR DOMINICANO — WEBSERVICES JSON + mTLS)
   ============================================================================ */
async function processAzulSale({ orderId, totalAmount, itbisAmount, cardData, cfg }) {
  const azul = cfg.payment.azul;
  const isProd = azul.env === 'prod' || azul.env === 'production';
  const primaryUrl = isProd
    ? 'https://pagos.azul.com.do/webservices/JSON/Default.aspx'
    : 'https://pruebas.azul.com.do/webservices/JSON/Default.aspx';
  const altUrl = isProd
    ? 'https://contpagos.azul.com.do/webservices/JSON/Default.aspx'
    : primaryUrl;

  const cert = Buffer.from(azul.certBase64, 'base64');
  const key = Buffer.from(azul.keyBase64, 'base64');

  const body = {
    Channel: 'EC',
    Store: azul.storeId,
    CardNumber: cardData.digits,
    Expiration: cardData.exp.yyyymm,
    CVC: cardData.cvv,
    PosInputMode: 'E-Commerce',
    TrxType: 'Sale',
    Amount: toCentsString(totalAmount),
    Itbis: toCentsString(itbisAmount),
    CurrencyPosCode: '$',
    Payments: '1',
    Plan: '0',
    AcquirerRefData: '1',
    RRN: null,
    CustomerServicePhone: '',
    OrderNumber: String(orderId).slice(-12),
    ECommerceUrl: cfg.appBaseUrl,
    CustomOrderId: `GM-${orderId}`,
    ForceNo3DS: azul.force3ds ? '0' : '1'
  };

  const headers = { Auth1: azul.auth1, Auth2: azul.auth2 };
  let resp;
  try {
    resp = await httpsJsonRequest(primaryUrl, { method: 'POST', headers, body, cert, key });
  } catch (primaryErr) {
    if (altUrl !== primaryUrl) {
      resp = await httpsJsonRequest(altUrl, { method: 'POST', headers, body, cert, key });
    } else {
      throw primaryErr;
    }
  }

  const data = resp.json || {};
  const approved = String(data.IsoCode || '') === '00' && String(data.ResponseCode || '').toUpperCase() !== 'ERROR';
  if (!approved) {
    return {
      approved: false,
      provider: 'azul',
      environment: isProd ? 'production' : 'test',
      isoCode: data.IsoCode || String(resp.status),
      message: data.ResponseMessage || data.ErrorDescription || 'Transacción declinada por la entidad emisora.'
    };
  }

  return {
    approved: true,
    provider: 'azul',
    environment: isProd ? 'production' : 'test',
    authCode: data.AuthorizationCode || '',
    gatewayOrderId: data.AzulOrderId || '',
    rrn: data.RRN || '',
    ticket: data.Ticket || '',
    isoCode: data.IsoCode,
    message: data.ResponseMessage || 'APROBADA'
  };
}

async function voidAzulSale({ azulOrderId, cfg }) {
  const azul = cfg.payment.azul;
  const isProd = azul.env === 'prod' || azul.env === 'production';
  const url = isProd
    ? 'https://pagos.azul.com.do/webservices/JSON/Default.aspx?ProcessVoid'
    : 'https://pruebas.azul.com.do/webservices/JSON/Default.aspx?ProcessVoid';

  const cert = Buffer.from(azul.certBase64, 'base64');
  const key = Buffer.from(azul.keyBase64, 'base64');

  const resp = await httpsJsonRequest(url, {
    method: 'POST',
    headers: { Auth1: azul.auth1, Auth2: azul.auth2 },
    body: { Channel: 'EC', Store: azul.storeId, AzulOrderId: azulOrderId },
    cert,
    key
  });
  const data = resp.json || {};
  return {
    ok: String(data.IsoCode || '') === '00',
    isoCode: data.IsoCode || '',
    message: data.ResponseMessage || data.ErrorDescription || ''
  };
}

/* ============================================================================
   ADAPTADOR 2: CARDNET (REPÚBLICA DOMINICANA — e-COMMERCE REST)
   ============================================================================ */
async function processCardnetSale({ orderId, totalAmount, itbisAmount, cardData, cfg }) {
  const cn = cfg.payment.cardnet;
  const isProd = cn.env === 'prod' || cn.env === 'production';
  const baseUrl = isProd ? 'https://ecommerce.cardnet.com.do/api/payment' : 'https://lab.cardnet.com.do/api/payment';

  // Paso 1: Solicitar llave de idempotencia
  const idemRes = await fetch(`${baseUrl}/idenpotency-keys`, { method: 'POST' });
  const idemText = await idemRes.text();
  const idemKey = (idemText.match(/ikey:([^\s\n]+)/i) || [])[1] || crypto.randomUUID();

  // Paso 2: Ejecutar venta
  const salePayload = {
    'idempotency-key': idemKey,
    'merchant-id': cn.merchantId,
    'terminal-id': cn.terminalId,
    'card-number': cardData.digits,
    'environment': isProd ? 'ECommerce' : 'ECommerce',
    'expiration-date': `${cardData.exp.monthStr}/${cardData.exp.year2}`,
    'cvv': cardData.cvv,
    'amount': Number(toCentsString(totalAmount)),
    'currency': '214', // DOP ISO 4217
    'invoice-number': String(orderId).slice(-6),
    'tax': Number(toCentsString(itbisAmount)),
    'reference-number': `GM${String(orderId).slice(-10)}`
  };

  const saleRes = await fetch(`${baseUrl}/transactions/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cn.privateKey}`
    },
    body: JSON.stringify(salePayload)
  });

  const data = await saleRes.json().catch(() => ({}));
  const approved = String(data['response-code'] || data.responseCode || '') === '00';
  if (!approved) {
    return {
      approved: false,
      provider: 'cardnet',
      environment: isProd ? 'production' : 'test',
      isoCode: data['response-code'] || String(saleRes.status),
      message: data['response-code-desc'] || data.message || 'Transacción declinada en CardNET.'
    };
  }

  return {
    approved: true,
    provider: 'cardnet',
    environment: isProd ? 'production' : 'test',
    authCode: data['approval-code'] || data.authorizationCode || '',
    gatewayOrderId: data['internal-response-code'] || idemKey,
    rrn: data['retrieval-ref-number'] || '',
    isoCode: '00',
    message: data['response-code-desc'] || 'APROBADA'
  };
}

/* ============================================================================
   ADAPTADOR 3: VISANET DOMINICANA / CYBERSOURCE (REST v2 HTTP SIGNATURE)
   ============================================================================ */
async function processVisanetSale({ orderId, totalAmount, cardData, cfg }) {
  const vn = cfg.payment.visanet;
  const isProd = vn.env === 'prod' || vn.env === 'production';
  const host = isProd ? 'api.cybersource.com' : 'apitest.cybersource.com';
  const resource = '/pts/v2/payments';

  const payloadObj = {
    clientReferenceInformation: { code: `GM-${orderId}` },
    processingInformation: { capture: true },
    paymentInformation: {
      card: {
        number: cardData.digits,
        expirationMonth: cardData.exp.monthStr,
        expirationYear: String(cardData.exp.yearFull),
        securityCode: cardData.cvv
      }
    },
    orderInformation: {
      amountDetails: {
        totalAmount: (Number(totalAmount) || 0).toFixed(2),
        currency: 'DOP'
      }
    }
  };
  const payloadStr = JSON.stringify(payloadObj);
  const dateHdr = new Date().toUTCString();
  const digest = 'SHA-256=' + crypto.createHash('sha256').update(payloadStr, 'utf8').digest('base64');

  const sigString = [
    `host: ${host}`,
    `date: ${dateHdr}`,
    `(request-target): post ${resource}`,
    `digest: ${digest}`,
    `v-c-merchant-id: ${vn.merchantId}`
  ].join('\n');

  const secretBuf = Buffer.from(vn.apiSecret, 'base64');
  const signature = crypto.createHmac('sha256', secretBuf).update(sigString, 'utf8').digest('base64');
  const signatureHeader = `keyid="${vn.apiKeyId}", algorithm="HmacSHA256", headers="host date (request-target) digest v-c-merchant-id", signature="${signature}"`;

  const res = await fetch(`https://${host}${resource}`, {
    method: 'POST',
    headers: {
      Host: host,
      Date: dateHdr,
      Digest: digest,
      'v-c-merchant-id': vn.merchantId,
      Signature: signatureHeader,
      'Content-Type': 'application/json'
    },
    body: payloadStr
  });

  const data = await res.json().catch(() => ({}));
  const statusUpper = String(data.status || '').toUpperCase();
  const approved = ['AUTHORIZED', 'PENDING', 'CAPTURED'].includes(statusUpper);
  if (!approved) {
    return {
      approved: false,
      provider: 'visanet',
      environment: isProd ? 'production' : 'test',
      isoCode: data.reason || String(res.status),
      message: data.message || 'Pago declinado en Visanet / CyberSource.'
    };
  }

  return {
    approved: true,
    provider: 'visanet',
    environment: isProd ? 'production' : 'test',
    authCode: (data.processorInformation && data.processorInformation.approvalCode) || '',
    gatewayOrderId: data.id || '',
    rrn: (data.processorInformation && data.processorInformation.retrievalReferenceNumber) || '',
    isoCode: '00',
    message: statusUpper
  };
}

/* ============================================================================
   ADAPTADOR 4: STRIPE (INTERNACIONAL — DOP EN CENTAVOS)
   ============================================================================ */
async function processStripeSale({ orderId, totalAmount, description, paymentMethodId, cfg }) {
  const secretKey = cfg.payment.stripe.secretKey;
  if (!paymentMethodId) {
    return {
      approved: false,
      provider: 'stripe',
      environment: secretKey.startsWith('sk_live_') ? 'production' : 'test',
      isoCode: 'MISSING_PM',
      message: 'Para Stripe en producción envía el token paymentMethodId generado por Stripe Elements.'
    };
  }

  const form = new URLSearchParams({
    amount: toCentsString(totalAmount),
    currency: 'dop',
    confirm: 'true',
    payment_method: paymentMethodId,
    description: description || `Green Mile RD Orden #GM-${orderId}`,
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
    'metadata[orderId]': String(orderId)
  });

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'succeeded') {
    return {
      approved: false,
      provider: 'stripe',
      environment: secretKey.startsWith('sk_live_') ? 'production' : 'test',
      isoCode: (data.error && data.error.code) || String(res.status),
      message: (data.error && data.error.message) || 'Cargo declinado en Stripe.'
    };
  }

  return {
    approved: true,
    provider: 'stripe',
    environment: secretKey.startsWith('sk_live_') ? 'production' : 'test',
    authCode: String(data.id || '').slice(-8).toUpperCase(),
    gatewayOrderId: data.id,
    rrn: data.latest_charge || '',
    isoCode: '00',
    message: 'APROBADA'
  };
}

/* ============================================================================
   ADAPTADOR 5: SANDBOX (VALIDACIÓN REAL LUHN + SIMULACIÓN SEGURA)
   ============================================================================ */
function processSandboxSale({ orderId, cardData }) {
  // Tarjeta de prueba terminada en 0002 simula fondos insuficientes para pruebas QA
  if (cardData.last4 === '0002') {
    return {
      approved: false,
      provider: 'sandbox',
      environment: 'sandbox',
      isoCode: '51',
      message: 'Fondos insuficientes (simulación sandbox tarjeta terminada en 0002).'
    };
  }
  const authCode = 'GM' + String(crypto.randomInt(100000, 999999));
  return {
    approved: true,
    provider: 'sandbox',
    environment: 'sandbox',
    authCode,
    gatewayOrderId: `SBX-${orderId}`,
    rrn: String(Date.now()).slice(-12),
    isoCode: '00',
    message: 'APROBADA (MODO SANDBOX — Pendiente configurar API Keys de pasarela)'
  };
}

/**
 * Punto de entrada unificado de cobro con tarjeta.
 */
async function chargeCard({ orderId, totalAmount, itbisAmount, description, card, stripePaymentMethodId }) {
  const cfg = getConfig();
  const provider = cfg.payment.provider;
  const liveReady = isPaymentLiveConfigured(cfg);

  let cardData = null;
  if (!(provider === 'stripe' && liveReady && stripePaymentMethodId)) {
    cardData = validateCardPayload(card);
    if (!cardData.valid) {
      return { approved: false, error: cardData.error, isoCode: 'INVALID_CARD' };
    }
  }

  let gwResult;
  if (!liveReady || provider === 'sandbox') {
    gwResult = processSandboxSale({ orderId, cardData });
  } else if (provider === 'azul') {
    gwResult = await processAzulSale({ orderId, totalAmount, itbisAmount, cardData, cfg });
  } else if (provider === 'cardnet') {
    gwResult = await processCardnetSale({ orderId, totalAmount, itbisAmount, cardData, cfg });
  } else if (provider === 'visanet') {
    gwResult = await processVisanetSale({ orderId, totalAmount, cardData, cfg });
  } else if (provider === 'stripe') {
    gwResult = await processStripeSale({ orderId, totalAmount, description, paymentMethodId: stripePaymentMethodId, cfg });
  } else {
    gwResult = processSandboxSale({ orderId, cardData });
  }

  if (!gwResult.approved) {
    return {
      approved: false,
      provider: gwResult.provider,
      environment: gwResult.environment,
      isoCode: gwResult.isoCode,
      error: gwResult.message
    };
  }

  // Solo devolvemos metadatos PCI-safe (jamás el número completo ni el CVV)
  return {
    approved: true,
    provider: gwResult.provider,
    environment: gwResult.environment,
    cardInfo: {
      brand: cardData ? cardData.brand : 'Tarjeta',
      last4: cardData ? cardData.last4 : '****',
      holder: cardData ? cardData.holder : '',
      expiry: cardData ? `${cardData.exp.monthStr}/${cardData.exp.year2}` : '',
      authCode: gwResult.authCode,
      gatewayOrderId: gwResult.gatewayOrderId,
      rrn: gwResult.rrn || '',
      provider: gwResult.provider,
      environment: gwResult.environment,
      isoCode: gwResult.isoCode || '00',
      processedAt: new Date().toISOString()
    }
  };
}

/**
 * Anulación / devolución en pasarela (cuando se emite Nota de Crédito e-CF 34).
 */
async function voidCardTransaction({ cardInfo }) {
  const cfg = getConfig();
  if (!cardInfo || !cardInfo.gatewayOrderId) {
    return { ok: true, mode: 'local', message: 'Sin referencia de pasarela para anular.' };
  }
  if (cardInfo.provider === 'azul' && isPaymentLiveConfigured(cfg)) {
    return voidAzulSale({ azulOrderId: cardInfo.gatewayOrderId, cfg });
  }
  return { ok: true, mode: cardInfo.provider || 'sandbox', message: 'Anulación registrada.' };
}

/**
 * Verificación HMAC de webhooks entrantes de pasarelas de pago.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const cfg = getConfig();
  const secret = cfg.payment.webhookSecret || cfg.payment.stripe.webhookSecret;
  if (!secret) return { verified: false, reason: 'NO_SECRET_CONFIGURED' };
  if (!signatureHeader) return { verified: false, reason: 'MISSING_SIGNATURE_HEADER' };

  const expected = crypto.createHmac('sha256', secret).update(rawBody || '', 'utf8').digest('hex');
  const provided = String(signatureHeader).replace(/^sha256=/i, '').trim();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return { verified: false, reason: 'SIGNATURE_MISMATCH' };
  const ok = crypto.timingSafeEqual(a, b);
  return { verified: ok, reason: ok ? 'OK' : 'SIGNATURE_MISMATCH' };
}

module.exports = {
  validateCardPayload,
  detectCardBrand,
  luhnCheck,
  chargeCard,
  voidCardTransaction,
  verifyWebhookSignature
};
