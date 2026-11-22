'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Registro centralizado de configuración y secretos de Green Mile Construction RD.
 * Lee variables desde process.env (inyectado automáticamente por Firebase Cloud Functions v2
 * desde functions/.env en deploy) y también carga functions/.env automáticamente en ejecución local.
 * NUNCA expone valores sensibles en getPublicHealthStatus().
 */

const FUNCTIONS_DIR = path.resolve(__dirname, '..');

function loadLocalDotEnvOnce() {
  if (process.env.GM_SKIP_DOTENV === '1') return;
  const envPath = path.join(FUNCTIONS_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!key || (process.env[key] !== undefined && process.env[key] !== '')) continue;
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val !== '') {
        process.env[key] = val;
      }
    }
  } catch (_) {}
}

loadLocalDotEnvOnce();

function env(key, fallback = '') {
  const val = process.env[key];
  return val != null && String(val).trim() !== '' ? String(val).trim() : fallback;
}

function boolEnv(key, fallback = false) {
  const v = env(key, '');
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function resolveCertBase64(base64Key, pathKey) {
  const direct = env(base64Key, '');
  if (direct) return direct;
  const relOrAbs = env(pathKey, '');
  if (!relOrAbs) return '';
  try {
    const resolved = path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(FUNCTIONS_DIR, relOrAbs);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved).toString('base64');
    }
  } catch (_) {}
  return '';
}

function getConfig() {
  const paymentProvider = env('PAYMENT_PROVIDER', 'sandbox').toLowerCase();
  const dgiiMode = env('DGII_ECF_MODE', 'sandbox').toLowerCase();
  const dgiiEnv = env('DGII_ENV', 'testecf').toLowerCase();
  const emailProvider = env('EMAIL_PROVIDER', 'none').toLowerCase();

  return {
    appBaseUrl: env('APP_BASE_URL', 'https://green-mile-rd.web.app'),
    adminApiSecret: env('ADMIN_API_SECRET', ''),

    payment: {
      provider: paymentProvider,
      webhookSecret: env('PAYMENT_WEBHOOK_SECRET', ''),
      azul: {
        env: env('AZUL_ENV', 'test').toLowerCase(),
        auth1: env('AZUL_AUTH1', ''),
        auth2: env('AZUL_AUTH2', ''),
        storeId: env('AZUL_STORE_ID', ''),
        certBase64: resolveCertBase64('AZUL_CERT_BASE64', 'AZUL_CERT_PATH'),
        keyBase64: resolveCertBase64('AZUL_KEY_BASE64', 'AZUL_KEY_PATH'),
        force3ds: boolEnv('AZUL_FORCE_3DS', true)
      },
      cardnet: {
        env: env('CARDNET_ENV', 'test').toLowerCase(),
        merchantId: env('CARDNET_MERCHANT_ID', ''),
        terminalId: env('CARDNET_TERMINAL_ID', ''),
        merchantType: env('CARDNET_MERCHANT_TYPE', '5082'),
        publicKey: env('CARDNET_PUBLIC_KEY', ''),
        privateKey: env('CARDNET_PRIVATE_KEY', '')
      },
      visanet: {
        env: env('VISANET_ENV', 'test').toLowerCase(),
        merchantId: env('VISANET_MERCHANT_ID', ''),
        apiKeyId: env('VISANET_API_KEY_ID', ''),
        apiSecret: env('VISANET_API_SECRET', '')
      },
      stripe: {
        secretKey: env('STRIPE_SECRET_KEY', ''),
        webhookSecret: env('STRIPE_WEBHOOK_SECRET', '')
      }
    },

    dgii: {
      mode: dgiiMode, // sandbox | direct_dgii | provider_api
      env: ['testecf', 'certecf', 'ecf'].includes(dgiiEnv) ? dgiiEnv : 'testecf',
      emisor: {
        rnc: env('DGII_EMISOR_RNC', '132050738').replace(/\D/g, ''),
        razonSocial: env('DGII_EMISOR_RAZON_SOCIAL', 'GREEN MILE CONSTRUCTION RD, S.R.L.'),
        nombreComercial: env('DGII_EMISOR_NOMBRE_COMERCIAL', 'GREEN MILE CONSTRUCTION RD'),
        direccion: env('DGII_EMISOR_DIRECCION', 'Av. Winston Churchill, Ens. Piantini, Santo Domingo, D.N.'),
        municipio: env('DGII_EMISOR_MUNICIPIO', '010101'),
        provincia: env('DGII_EMISOR_PROVINCIA', '010000'),
        correo: env('DGII_EMISOR_CORREO', 'facturacion@greenmilerd.com')
      },
      certP12Base64: resolveCertBase64('DGII_CERT_P12_BASE64', 'DGII_CERT_P12_PATH'),
      certPassword: env('DGII_CERT_PASSWORD', ''),
      providerApi: {
        baseUrl: env('ECF_PROVIDER_BASE_URL', ''),
        apiKey: env('ECF_PROVIDER_API_KEY', ''),
        secret: env('ECF_PROVIDER_SECRET', '')
      }
    },

    notifications: {
      emailProvider,
      emailFrom: env('EMAIL_FROM', 'Green Mile RD <facturacion@greenmilerd.com>'),
      adminNotifyEmail: env('ADMIN_NOTIFY_EMAIL', 'administracion@greenmilerd.com'),
      resendApiKey: env('RESEND_API_KEY', ''),
      smtp: {
        host: env('SMTP_HOST', ''),
        port: Number(env('SMTP_PORT', '587')) || 587,
        secure: boolEnv('SMTP_SECURE', false),
        user: env('SMTP_USER', ''),
        pass: env('SMTP_PASS', '')
      },
      whatsapp: {
        token: env('WHATSAPP_TOKEN', ''),
        phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID', ''),
        adminPhone: env('WHATSAPP_ADMIN_PHONE', '18095550100')
      }
    }
  };
}

function isPaymentLiveConfigured(cfg) {
  const p = cfg.payment;
  if (p.provider === 'azul') {
    return Boolean(p.azul.auth1 && p.azul.auth2 && p.azul.storeId && p.azul.certBase64 && p.azul.keyBase64);
  }
  if (p.provider === 'cardnet') {
    return Boolean(p.cardnet.merchantId && p.cardnet.terminalId && p.cardnet.privateKey);
  }
  if (p.provider === 'visanet') {
    return Boolean(p.visanet.merchantId && p.visanet.apiKeyId && p.visanet.apiSecret);
  }
  if (p.provider === 'stripe') {
    return Boolean(p.stripe.secretKey);
  }
  return false;
}

function isDgiiLiveConfigured(cfg) {
  const d = cfg.dgii;
  if (d.mode === 'direct_dgii') {
    return Boolean(d.certP12Base64 && d.certPassword && d.emisor.rnc.length === 9);
  }
  if (d.mode === 'provider_api') {
    return Boolean(d.providerApi.baseUrl && d.providerApi.apiKey);
  }
  return false;
}

function isEmailConfigured(cfg) {
  const n = cfg.notifications;
  if (n.emailProvider === 'resend') return Boolean(n.resendApiKey);
  if (n.emailProvider === 'smtp') return Boolean(n.smtp.host && n.smtp.user && n.smtp.pass);
  return false;
}

function isWhatsAppConfigured(cfg) {
  return Boolean(cfg.notifications.whatsapp.token && cfg.notifications.whatsapp.phoneNumberId);
}

/**
 * Retorna estado seguro de diagnóstico (sin revelar ningún secreto ni API key).
 */
function getPublicHealthStatus() {
  const cfg = getConfig();
  const payReady = isPaymentLiveConfigured(cfg);
  const dgiiReady = isDgiiLiveConfigured(cfg);

  return {
    ok: true,
    service: 'green-mile-rd-api',
    timestamp: new Date().toISOString(),
    payment: {
      configuredProvider: cfg.payment.provider,
      activeMode: payReady ? 'live' : 'sandbox',
      environment: cfg.payment[cfg.payment.provider]?.env || (payReady ? 'live' : 'sandbox'),
      credentialsLoaded: payReady,
      supportedProviders: ['azul', 'cardnet', 'visanet', 'stripe', 'sandbox']
    },
    dgii: {
      configuredMode: cfg.dgii.mode,
      activeMode: dgiiReady ? cfg.dgii.mode : 'sandbox',
      dgiiEnv: cfg.dgii.env,
      emisorRnc: cfg.dgii.emisor.rnc,
      certificateLoaded: Boolean(cfg.dgii.certP12Base64 && cfg.dgii.certPassword),
      providerApiLoaded: Boolean(cfg.dgii.providerApi.baseUrl && cfg.dgii.providerApi.apiKey)
    },
    notifications: {
      emailProvider: cfg.notifications.emailProvider,
      emailReady: isEmailConfigured(cfg),
      whatsappReady: isWhatsAppConfigured(cfg)
    }
  };
}

module.exports = {
  getConfig,
  isPaymentLiveConfigured,
  isDgiiLiveConfigured,
  isEmailConfigured,
  isWhatsAppConfigured,
  getPublicHealthStatus
};
