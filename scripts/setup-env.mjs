#!/usr/bin/env node
/**
 * Green Mile Construction RD — Gestor Seguro de functions/.env y Certificados (.p12 / .pem / .key)
 *
 * Comandos:
 *   node scripts/setup-env.mjs init        # Crea functions/.env (chmod 600) con secretos aleatorios
 *   node scripts/setup-env.mjs wizard      # Asistente interactivo paso a paso para llenar functions/.env
 *   node scripts/setup-env.mjs sync-certs  # Convierte archivos en functions/certs/ o *_PATH a Base64 en functions/.env
 *   node scripts/setup-env.mjs check       # Valida llaves y prueba criptográficamente .p12 / PEM sin imprimir secretos
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FUNCTIONS_DIR = path.join(ROOT_DIR, 'functions');
const CERTS_DIR = path.join(FUNCTIONS_DIR, 'certs');
const ENV_FILE = path.join(FUNCTIONS_DIR, '.env');
const EXAMPLE_FILE = path.join(FUNCTIONS_DIR, '.env.example');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function parseEnvContent(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

function formatEnvValue(val) {
  const s = String(val == null ? '' : val).trim();
  if (!s) return '';
  if (/[\s#"'$]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Actualiza llaves dentro de functions/.env preservando todos los comentarios, orden y formato original.
 */
function writeEnvUpdates(updates) {
  const baseText = fs.existsSync(ENV_FILE)
    ? fs.readFileSync(ENV_FILE, 'utf8')
    : fs.readFileSync(EXAMPLE_FILE, 'utf8');

  const remaining = new Map(Object.entries(updates));
  const outLines = baseText.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!m) return line;
    const key = m[1];
    if (!remaining.has(key)) return line;
    const nextVal = remaining.get(key);
    remaining.delete(key);
    return `${key}=${formatEnvValue(nextVal)}`;
  });

  if (remaining.size > 0) {
    outLines.push('', '# Variables adicionales');
    for (const [k, v] of remaining.entries()) {
      outLines.push(`${k}=${formatEnvValue(v)}`);
    }
  }

  fs.writeFileSync(ENV_FILE, outLines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  try {
    fs.chmodSync(ENV_FILE, 0o600);
  } catch (_) {}
}

function readCurrentEnv() {
  if (!fs.existsSync(ENV_FILE)) return new Map();
  return parseEnvContent(fs.readFileSync(ENV_FILE, 'utf8'));
}

function verifyGitIgnored(relPath) {
  try {
    execFileSync('git', ['-C', ROOT_DIR, 'check-ignore', '-q', relPath], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function resolveFileIfExists(candidatePath) {
  if (!candidatePath) return null;
  const expanded = candidatePath.startsWith('~/')
    ? path.join(process.env.HOME || '', candidatePath.slice(2))
    : candidatePath;
  const attempts = path.isAbsolute(expanded)
    ? [expanded]
    : [
        path.resolve(FUNCTIONS_DIR, expanded),
        path.resolve(ROOT_DIR, expanded),
        path.resolve(CERTS_DIR, expanded)
      ];
  for (const p of attempts) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function loadForge() {
  try {
    const req = createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
    return req('node-forge');
  } catch (_) {
    return null;
  }
}

function inspectP12(base64Str, password) {
  const forge = loadForge();
  if (!forge) {
    return { checked: false, note: 'Ejecuta `npm run functions:install` para validación criptográfica de .p12' };
  }
  try {
    const der = forge.util.decode64(base64Str);
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || '');
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    if (!keyBags.length || !certBags.length) {
      return { checked: true, ok: false, error: 'El archivo .p12 no contiene llave privada + certificado X.509.' };
    }
    const cert = certBags[0].cert;
    const cnAttr = cert.subject.getField('CN');
    const cn = cnAttr ? cnAttr.value : 'Sin CN';
    const validTo = cert.validity.notAfter;
    const expired = validTo && validTo.getTime() < Date.now();
    return {
      checked: true,
      ok: !expired,
      cn,
      validTo: validTo ? validTo.toISOString().slice(0, 10) : 'N/A',
      expired,
      error: expired ? `Certificado .p12 VENCIDO el ${validTo.toISOString().slice(0, 10)}` : null
    };
  } catch (err) {
    return {
      checked: true,
      ok: false,
      error: `No se pudo abrir el .p12 (verifica DGII_CERT_PASSWORD o el Base64): ${err.message}`
    };
  }
}

function inspectPem(base64Str, expectedMarker) {
  try {
    const text = Buffer.from(base64Str, 'base64').toString('utf8');
    const ok = text.includes(expectedMarker);
    return { ok, error: ok ? null : `El Base64 no contiene un bloque PEM válido (${expectedMarker})` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ============================================================================
   COMANDO 1: init — Crea functions/.env listo para llenar
   ============================================================================ */
function cmdInit(force = false) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  const existed = fs.existsSync(ENV_FILE);

  if (!existed || force) {
    fs.copyFileSync(EXAMPLE_FILE, ENV_FILE);
    try {
      fs.chmodSync(ENV_FILE, 0o600);
    } catch (_) {}
  }

  const cur = readCurrentEnv();
  const autoSecrets = {};
  if (!cur.get('ADMIN_API_SECRET')) {
    autoSecrets.ADMIN_API_SECRET = `gm_adm_${crypto.randomBytes(24).toString('hex')}`;
  }
  if (!cur.get('PAYMENT_WEBHOOK_SECRET')) {
    autoSecrets.PAYMENT_WEBHOOK_SECRET = `gm_whk_${crypto.randomBytes(24).toString('hex')}`;
  }
  if (Object.keys(autoSecrets).length > 0) {
    writeEnvUpdates(autoSecrets);
  }

  const ignored = verifyGitIgnored('functions/.env');
  console.log(`\n${C.bold}${C.green}✓ Archivo functions/.env listo:${C.reset} ${ENV_FILE}`);
  console.log(`  Permisos: 600 (solo lectura/escritura del usuario actual)`);
  console.log(`  Protección Git (.gitignore): ${ignored ? `${C.green}ACTIVADA ✓${C.reset}` : `${C.red}REVISAR .gitignore!${C.reset}`}`);
  if (autoSecrets.ADMIN_API_SECRET || autoSecrets.PAYMENT_WEBHOOK_SECRET) {
    console.log(`  Secretos aleatorios generados automáticamente: ${Object.keys(autoSecrets).join(', ')}`);
  }
  console.log(`\n${C.cyan}Próximos pasos cuando tengas tus API keys:${C.reset}`);
  console.log(`  1. Edita directamente ${C.bold}functions/.env${C.reset} (o ejecuta ${C.bold}npm run env:wizard${C.reset}).`);
  console.log(`  2. Si tienes archivos .p12 / .crt / .key, cópialos en ${C.bold}functions/certs/${C.reset} y corre ${C.bold}npm run env:sync-certs${C.reset}.`);
  console.log(`  3. Valida todo sin imprimir secretos: ${C.bold}npm run env:check${C.reset}`);
  console.log(`  4. Despliega a Firebase: ${C.bold}npm run env:deploy${C.reset}\n`);
}

/* ============================================================================
   COMANDO 2: sync-certs — Convierte .p12 / .crt / .key a Base64 en functions/.env
   ============================================================================ */
function cmdSyncCerts() {
  if (!fs.existsSync(ENV_FILE)) cmdInit(false);
  const cur = readCurrentEnv();
  const updates = {};
  let synced = 0;

  const mappings = [
    {
      label: 'Certificado DGII (.p12)',
      pathKey: 'DGII_CERT_P12_PATH',
      b64Key: 'DGII_CERT_P12_BASE64',
      defaults: ['dgii.p12', 'certificado_dgii.p12', 'firma.p12']
    },
    {
      label: 'Certificado mTLS Azul (.crt/.pem)',
      pathKey: 'AZUL_CERT_PATH',
      b64Key: 'AZUL_CERT_BASE64',
      defaults: ['azul.crt', 'azul.pem']
    },
    {
      label: 'Llave Privada mTLS Azul (.key)',
      pathKey: 'AZUL_KEY_PATH',
      b64Key: 'AZUL_KEY_BASE64',
      defaults: ['azul.key', 'azul-key.pem']
    }
  ];

  for (const m of mappings) {
    let foundPath = resolveFileIfExists(cur.get(m.pathKey));
    if (!foundPath) {
      for (const name of m.defaults) {
        const p = path.join(CERTS_DIR, name);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          foundPath = p;
          break;
        }
      }
    }
    if (foundPath) {
      const b64 = fs.readFileSync(foundPath).toString('base64');
      updates[m.b64Key] = b64;
      const rel = path.relative(FUNCTIONS_DIR, foundPath);
      if (!rel.startsWith('..')) updates[m.pathKey] = `./${rel}`;
      console.log(`${C.green}✓${C.reset} ${m.label}: codificado desde ${C.bold}${foundPath}${C.reset} → ${m.b64Key} (${b64.length} chars)`);
      synced++;
    }
  }

  if (synced > 0) {
    writeEnvUpdates(updates);
    console.log(`\n${C.green}✓ ${synced} certificado(s) sincronizado(s) a Base64 en functions/.env.${C.reset}\n`);
  } else {
    console.log(`\n${C.yellow}ℹ No se encontraron archivos nuevos en functions/certs/ ni en *_PATH.${C.reset}`);
    console.log(`  Coloca tus archivos (dgii.p12, azul.crt, azul.key) en ${CERTS_DIR} o configura *_PATH en functions/.env.\n`);
  }
}

/* ============================================================================
   COMANDO 3: check — Validación profunda de functions/.env (cero impresión de secretos)
   ============================================================================ */
function cmdCheck() {
  if (!fs.existsSync(ENV_FILE)) {
    console.log(`${C.yellow}ℹ functions/.env no existe todavía. Creándolo desde .env.example...${C.reset}`);
    cmdInit(false);
  }

  const cur = readCurrentEnv();
  const get = (k, def = '') => (cur.get(k) || def).trim();
  let errors = 0;

  console.log(`\n${C.bold}${C.blue}=== Diagnóstico de Credenciales Green Mile RD (functions/.env) ===${C.reset}\n`);

  const ignored = verifyGitIgnored('functions/.env');
  if (!ignored) {
    console.log(`${C.red}✗ PELIGRO:${C.reset} functions/.env NO está ignorado por .gitignore`);
    errors++;
  } else {
    console.log(`${C.green}✓ Seguridad Git:${C.reset} functions/.env y functions/certs/* bloqueados en .gitignore`);
  }

  const requireKeys = (keys) => {
    let ok = true;
    for (const k of keys) {
      const v = get(k);
      if (!v) {
        console.log(`  ${C.red}✗ Falta:${C.reset} ${k}`);
        ok = false;
        errors++;
      } else {
        console.log(`  ${C.green}✓ Cargado:${C.reset} ${k} (${v.length} caracteres)`);
      }
    }
    return ok;
  };

  // 1. Pagos
  const pay = get('PAYMENT_PROVIDER', 'sandbox').toLowerCase();
  console.log(`\n${C.bold}1. Pasarela de Tarjetas:${C.reset} ${pay.toUpperCase()}`);
  if (pay === 'sandbox') {
    console.log(`  ${C.yellow}🟡 Modo SANDBOX${C.reset} (cambia PAYMENT_PROVIDER a azul | cardnet | visanet | stripe cuando tengas llaves)`);
  } else if (pay === 'azul') {
    const ok = requireKeys(['AZUL_ENV', 'AZUL_AUTH1', 'AZUL_AUTH2', 'AZUL_STORE_ID', 'AZUL_CERT_BASE64', 'AZUL_KEY_BASE64']);
    if (ok) {
      const cCheck = inspectPem(get('AZUL_CERT_BASE64'), 'BEGIN CERTIFICATE');
      const kCheck = inspectPem(get('AZUL_KEY_BASE64'), 'PRIVATE KEY');
      if (!cCheck.ok) { console.log(`  ${C.red}✗ AZUL_CERT_BASE64:${C.reset} ${cCheck.error}`); errors++; }
      else console.log(`  ${C.green}✓ AZUL_CERT_BASE64:${C.reset} certificado PEM válido`);
      if (!kCheck.ok) { console.log(`  ${C.red}✗ AZUL_KEY_BASE64:${C.reset} ${kCheck.error}`); errors++; }
      else console.log(`  ${C.green}✓ AZUL_KEY_BASE64:${C.reset} llave privada PEM válida`);
    }
  } else if (pay === 'cardnet') {
    requireKeys(['CARDNET_ENV', 'CARDNET_MERCHANT_ID', 'CARDNET_TERMINAL_ID', 'CARDNET_PRIVATE_KEY']);
  } else if (pay === 'visanet') {
    requireKeys(['VISANET_ENV', 'VISANET_MERCHANT_ID', 'VISANET_API_KEY_ID', 'VISANET_API_SECRET']);
  } else if (pay === 'stripe') {
    if (requireKeys(['STRIPE_SECRET_KEY'])) {
      const sk = get('STRIPE_SECRET_KEY');
      if (!/^sk_(test|live)_/.test(sk)) {
        console.log(`  ${C.yellow}⚠ STRIPE_SECRET_KEY no inicia con sk_test_ ni sk_live_${C.reset}`);
      } else {
        console.log(`  ${C.green}✓ Formato Stripe válido:${C.reset} ${sk.startsWith('sk_live_') ? 'PRODUCCIÓN (sk_live)' : 'PRUEBAS (sk_test)'}`);
      }
    }
  } else {
    console.log(`  ${C.red}✗ PAYMENT_PROVIDER inválido:${C.reset} '${pay}'`);
    errors++;
  }

  // 2. DGII e-CF
  const dgii = get('DGII_ECF_MODE', 'sandbox').toLowerCase();
  const dgiiEnv = get('DGII_ENV', 'testecf').toLowerCase();
  console.log(`\n${C.bold}2. Facturación Electrónica DGII e-CF:${C.reset} ${dgii.toUpperCase()} (ambiente: ${dgiiEnv})`);
  const rnc = get('DGII_EMISOR_RNC').replace(/\D/g, '');
  if (rnc.length !== 9 && rnc.length !== 11) {
    console.log(`  ${C.red}✗ DGII_EMISOR_RNC inválido:${C.reset} debe tener 9 dígitos (RNC)`);
    errors++;
  } else {
    console.log(`  ${C.green}✓ Emisor:${C.reset} RNC ${rnc} — ${get('DGII_EMISOR_RAZON_SOCIAL')}`);
  }

  if (dgii === 'sandbox') {
    console.log(`  ${C.yellow}🟡 Modo SANDBOX${C.reset} (cambia DGII_ECF_MODE a direct_dgii o provider_api cuando tengas certificado/API)`);
  } else if (dgii === 'direct_dgii') {
    const ok = requireKeys(['DGII_CERT_P12_BASE64', 'DGII_CERT_PASSWORD']);
    if (ok) {
      const p12Check = inspectP12(get('DGII_CERT_P12_BASE64'), get('DGII_CERT_PASSWORD'));
      if (!p12Check.checked) {
        console.log(`  ${C.yellow}⚠ ${p12Check.note}${C.reset}`);
      } else if (!p12Check.ok) {
        console.log(`  ${C.red}✗ Certificado .p12:${C.reset} ${p12Check.error}`);
        errors++;
      } else {
        console.log(`  ${C.green}✓ Certificado .p12 VERIFICADO criptográficamente:${C.reset} CN="${p12Check.cn}" • Vigente hasta ${p12Check.validTo}`);
      }
    }
  } else if (dgii === 'provider_api') {
    requireKeys(['ECF_PROVIDER_BASE_URL', 'ECF_PROVIDER_API_KEY']);
  } else {
    console.log(`  ${C.red}✗ DGII_ECF_MODE inválido:${C.reset} '${dgii}'`);
    errors++;
  }

  // 3. Notificaciones
  const emailProv = get('EMAIL_PROVIDER', 'none').toLowerCase();
  console.log(`\n${C.bold}3. Notificaciones (Correo & WhatsApp):${C.reset}`);
  if (emailProv === 'none') {
    console.log(`  ${C.yellow}🟡 Correo:${C.reset} desactivado (opcional: cambia EMAIL_PROVIDER a resend o smtp)`);
  } else if (emailProv === 'resend') {
    requireKeys(['RESEND_API_KEY', 'EMAIL_FROM']);
  } else if (emailProv === 'smtp') {
    requireKeys(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']);
  } else {
    console.log(`  ${C.red}✗ EMAIL_PROVIDER inválido:${C.reset} '${emailProv}'`);
    errors++;
  }

  if (get('WHATSAPP_TOKEN') || get('WHATSAPP_PHONE_NUMBER_ID')) {
    requireKeys(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']);
  } else {
    console.log(`  ${C.yellow}🟡 WhatsApp Cloud API:${C.reset} no configurado aún (opcional)`);
  }

  // 4. Seguridad Admin & Webhooks + Firebase Admin SDK
  console.log(`\n${C.bold}4. Seguridad Backend y Firebase Admin SDK:${C.reset}`);
  console.log(`  ${get('ADMIN_API_SECRET') ? `${C.green}✓ ADMIN_API_SECRET configurado` : `${C.yellow}🟡 ADMIN_API_SECRET vacío (usará PIN de Firestore)`}${C.reset}`);
  console.log(`  ${get('PAYMENT_WEBHOOK_SECRET') ? `${C.green}✓ PAYMENT_WEBHOOK_SECRET configurado` : `${C.yellow}🟡 PAYMENT_WEBHOOK_SECRET vacío`}${C.reset}`);
  const saFile = resolveFileIfExists(get('GM_LOCAL_SERVICE_ACCOUNT_PATH') || './certs/firebase-adminsdk.json');
  if (saFile) {
    try {
      const sa = JSON.parse(fs.readFileSync(saFile, 'utf8'));
      const saIgnored = verifyGitIgnored(path.relative(ROOT_DIR, saFile));
      console.log(`  ${C.green}✓ Firebase Admin SDK JSON:${C.reset} proyecto ${sa.project_id} (${sa.client_email}) — Git protegido: ${saIgnored ? 'SÍ' : 'REVISAR'}`);
      if (!saIgnored) errors++;
    } catch (err) {
      console.log(`  ${C.red}✗ Firebase Admin SDK JSON inválido:${C.reset} ${err.message}`);
      errors++;
    }
  } else {
    console.log(`  ${C.yellow}🟡 Firebase Admin SDK JSON local:${C.reset} opcional (en Cloud Functions se usa ADC automáticamente)`);
  }

  console.log('');
  if (errors > 0) {
    console.log(`${C.red}${C.bold}✗ Validación con ${errors} error(es). Corrige functions/.env y vuelve a ejecutar \`npm run env:check\`.${C.reset}\n`);
    process.exit(1);
  }
  console.log(`${C.green}${C.bold}✅ Todo válido en functions/.env. Listo para \`npm run env:deploy\`.${C.reset}\n`);
}

/* ============================================================================
   COMANDO 4: wizard — Asistente interactivo en español
   ============================================================================ */
async function cmdWizard() {
  if (!fs.existsSync(ENV_FILE)) cmdInit(false);
  const cur = readCurrentEnv();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label, defVal = '', isSecret = false) => {
    const hint = defVal ? (isSecret ? ` [actual: ***${defVal.length} chars***]` : ` [${defVal}]`) : '';
    const ans = (await rl.question(`${label}${hint}: `)).trim();
    return ans || defVal;
  };

  console.log(`\n${C.bold}${C.cyan}=== Asistente de Configuración de API Keys — Green Mile Construction RD ===${C.reset}`);
  console.log(`Presiona Enter para mantener el valor actual. Todo se guardará localmente en functions/.env (chmod 600).\n`);

  const updates = {};

  // 1. Pasarela de tarjetas
  const pay = (await ask('1) Pasarela de tarjetas (sandbox | azul | cardnet | visanet | stripe)', cur.get('PAYMENT_PROVIDER') || 'sandbox')).toLowerCase();
  updates.PAYMENT_PROVIDER = pay;

  if (pay === 'azul') {
    updates.AZUL_ENV = await ask('   AZUL_ENV (test | prod)', cur.get('AZUL_ENV') || 'test');
    updates.AZUL_AUTH1 = await ask('   AZUL_AUTH1', cur.get('AZUL_AUTH1') || '', true);
    updates.AZUL_AUTH2 = await ask('   AZUL_AUTH2', cur.get('AZUL_AUTH2') || '', true);
    updates.AZUL_STORE_ID = await ask('   AZUL_STORE_ID (Merchant ID)', cur.get('AZUL_STORE_ID') || '');
    const certPath = await ask('   Ruta a certificado Azul (.crt/.pem) (opcional si ya tienes Base64)', cur.get('AZUL_CERT_PATH') || '');
    if (certPath) {
      const resolved = resolveFileIfExists(certPath);
      if (resolved) {
        updates.AZUL_CERT_PATH = certPath;
        updates.AZUL_CERT_BASE64 = fs.readFileSync(resolved).toString('base64');
        console.log(`   ${C.green}✓ Certificado Azul codificado en Base64${C.reset}`);
      } else {
        console.log(`   ${C.yellow}⚠ Archivo no encontrado: ${certPath}${C.reset}`);
      }
    }
    const keyPath = await ask('   Ruta a llave privada Azul (.key) (opcional si ya tienes Base64)', cur.get('AZUL_KEY_PATH') || '');
    if (keyPath) {
      const resolved = resolveFileIfExists(keyPath);
      if (resolved) {
        updates.AZUL_KEY_PATH = keyPath;
        updates.AZUL_KEY_BASE64 = fs.readFileSync(resolved).toString('base64');
        console.log(`   ${C.green}✓ Llave privada Azul codificada en Base64${C.reset}`);
      } else {
        console.log(`   ${C.yellow}⚠ Archivo no encontrado: ${keyPath}${C.reset}`);
      }
    }
  } else if (pay === 'cardnet') {
    updates.CARDNET_ENV = await ask('   CARDNET_ENV (test | prod)', cur.get('CARDNET_ENV') || 'test');
    updates.CARDNET_MERCHANT_ID = await ask('   CARDNET_MERCHANT_ID', cur.get('CARDNET_MERCHANT_ID') || '');
    updates.CARDNET_TERMINAL_ID = await ask('   CARDNET_TERMINAL_ID', cur.get('CARDNET_TERMINAL_ID') || '');
    updates.CARDNET_PUBLIC_KEY = await ask('   CARDNET_PUBLIC_KEY', cur.get('CARDNET_PUBLIC_KEY') || '');
    updates.CARDNET_PRIVATE_KEY = await ask('   CARDNET_PRIVATE_KEY', cur.get('CARDNET_PRIVATE_KEY') || '', true);
  } else if (pay === 'visanet') {
    updates.VISANET_ENV = await ask('   VISANET_ENV (test | prod)', cur.get('VISANET_ENV') || 'test');
    updates.VISANET_MERCHANT_ID = await ask('   VISANET_MERCHANT_ID', cur.get('VISANET_MERCHANT_ID') || '');
    updates.VISANET_API_KEY_ID = await ask('   VISANET_API_KEY_ID', cur.get('VISANET_API_KEY_ID') || '');
    updates.VISANET_API_SECRET = await ask('   VISANET_API_SECRET', cur.get('VISANET_API_SECRET') || '', true);
  } else if (pay === 'stripe') {
    updates.STRIPE_SECRET_KEY = await ask('   STRIPE_SECRET_KEY (sk_test_... o sk_live_...)', cur.get('STRIPE_SECRET_KEY') || '', true);
    updates.STRIPE_WEBHOOK_SECRET = await ask('   STRIPE_WEBHOOK_SECRET (whsec_...)', cur.get('STRIPE_WEBHOOK_SECRET') || '', true);
  }

  // 2. DGII e-CF
  console.log('');
  const dgii = (await ask('2) Modo Facturación DGII e-CF (sandbox | direct_dgii | provider_api)', cur.get('DGII_ECF_MODE') || 'sandbox')).toLowerCase();
  updates.DGII_ECF_MODE = dgii;
  if (dgii !== 'sandbox') {
    updates.DGII_ENV = await ask('   Ambiente DGII (testecf | certecf | ecf)', cur.get('DGII_ENV') || 'testecf');
    updates.DGII_EMISOR_RNC = (await ask('   RNC Emisor Green Mile RD (9 dígitos)', cur.get('DGII_EMISOR_RNC') || '132050738')).replace(/\D/g, '');
  }
  if (dgii === 'direct_dgii') {
    const p12Path = await ask('   Ruta al certificado digital .p12 (ej. ./certs/dgii.p12)', cur.get('DGII_CERT_P12_PATH') || '');
    if (p12Path) {
      const resolved = resolveFileIfExists(p12Path);
      if (resolved) {
        updates.DGII_CERT_P12_PATH = p12Path;
        updates.DGII_CERT_P12_BASE64 = fs.readFileSync(resolved).toString('base64');
        console.log(`   ${C.green}✓ Certificado .p12 codificado en Base64${C.reset}`);
      } else {
        console.log(`   ${C.yellow}⚠ Archivo no encontrado: ${p12Path}${C.reset}`);
      }
    }
    updates.DGII_CERT_PASSWORD = await ask('   Contraseña del certificado .p12', cur.get('DGII_CERT_PASSWORD') || '', true);
  } else if (dgii === 'provider_api') {
    updates.ECF_PROVIDER_BASE_URL = await ask('   URL base API Proveedor e-CF', cur.get('ECF_PROVIDER_BASE_URL') || '');
    updates.ECF_PROVIDER_API_KEY = await ask('   API Key Proveedor e-CF', cur.get('ECF_PROVIDER_API_KEY') || '', true);
    updates.ECF_PROVIDER_SECRET = await ask('   API Secret Proveedor e-CF (opcional)', cur.get('ECF_PROVIDER_SECRET') || '', true);
  }

  // 3. Correo & WhatsApp
  console.log('');
  const emailProv = (await ask('3) Proveedor de Correo automático (none | resend | smtp)', cur.get('EMAIL_PROVIDER') || 'none')).toLowerCase();
  updates.EMAIL_PROVIDER = emailProv;
  if (emailProv === 'resend') {
    updates.RESEND_API_KEY = await ask('   RESEND_API_KEY', cur.get('RESEND_API_KEY') || '', true);
    updates.EMAIL_FROM = await ask('   EMAIL_FROM', cur.get('EMAIL_FROM') || 'Green Mile RD <facturacion@greenmilerd.com>');
  } else if (emailProv === 'smtp') {
    updates.SMTP_HOST = await ask('   SMTP_HOST', cur.get('SMTP_HOST') || '');
    updates.SMTP_PORT = await ask('   SMTP_PORT', cur.get('SMTP_PORT') || '587');
    updates.SMTP_USER = await ask('   SMTP_USER', cur.get('SMTP_USER') || '');
    updates.SMTP_PASS = await ask('   SMTP_PASS', cur.get('SMTP_PASS') || '', true);
    updates.EMAIL_FROM = await ask('   EMAIL_FROM', cur.get('EMAIL_FROM') || 'Green Mile RD <facturacion@greenmilerd.com>');
  }

  const useWa = (await ask('4) ¿Configurar WhatsApp Business Cloud API ahora? (s/N)', 'n')).toLowerCase();
  if (useWa === 's' || useWa === 'si' || useWa === 'y') {
    updates.WHATSAPP_TOKEN = await ask('   WHATSAPP_TOKEN', cur.get('WHATSAPP_TOKEN') || '', true);
    updates.WHATSAPP_PHONE_NUMBER_ID = await ask('   WHATSAPP_PHONE_NUMBER_ID', cur.get('WHATSAPP_PHONE_NUMBER_ID') || '');
    updates.WHATSAPP_ADMIN_PHONE = await ask('   WHATSAPP_ADMIN_PHONE (ej. 18095550100)', cur.get('WHATSAPP_ADMIN_PHONE') || '18095550100');
  }

  rl.close();
  writeEnvUpdates(updates);
  console.log(`\n${C.green}✓ Cambios guardados en functions/.env (permisos 600).${C.reset}`);
  cmdCheck();
}

const cmd = (process.argv[2] || 'check').toLowerCase();
const forceFlag = process.argv.includes('--force');

if (cmd === 'init') {
  cmdInit(forceFlag);
} else if (cmd === 'sync-certs') {
  cmdSyncCerts();
} else if (cmd === 'wizard' || cmd === 'interactive') {
  cmdWizard().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (cmd === 'check' || cmd === 'validate') {
  cmdCheck();
} else {
  console.log('Uso: node scripts/setup-env.mjs [init | wizard | sync-certs | check]');
  process.exit(1);
}
