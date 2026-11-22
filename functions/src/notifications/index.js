'use strict';

const nodemailer = require('nodemailer');
const { getConfig, isEmailConfigured, isWhatsAppConfigured } = require('../config');

/**
 * Servicio de Notificaciones Automáticas de Green Mile Construction RD
 * - Correo electrónico vía Resend API o SMTP (Google Workspace / Zoho / Office365)
 * - Alertas vía WhatsApp Business Cloud API (Meta)
 */

function fmtRD(n) {
  return 'RD$ ' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

async function sendEmail({ to, cc = null, subject, html, attachments = [] }) {
  const cfg = getConfig();
  if (!to || !isEmailConfigured(cfg)) {
    return { sent: false, skipped: true, reason: 'EMAIL_NOT_CONFIGURED' };
  }

  const n = cfg.notifications;
  const toList = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (!toList.length) return { sent: false, skipped: true, reason: 'NO_RECIPIENT' };

  if (n.emailProvider === 'resend') {
    const payload = {
      from: n.emailFrom,
      to: toList,
      subject,
      html
    };
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
    if (attachments.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(String(a.content), 'utf8').toString('base64')
      }));
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${n.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    return { sent: res.ok, provider: 'resend', id: json.id || '', error: res.ok ? null : json };
  }

  if (n.emailProvider === 'smtp') {
    const transporter = nodemailer.createTransport({
      host: n.smtp.host,
      port: n.smtp.port,
      secure: n.smtp.secure,
      auth: { user: n.smtp.user, pass: n.smtp.pass }
    });
    const info = await transporter.sendMail({
      from: n.emailFrom,
      to: toList.join(', '),
      cc: cc || undefined,
      subject,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/xml'
      }))
    });
    return { sent: true, provider: 'smtp', id: info.messageId };
  }

  return { sent: false, skipped: true, reason: 'UNSUPPORTED_EMAIL_PROVIDER' };
}

async function sendWhatsAppText({ toPhone, text }) {
  const cfg = getConfig();
  if (!isWhatsAppConfigured(cfg)) {
    return { sent: false, skipped: true, reason: 'WHATSAPP_NOT_CONFIGURED' };
  }
  const cleanPhone = String(toPhone || cfg.notifications.whatsapp.adminPhone).replace(/\D/g, '');
  if (!cleanPhone) return { sent: false, skipped: true, reason: 'NO_PHONE' };

  const url = `https://graph.facebook.com/v21.0/${cfg.notifications.whatsapp.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.notifications.whatsapp.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text }
    })
  });
  const json = await res.json().catch(() => ({}));
  return { sent: res.ok, id: (json.messages && json.messages[0] && json.messages[0].id) || '', error: res.ok ? null : json };
}

function buildBrandedWrapper(title, bodyHtml) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:620px; margin:0 auto; background:#F4F6F9; padding:20px;">
      <div style="background:#0D223A; color:#fff; padding:18px 22px; border-radius:14px 14px 0 0;">
        <div style="font-size:11px; font-weight:800; color:#FDBA74; letter-spacing:0.6px; text-transform:uppercase;">GREEN MILE CONSTRUCTION RD</div>
        <h2 style="margin:4px 0 0; font-size:18px;">${title}</h2>
      </div>
      <div style="background:#fff; padding:22px; border-radius:0 0 14px 14px; border:1px solid #E2E8F0; color:#0F172A; font-size:13.5px; line-height:1.55;">
        ${bodyHtml}
        <hr style="border:none; border-top:1px solid #E2E8F0; margin:18px 0;">
        <div style="font-size:11.5px; color:#64748B;">
          Green Mile Construction RD • Facturación Electrónica e-CF (DGII · Ley 32-23) • República Dominicana
        </div>
      </div>
    </div>
  `;
}

async function notifyInvoiceIssued({ booking, ecfResult, xmlContent, recipientEmail }) {
  const cfg = getConfig();
  const isGov = (booking.ncfType === 'E45');
  const to = recipientEmail || (booking.govData && booking.govData.entityEmail) || cfg.notifications.adminNotifyEmail;
  const cc = to !== cfg.notifications.adminNotifyEmail ? cfg.notifications.adminNotifyEmail : null;

  const subject = isGov
    ? `Expediente Gubernamental e-CF 45 (${ecfResult.encf}) — OC ${booking.govData?.poNumber || ''} | Green Mile RD`
    : `Factura Electrónica ${ecfResult.encf} y Confirmación #GM-${String(booking.id).slice(-6)} | Green Mile RD`;

  const bodyHtml = `
    <p>Estimado(a) <strong>${booking.renter}</strong> (RNC/Cédula: <strong>${booking.renterRnc}</strong>),</p>
    <p>Se ha emitido correctamente su Comprobante Fiscal Electrónico ante la DGII:</p>
    <div style="background:#F8FAFC; border:1px solid #CBD5E1; border-radius:10px; padding:14px; margin:14px 0;">
      <div><strong>Comprobante e-NCF:</strong> <code>${ecfResult.encf}</code></div>
      <div><strong>Código de Seguridad DGII:</strong> <code>${ecfResult.securityCode}</code></div>
      <div><strong>Equipo:</strong> ${booking.title} (${booking.city})</div>
      <div><strong>Período:</strong> ${booking.qty} ${booking.unitLabel} (${booking.startDate} al ${booking.endDate || booking.startDate})</div>
      <div><strong>Subtotal Neto:</strong> ${fmtRD(booking.netSubtotal)} • <strong>ITBIS:</strong> ${fmtRD(booking.itbis)}</div>
      <div style="font-size:16px; color:#0D223A; margin-top:6px;"><strong>Total Facturado: ${fmtRD(booking.total)}</strong></div>
      ${isGov ? `<div style="color:#1E40AF; margin-top:6px;">Retención 5% ISR Estado (Art. 309): − ${fmtRD(booking.govIsrRetention)} • <strong>Neto Libramiento SIGEF: ${fmtRD(booking.total - (booking.govIsrRetention || 0) - (booking.govItbisRetention || 0))}</strong></div>` : ''}
    </div>
    ${ecfResult.dgiiQrUrl ? `<p><a href="${ecfResult.dgiiQrUrl}" style="display:inline-block; background:#B85A27; color:#fff; padding:10px 16px; border-radius:9px; text-decoration:none; font-weight:700;">Verificar Timbre e-CF en DGII →</a></p>` : ''}
  `;

  const attachments = xmlContent
    ? [{ filename: `${cfg.dgii.emisor.rnc}${ecfResult.encf}.xml`, content: xmlContent, contentType: 'application/xml' }]
    : [];

  const emailRes = await sendEmail({
    to,
    cc,
    subject,
    html: buildBrandedWrapper(`Comprobante Fiscal Electrónico ${ecfResult.encf}`, bodyHtml),
    attachments
  });

  const waText = `✅ Green Mile RD — Nuevo e-CF emitido: ${ecfResult.encf}\nCliente: ${booking.renter}\nEquipo: ${booking.title}\nTotal: ${fmtRD(booking.total)}\nPago: ${booking.paymentMethod} (${booking.paymentStatus})`;
  const waRes = await sendWhatsAppText({ toPhone: cfg.notifications.whatsapp.adminPhone, text: waText });

  return { email: emailRes, whatsapp: waRes };
}

async function notifyOwnerSettlement({ booking, ownerEmail, ownerPhone }) {
  const cfg = getConfig();
  const st = booking.settlement || {};
  const to = ownerEmail || cfg.notifications.adminNotifyEmail;

  const bodyHtml = `
    <p>Estimado propietario <strong>${booking.owner}</strong>,</p>
    <p>Confirmamos la liquidación de su equipo <strong>${booking.title}</strong> (Orden #GM-${String(booking.id).slice(-6)}):</p>
    <div style="background:#ECFDF5; border:1px solid #6EE7B7; border-radius:10px; padding:14px; margin:14px 0;">
      <div><strong>Monto Neto Transferido:</strong> <strong style="font-size:16px; color:#065F46;">${fmtRD(st.ownerNetTransfer)}</strong></div>
      <div><strong>Comisión Green Mile RD:</strong> ${st.commissionPct || 12}%</div>
      <div><strong>Soporte Fiscal:</strong> ${st.ownerNcf || st.ownerFiscalDoc}</div>
      <div><strong>Ref. Transferencia:</strong> ${st.transferRef || 'Confirmada'} • Fecha: ${st.paidDate || ''}</div>
    </div>
  `;

  const emailRes = await sendEmail({
    to,
    subject: `Liquidación Confirmada #GM-${String(booking.id).slice(-6)} — ${fmtRD(st.ownerNetTransfer)} | Green Mile RD`,
    html: buildBrandedWrapper('Comprobante de Liquidación a Propietario', bodyHtml)
  });

  const waRes = ownerPhone
    ? await sendWhatsAppText({
        toPhone: ownerPhone,
        text: `💸 Green Mile RD: Hemos transferido ${fmtRD(st.ownerNetTransfer)} por el alquiler de ${booking.title} (Ref. ${st.transferRef || 'OK'}, Soporte ${st.ownerNcf || 'e-CF'}).`
      })
    : { sent: false, skipped: true };

  return { email: emailRes, whatsapp: waRes };
}

module.exports = {
  sendEmail,
  sendWhatsAppText,
  notifyInvoiceIssued,
  notifyOwnerSettlement
};
