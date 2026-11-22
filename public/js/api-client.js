/* Green Mile Construction RD — Cliente API hacia Firebase Cloud Functions v2 (Pasarelas RD, DGII e-CF y Notificaciones) */
(function (global) {
  const DEFAULT_CLOUD_FN_URL = 'https://us-central1-studio-8139121026-17b90.cloudfunctions.net/api';
  const API_URL_STORAGE_KEY = 'gm_rd_api_base_url_v1';

  function getApiBaseUrl() {
    try {
      const custom = localStorage.getItem(API_URL_STORAGE_KEY);
      if (custom && /^https?:\/\//i.test(custom.trim())) {
        return custom.trim().replace(/\/$/, '');
      }
      const cfg = global.GM_BILLING && global.GM_BILLING.loadAdminConfig ? global.GM_BILLING.loadAdminConfig() : null;
      if (cfg && cfg.apiBaseUrl && /^https?:\/\//i.test(cfg.apiBaseUrl.trim())) {
        return cfg.apiBaseUrl.trim().replace(/\/$/, '');
      }
    } catch (_) {}

    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname || '';
      if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
        return `${window.location.origin}/api`;
      }
    }
    return DEFAULT_CLOUD_FN_URL;
  }

  function setApiBaseUrl(url) {
    const clean = String(url || '').trim().replace(/\/$/, '');
    try {
      if (clean) localStorage.setItem(API_URL_STORAGE_KEY, clean);
      else localStorage.removeItem(API_URL_STORAGE_KEY);
    } catch (_) {}
    return getApiBaseUrl();
  }

  async function requestJson(path, { method = 'GET', body = null, adminPin = null, timeoutMs = 15000 } = {}) {
    const url = `${getApiBaseUrl()}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const headers = { Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (adminPin) headers['X-Admin-Pin'] = String(adminPin);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}

      if (res.status === 404 && !json) {
        return { ok: false, unreachable: true, status: 404, error: 'Backend Cloud Functions aún no desplegado.' };
      }
      return { ok: res.ok && Boolean(json && json.ok !== false), status: res.status, data: json, error: (json && json.error) || `HTTP ${res.status}` };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, unreachable: true, status: 0, error: err && err.name === 'AbortError' ? 'Tiempo de espera agotado' : (err && err.message) || 'Sin conexión con Cloud Functions' };
    }
  }

  async function getHealth() {
    const res = await requestJson('/health', { method: 'GET', timeoutMs: 4500 });
    if (!res.ok || !res.data) {
      return {
        reachable: false,
        apiBaseUrl: getApiBaseUrl(),
        error: res.error || 'Backend no desplegado todavía'
      };
    }
    return Object.assign({ reachable: true, apiBaseUrl: getApiBaseUrl() }, res.data);
  }

  async function chargeCardAndIssueEcf({ booking, card, clientEmail = null, stripePaymentMethodId = null }) {
    const res = await requestJson('/payments/charge', {
      method: 'POST',
      body: { booking, card, clientEmail, stripePaymentMethodId },
      timeoutMs: 28000
    });
    if (res.unreachable) {
      return { fallbackLocal: true, reason: res.error };
    }
    if (res.status === 402 || (res.data && res.data.approved === false)) {
      return { fallbackLocal: false, approved: false, error: res.error || 'Tarjeta declinada por la entidad bancaria.' };
    }
    if (!res.ok || !res.data) {
      return { fallbackLocal: false, approved: false, error: res.error || 'Error procesando el cobro.' };
    }
    return {
      fallbackLocal: false,
      approved: true,
      booking: res.data.booking,
      ecf: res.data.ecf,
      payment: res.data.payment
    };
  }

  async function issueEcf({ bookingId, booking, typeCode, creditNoteRef = null, recipientEmail = null, adminPin = null }) {
    const res = await requestJson('/ecf/issue', {
      method: 'POST',
      body: { bookingId, booking, typeCode, creditNoteRef, recipientEmail },
      adminPin,
      timeoutMs: 25000
    });
    if (res.unreachable) return { fallbackLocal: true, reason: res.error };
    if (!res.ok) return { fallbackLocal: false, ok: false, error: res.error };
    return { fallbackLocal: false, ok: true, ecf: res.data.ecf };
  }

  async function queryDgiiStatus(trackId, bookingId = '') {
    const qs = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : '';
    const res = await requestJson(`/ecf/status/${encodeURIComponent(trackId)}${qs}`, { method: 'GET', timeoutMs: 12000 });
    if (res.unreachable) return { ok: false, unreachable: true, error: res.error };
    return Object.assign({ ok: res.ok }, res.data || { error: res.error });
  }

  function getXmlDownloadUrl(encf) {
    return `${getApiBaseUrl()}/ecf/xml/${encodeURIComponent(encf)}`;
  }

  async function voidOrder({ bookingId, adminPin }) {
    const res = await requestJson('/payments/void', {
      method: 'POST',
      body: { bookingId },
      adminPin,
      timeoutMs: 22000
    });
    if (res.unreachable) return { fallbackLocal: true, reason: res.error };
    return Object.assign({ fallbackLocal: false, ok: res.ok }, res.data || { error: res.error });
  }

  async function notifyGovDossier({ bookingId, recipientEmail, adminPin }) {
    const res = await requestJson('/gov/notify', {
      method: 'POST',
      body: { bookingId, recipientEmail },
      adminPin,
      timeoutMs: 15000
    });
    if (res.unreachable) return { ok: false, unreachable: true, error: res.error };
    return Object.assign({ ok: res.ok }, res.data || { error: res.error });
  }

  async function notifyOwnerSettlement({ bookingId, ownerEmail, adminPin }) {
    const res = await requestJson('/settlements/notify', {
      method: 'POST',
      body: { bookingId, ownerEmail },
      adminPin,
      timeoutMs: 15000
    });
    if (res.unreachable) return { ok: false, unreachable: true, error: res.error };
    return Object.assign({ ok: res.ok }, res.data || { error: res.error });
  }

  global.GM_API = {
    DEFAULT_CLOUD_FN_URL,
    getApiBaseUrl,
    setApiBaseUrl,
    getHealth,
    chargeCardAndIssueEcf,
    issueEcf,
    queryDgiiStatus,
    getXmlDownloadUrl,
    voidOrder,
    notifyGovDossier,
    notifyOwnerSettlement
  };
})(window);
