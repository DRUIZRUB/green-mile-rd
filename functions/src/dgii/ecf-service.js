'use strict';

const crypto = require('node:crypto');
const { getConfig, isDgiiLiveConfigured } = require('../config');
const { buildEcfXml, signXmlWithP12, buildDgiiQrUrl } = require('./ecf-xml');

/**
 * Servicio de Emisión Electrónica e-CF (DGII República Dominicana).
 * Soporta 3 modos automáticos según variables de entorno:
 *  1. direct_dgii  -> Obtiene Semilla DGII, firma con .p12, autentica JWT, firma XML e-CF, envía a DGII y consulta TrackId.
 *  2. provider_api -> Envía payload estructurado JSON a un proveedor certificado e-CF mediante API Key.
 *  3. sandbox      -> Genera XML v1.0 completo válido, código de seguridad y QR de prueba sin salir a DGII real.
 */

let cachedToken = { token: null, expiresAt: 0, env: '' };

function formatEncf(prefix, seqNum) {
  const p = String(prefix || 'E31').toUpperCase().slice(0, 3);
  const n = Math.max(1, Number(seqNum) || 1);
  return p + String(n).padStart(10, '0');
}

function generateSandboxSecurityCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[crypto.randomInt(0, chars.length)];
  return out;
}

/**
 * Asigna atómicamente el próximo número secuencial e-NCF en Cloud Firestore (evita duplicados concurrentes).
 */
async function allocateNextEncfAtomic(db, typeCode) {
  const code = ['E31', 'E32', 'E34', 'E41', 'E44', 'E45'].includes(typeCode) ? typeCode : 'E31';
  const ref = db.collection('admin_config').doc('main');

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const sequences = Object.assign({}, data.sequences || {});
    const seq = Object.assign(
      { prefix: code, label: code, next: 1, max: 5000, expires: '2027-12-31' },
      sequences[code] || {}
    );

    const current = Number(seq.next) || 1;
    if (seq.max && current > Number(seq.max)) {
      throw new Error(`Secuencias e-NCF agotadas para ${code}. Amplía el rango autorizado en Configuración.`);
    }

    const encf = formatEncf(code, current);
    seq.next = current + 1;
    sequences[code] = seq;

    tx.set(ref, { sequences }, { merge: true });
    return {
      encf,
      typeCode: code,
      expires: seq.expires || '2027-12-31',
      companyConfig: data
    };
  });
}

/**
 * Autenticación oficial ante DGII: GET Semilla -> Firma XMLDSig .p12 -> POST ValidarSemilla -> JWT Token (~1 hora).
 */
async function getDgiiToken(cfg) {
  const dgiiEnv = cfg.dgii.env;
  if (cachedToken.token && cachedToken.env === dgiiEnv && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const base = `https://ecf.dgii.gov.do/${dgiiEnv}/autenticacion/api/autenticacion`;
  const seedRes = await fetch(`${base}/semilla`, { headers: { Accept: 'application/xml' } });
  if (!seedRes.ok) {
    throw new Error(`Error obteniendo semilla DGII (${seedRes.status})`);
  }
  const seedXml = await seedRes.text();
  const { signedXml } = signXmlWithP12(seedXml, cfg.dgii.certP12Base64, cfg.dgii.certPassword);

  const form = new FormData();
  form.append('xml', new Blob([signedXml], { type: 'text/xml' }), 'semilla.xml');

  const valRes = await fetch(`${base}/validarsemilla`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form
  });
  const valJson = await valRes.json().catch(() => ({}));
  if (!valRes.ok || !valJson.token) {
    throw new Error(`Error validando semilla DGII (${valRes.status}): ${JSON.stringify(valJson)}`);
  }

  const expMs = valJson.expira ? new Date(valJson.expira).getTime() : (Date.now() + 50 * 60 * 1000);
  cachedToken = { token: valJson.token, expiresAt: expMs, env: dgiiEnv };
  return valJson.token;
}

/**
 * Envío directo del XML firmado a la DGII (Recepción e-CF o RFCE para E32 < RD$250,000).
 */
async function sendDirectToDgii({ signedXml, encf, total, cfg }) {
  const token = await getDgiiToken(cfg);
  const dgiiEnv = cfg.dgii.env;
  const rncEmisor = cfg.dgii.emisor.rnc;
  const filename = `${rncEmisor}${encf}.xml`;

  const isSmallConsumer = encf.startsWith('E32') && Number(total) < 250000;
  const endpoint = isSmallConsumer
    ? `https://fc.dgii.gov.do/${dgiiEnv}/recepcionfc/api/recepcion/ecf`
    : `https://ecf.dgii.gov.do/${dgiiEnv}/recepcion/api/facturaselectronicas`;

  const form = new FormData();
  form.append('xml', new Blob([signedXml], { type: 'text/xml' }), filename);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    body: form
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`DGII rechazó la recepción (${res.status}): ${JSON.stringify(json)}`);
  }

  return {
    trackId: json.trackId || json.codigo || '',
    dgiiStatus: json.estado || (isSmallConsumer ? 'Aceptado' : 'En Proceso'),
    messages: json.mensajes || []
  };
}

/**
 * Consulta en vivo del resultado de validación de un TrackId ante la DGII.
 */
async function queryDgiiTrackStatus(trackId) {
  const cfg = getConfig();
  if (!isDgiiLiveConfigured(cfg) || cfg.dgii.mode !== 'direct_dgii') {
    return {
      ok: true,
      mode: cfg.dgii.mode,
      trackId,
      estado: 'Aceptado (Sandbox)',
      mensajes: [{ valor: 'Comprobante validado en modo sandbox local.' }]
    };
  }

  const token = await getDgiiToken(cfg);
  const url = `https://ecf.dgii.gov.do/${cfg.dgii.env}/consultaresultado/api/consultas/estado?trackid=${encodeURIComponent(trackId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    mode: 'direct_dgii',
    trackId,
    estado: json.estado || 'Desconocido',
    encf: json.encf || '',
    mensajes: json.mensajes || []
  };
}

/**
 * Envío mediante Proveedor API REST certificado (cuando DGII_ECF_MODE=provider_api).
 */
async function sendViaProviderApi({ booking, encf, expires, xmlPayload, cfg }) {
  const prov = cfg.dgii.providerApi;
  const endpoint = `${prov.baseUrl.replace(/\/$/, '')}/ecf/emit`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${prov.apiKey}`,
      ...(prov.secret ? { 'X-Api-Secret': prov.secret } : {})
    },
    body: JSON.stringify({
      environment: cfg.dgii.env,
      encf,
      expires,
      emisor: cfg.dgii.emisor,
      booking,
      xmlDraft: xmlPayload
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Error del proveedor e-CF (${res.status}): ${json.message || JSON.stringify(json)}`);
  }

  return {
    encf: json.encf || encf,
    trackId: json.trackId || json.id || '',
    securityCode: json.securityCode || json.codigoSeguridad || '',
    dgiiStatus: json.dgiiStatus || json.estado || 'Aceptado',
    dgiiQrUrl: json.qrUrl || '',
    signedXml: json.signedXml || xmlPayload
  };
}

/**
 * Emisión unificada de un Comprobante Fiscal Electrónico (e-CF) para una reserva/orden.
 */
async function issueEcfForBooking({ db, booking, typeCode, creditNoteRef = null }) {
  const cfg = getConfig();
  const requestedType = typeCode || booking.ncfType || 'E31';
  const alloc = await allocateNextEncfAtomic(db, requestedType);

  // Combinar emisor de env con datos actualizados de admin_config en Firestore
  const emisor = Object.assign({}, cfg.dgii.emisor);
  if (alloc.companyConfig) {
    if (alloc.companyConfig.rnc) emisor.rnc = String(alloc.companyConfig.rnc).replace(/\D/g, '');
    if (alloc.companyConfig.companyName) emisor.razonSocial = alloc.companyConfig.companyName;
    if (alloc.companyConfig.address) emisor.direccion = alloc.companyConfig.address;
    if (alloc.companyConfig.email) emisor.correo = alloc.companyConfig.email;
  }

  const built = buildEcfXml({
    booking,
    encf: alloc.encf,
    expiresDate: alloc.expires,
    emisor,
    creditNoteRef
  });

  const liveReady = isDgiiLiveConfigured(cfg);
  const mode = liveReady ? cfg.dgii.mode : 'sandbox';

  let signedXml = built.xml;
  let securityCode = generateSandboxSecurityCode();
  let trackId = `SBX-${alloc.encf}-${Date.now().toString(36).toUpperCase()}`;
  let dgiiStatus = 'Aceptado (Sandbox — Listo para .p12/API)';
  let dgiiQrUrl = '';

  if (mode === 'direct_dgii') {
    const signed = signXmlWithP12(built.xml, cfg.dgii.certP12Base64, cfg.dgii.certPassword);
    signedXml = signed.signedXml;
    securityCode = signed.securityCode;
    const sent = await sendDirectToDgii({ signedXml, encf: alloc.encf, total: built.total, cfg });
    trackId = sent.trackId;
    dgiiStatus = sent.dgiiStatus;
  } else if (mode === 'provider_api') {
    const sent = await sendViaProviderApi({
      booking,
      encf: alloc.encf,
      expires: alloc.expires,
      xmlPayload: built.xml,
      cfg
    });
    signedXml = sent.signedXml;
    securityCode = sent.securityCode || securityCode;
    trackId = sent.trackId || trackId;
    dgiiStatus = sent.dgiiStatus;
    dgiiQrUrl = sent.dgiiQrUrl || '';
  }

  if (!dgiiQrUrl) {
    dgiiQrUrl = buildDgiiQrUrl({
      dgiiEnv: cfg.dgii.env,
      rncEmisor: emisor.rnc,
      rncComprador: requestedType === 'E41' ? booking.ownerRnc : booking.renterRnc,
      encf: alloc.encf,
      issueDateStr: built.issueDateStr,
      total: built.total,
      signTimeStr: built.signTimeStr,
      securityCode
    });
  }

  // Guardar XML en subcolección/colección fiscal separada para auditoría 10 años (Código Tributario Art. 50)
  await db.collection('ecf_documents').doc(alloc.encf).set({
    encf: alloc.encf,
    typeCode: requestedType,
    bookingId: String(booking.id || ''),
    emisorRnc: emisor.rnc,
    compradorRnc: String(booking.renterRnc || '').replace(/\D/g, ''),
    compradorNombre: booking.renter || '',
    total: built.total,
    itbis: built.itbis,
    netSubtotal: built.netSubtotal,
    securityCode,
    trackId,
    dgiiStatus,
    dgiiQrUrl,
    dgiiEnv: cfg.dgii.env,
    mode,
    xml: signedXml,
    issuedAt: new Date().toISOString()
  }, { merge: true });

  return {
    encf: alloc.encf,
    typeCode: requestedType,
    expires: alloc.expires,
    securityCode,
    trackId,
    dgiiStatus,
    dgiiQrUrl,
    dgiiMode: mode,
    dgiiEnv: cfg.dgii.env,
    issuedAt: new Date().toISOString()
  };
}

module.exports = {
  formatEncf,
  allocateNextEncfAtomic,
  issueEcfForBooking,
  queryDgiiTrackStatus
};
