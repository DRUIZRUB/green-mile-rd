'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getConfig, getPublicHealthStatus } = require('./src/config');
const { chargeCard, voidCardTransaction, verifyWebhookSignature } = require('./src/payments');
const { issueEcfForBooking, queryDgiiTrackStatus } = require('./src/dgii/ecf-service');
const { notifyInvoiceIssued, notifyOwnerSettlement } = require('./src/notifications');

if (!admin.apps.length) {
  const isCloudRuntime = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
  const localSaRel = process.env.GM_LOCAL_SERVICE_ACCOUNT_PATH || '';
  let initialized = false;
  if (!isCloudRuntime && localSaRel) {
    const resolvedSa = path.isAbsolute(localSaRel) ? localSaRel : path.resolve(__dirname, localSaRel);
    if (fs.existsSync(resolvedSa)) {
      admin.initializeApp({
        credential: admin.credential.cert(require(resolvedSa))
      });
      initialized = true;
    }
  }
  if (!initialized) {
    admin.initializeApp();
  }
}
const db = admin.firestore();

function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Pin, X-Webhook-Signature');
}

function sendJson(res, status, data) {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(data));
}

async function verifyAdminAuth(req) {
  const cfg = getConfig();
  const provided = String(
    req.headers['x-admin-pin'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    (req.body && req.body.adminPin) ||
    ''
  ).trim();

  if (cfg.adminApiSecret && provided === cfg.adminApiSecret) return true;

  const snap = await db.collection('admin_config').doc('main').get();
  const storedPin = (snap.exists && snap.data().adminPin) ? String(snap.data().adminPin).trim() : '2026';
  return Boolean(provided && provided === storedPin);
}

/**
 * Router HTTP Principal — Expuesto en /api/** (Firebase Hosting rewrite) y URL directa de Cloud Functions v2.
 */
exports.api = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: false
  },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Normalizar ruta quitando prefijo /api si viene por Hosting rewrite
    const rawPath = (req.path || '/').replace(/^\/api(?=\/|$)/i, '') || '/';
    const method = req.method.toUpperCase();

    try {
      /* 1. DIAGNÓSTICO DE INTEGRACIONES (SEGURO, SIN SECRETOS) */
      if (method === 'GET' && (rawPath === '/health' || rawPath === '/')) {
        return sendJson(res, 200, getPublicHealthStatus());
      }

      /* 2. COBRO CON TARJETA + EMISIÓN AUTOMÁTICA DE e-CF EN UNA TRANSACCIÓN */
      if (method === 'POST' && rawPath === '/payments/charge') {
        const body = req.body || {};
        const booking = body.booking || {};
        const card = body.card || null;
        const stripePaymentMethodId = body.stripePaymentMethodId || null;

        if (!booking.title || !booking.renter || !(Number(booking.total) > 0)) {
          return sendJson(res, 400, { ok: false, error: 'Datos de orden incompletos (title, renter, total).' });
        }

        const orderId = booking.id || Date.now();
        const paymentRes = await chargeCard({
          orderId,
          totalAmount: Number(booking.total),
          itbisAmount: Number(booking.itbis || 0),
          description: `Green Mile RD #GM-${String(orderId).slice(-6)} — ${booking.title}`,
          card,
          stripePaymentMethodId
        });

        if (!paymentRes.approved) {
          return sendJson(res, 402, {
            ok: false,
            approved: false,
            isoCode: paymentRes.isoCode || 'DECLINED',
            error: paymentRes.error || 'Pago declinado por la entidad emisora.'
          });
        }

        // Cargar tasas administrativas vigentes para retenciones Norma 08-04 / 06-23
        const cfgSnap = await db.collection('admin_config').doc('main').get();
        const adminCfg = cfgSnap.exists ? cfgSnap.data() : {};
        const cardFeePct = Number(adminCfg.cardFeePct || 3.25);
        const cardRetPct = Number(adminCfg.cardItbisRetentionPct || 2.0);
        const totalNum = Number(booking.total);

        const enrichedBooking = Object.assign({}, booking, {
          id: orderId,
          paymentMethod: 'card',
          paymentStatus: 'paid',
          cardInfo: paymentRes.cardInfo,
          cardGatewayFee: Math.round(totalNum * (cardFeePct / 100)),
          cardItbisRetention: Math.round(totalNum * (cardRetPct / 100)),
          stage: 'invoiced_dispatched'
        });

        // Emitir e-CF atómicamente en DGII / Proveedor / Sandbox
        const ecfRes = await issueEcfForBooking({
          db,
          booking: enrichedBooking,
          typeCode: enrichedBooking.ncfType || 'E31'
        });

        enrichedBooking.encfNumber = ecfRes.encf;
        enrichedBooking.encfSecurityCode = ecfRes.securityCode;
        enrichedBooking.encfExpires = ecfRes.expires;
        enrichedBooking.encfIssuedAt = ecfRes.issuedAt;
        enrichedBooking.dgiiTrackId = ecfRes.trackId;
        enrichedBooking.dgiiStatus = ecfRes.dgiiStatus;
        enrichedBooking.dgiiQrUrl = ecfRes.dgiiQrUrl;
        enrichedBooking.dgiiMode = ecfRes.dgiiMode;

        // Guardar orden y marcar equipo ocupado
        await db.collection('bookings').doc(String(orderId)).set(
          Object.assign({}, enrichedBooking, {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }),
          { merge: true }
        );
        if (enrichedBooking.equipmentId != null) {
          await db.collection('equipment').doc(String(enrichedBooking.equipmentId)).set({ busy: true }, { merge: true });
        }

        // Enviar correo + WhatsApp en segundo plano (sin bloquear respuesta si no hay llaves de correo)
        const ecfDocSnap = await db.collection('ecf_documents').doc(ecfRes.encf).get();
        const xmlContent = ecfDocSnap.exists ? ecfDocSnap.data().xml : null;
        notifyInvoiceIssued({
          booking: enrichedBooking,
          ecfResult: ecfRes,
          xmlContent,
          recipientEmail: body.clientEmail || null
        }).catch((err) => console.warn('[Green Mile Notify] Invoice notify skipped:', err.message));

        return sendJson(res, 200, {
          ok: true,
          approved: true,
          payment: paymentRes,
          ecf: ecfRes,
          booking: enrichedBooking
        });
      }

      /* 3. EMISIÓN DE e-CF DESDE ADMINISTRACIÓN (TRANSFERENCIAS, ESTADO E45, E44, E41, E34) */
      if (method === 'POST' && rawPath === '/ecf/issue') {
        if (!(await verifyAdminAuth(req))) {
          return sendJson(res, 401, { ok: false, error: 'Autorización administrativa requerida (PIN o API Secret).' });
        }

        const body = req.body || {};
        const bookingId = String(body.bookingId || (body.booking && body.booking.id) || '');
        let booking = body.booking || null;

        if (!booking && bookingId) {
          const snap = await db.collection('bookings').doc(bookingId).get();
          if (snap.exists) booking = snap.data();
        }
        if (!booking) {
          return sendJson(res, 404, { ok: false, error: 'Orden no encontrada para emitir e-CF.' });
        }

        const typeCode = body.typeCode || booking.ncfType || 'E31';
        const ecfRes = await issueEcfForBooking({
          db,
          booking,
          typeCode,
          creditNoteRef: body.creditNoteRef || null
        });

        const patch = typeCode === 'E34'
          ? { stage: 'cancelled', creditNoteEncf: ecfRes.encf, creditNoteTrackId: ecfRes.trackId }
          : {
              encfNumber: ecfRes.encf,
              encfSecurityCode: ecfRes.securityCode,
              encfExpires: ecfRes.expires,
              encfIssuedAt: ecfRes.issuedAt,
              dgiiTrackId: ecfRes.trackId,
              dgiiStatus: ecfRes.dgiiStatus,
              dgiiQrUrl: ecfRes.dgiiQrUrl,
              dgiiMode: ecfRes.dgiiMode
            };

        if (bookingId) {
          await db.collection('bookings').doc(bookingId).set(
            Object.assign({}, booking, patch, { updatedAt: admin.firestore.FieldValue.serverTimestamp() }),
            { merge: true }
          );
        }

        if (body.sendEmail !== false) {
          const ecfDocSnap = await db.collection('ecf_documents').doc(ecfRes.encf).get();
          const xmlContent = ecfDocSnap.exists ? ecfDocSnap.data().xml : null;
          notifyInvoiceIssued({
            booking: Object.assign({}, booking, patch),
            ecfResult: ecfRes,
            xmlContent,
            recipientEmail: body.recipientEmail || null
          }).catch(() => {});
        }

        return sendJson(res, 200, { ok: true, ecf: ecfRes });
      }

      /* 4. CONSULTA DE ESTADO DGII POR TRACKID */
      if (method === 'GET' && rawPath.startsWith('/ecf/status/')) {
        const trackId = decodeURIComponent(rawPath.replace('/ecf/status/', ''));
        if (!trackId) return sendJson(res, 400, { ok: false, error: 'TrackId requerido.' });

        const statusRes = await queryDgiiTrackStatus(trackId);
        // Si viene bookingId por query, actualizar estado en Firestore
        const bookingId = req.query && req.query.bookingId;
        if (bookingId && statusRes.estado) {
          await db.collection('bookings').doc(String(bookingId)).set(
            { dgiiStatus: statusRes.estado, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
        }
        return sendJson(res, 200, statusRes);
      }

      /* 5. DESCARGA DEL XML OFICIAL FIRMADO DEL e-CF */
      if (method === 'GET' && rawPath.startsWith('/ecf/xml/')) {
        const key = decodeURIComponent(rawPath.replace('/ecf/xml/', ''));
        if (!key) return sendJson(res, 400, { ok: false, error: 'e-NCF requerido.' });

        const snap = await db.collection('ecf_documents').doc(key).get();
        if (!snap.exists || !snap.data().xml) {
          return sendJson(res, 404, { ok: false, error: `XML no encontrado para ${key}.` });
        }
        const doc = snap.data();
        res.status(200)
          .set('Content-Type', 'application/xml; charset=utf-8')
          .set('Content-Disposition', `attachment; filename="${doc.emisorRnc || 'GM'}${doc.encf}.xml"`)
          .send(doc.xml);
        return;
      }

      /* 6. ANULACIÓN DE TARJETA + NOTA DE CRÉDITO e-CF 34 */
      if (method === 'POST' && rawPath === '/payments/void') {
        if (!(await verifyAdminAuth(req))) {
          return sendJson(res, 401, { ok: false, error: 'Autorización administrativa requerida.' });
        }
        const { bookingId } = req.body || {};
        if (!bookingId) return sendJson(res, 400, { ok: false, error: 'bookingId requerido.' });

        const snap = await db.collection('bookings').doc(String(bookingId)).get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Orden no encontrada.' });
        const booking = snap.data();

        const voidRes = booking.paymentMethod === 'card'
          ? await voidCardTransaction({ cardInfo: booking.cardInfo })
          : { ok: true, mode: 'non-card' };

        const cnRes = await issueEcfForBooking({
          db,
          booking,
          typeCode: 'E34',
          creditNoteRef: {
            ncfModificado: booking.encfNumber || '',
            fechaModificado: booking.encfIssuedAt || new Date().toISOString(),
            codigoModificacion: '1' // 1 = Anula el NCF modificado
          }
        });

        await db.collection('bookings').doc(String(bookingId)).set({
          stage: 'cancelled',
          creditNoteEncf: cnRes.encf,
          creditNoteTrackId: cnRes.trackId,
          voidResult: voidRes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return sendJson(res, 200, { ok: true, void: voidRes, creditNote: cnRes });
      }

      /* 7. ENVÍO DE EXPEDIENTE GUBERNAMENTAL E45 POR CORREO (.gob.do) */
      if (method === 'POST' && rawPath === '/gov/notify') {
        if (!(await verifyAdminAuth(req))) {
          return sendJson(res, 401, { ok: false, error: 'Autorización administrativa requerida.' });
        }
        const { bookingId, recipientEmail } = req.body || {};
        const snap = await db.collection('bookings').doc(String(bookingId)).get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Expediente no encontrado.' });
        const booking = snap.data();

        const ecfSnap = booking.encfNumber ? await db.collection('ecf_documents').doc(booking.encfNumber).get() : null;
        const xmlContent = (ecfSnap && ecfSnap.exists) ? ecfSnap.data().xml : null;

        const notifyRes = await notifyInvoiceIssued({
          booking,
          ecfResult: {
            encf: booking.encfNumber || 'PROFORMA-E45',
            securityCode: booking.encfSecurityCode || 'PENDIE',
            dgiiQrUrl: booking.dgiiQrUrl || ''
          },
          xmlContent,
          recipientEmail: recipientEmail || (booking.govData && booking.govData.entityEmail)
        });
        return sendJson(res, 200, { ok: true, notifications: notifyRes });
      }

      /* 8. NOTIFICACIÓN DE LIQUIDACIÓN AL PROPIETARIO */
      if (method === 'POST' && rawPath === '/settlements/notify') {
        if (!(await verifyAdminAuth(req))) {
          return sendJson(res, 401, { ok: false, error: 'Autorización administrativa requerida.' });
        }
        const { bookingId, ownerEmail } = req.body || {};
        const snap = await db.collection('bookings').doc(String(bookingId)).get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Orden no encontrada.' });
        const booking = snap.data();

        const notifyRes = await notifyOwnerSettlement({
          booking,
          ownerEmail,
          ownerPhone: booking.ownerPhone
        });
        return sendJson(res, 200, { ok: true, notifications: notifyRes });
      }

      /* 9. WEBHOOK DE CONCILIACIÓN ASÍNCRONA DE PASARELAS */
      if (method === 'POST' && rawPath === '/webhooks/payment') {
        const sigHeader = req.headers['x-webhook-signature'] || req.headers['stripe-signature'] || '';
        const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
        const sigCheck = verifyWebhookSignature(rawBody, sigHeader);
        if (!sigCheck.verified && sigCheck.reason !== 'NO_SECRET_CONFIGURED') {
          return sendJson(res, 401, { ok: false, error: 'Firma de webhook inválida.' });
        }

        const evt = req.body || {};
        const customId = String(evt.CustomOrderId || evt.orderId || (evt.data && evt.data.object && evt.data.object.metadata && evt.data.object.metadata.orderId) || '').replace(/^GM-/i, '');
        const isPaid = String(evt.IsoCode || '') === '00' || evt.status === 'paid' || evt.type === 'payment_intent.succeeded';

        if (customId && isPaid) {
          await db.collection('bookings').doc(customId).set({
            paymentStatus: 'paid',
            webhookConfirmedAt: new Date().toISOString(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        return sendJson(res, 200, { ok: true, received: true, orderId: customId || null });
      }

      return sendJson(res, 404, { ok: false, error: `Ruta no encontrada: ${method} ${rawPath}` });
    } catch (err) {
      console.error('[Green Mile API Error]', rawPath, err);
      return sendJson(res, 500, { ok: false, error: err.message || 'Error interno del servidor.' });
    }
  }
);
