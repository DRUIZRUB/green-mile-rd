#!/usr/bin/env node
/**
 * Green Mile Construction RD — Verificación e Inicialización de Cloud Firestore vía Firebase Admin SDK
 * Uso: npm run firebase:init-db
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FUNCTIONS_DIR = path.join(ROOT_DIR, 'functions');
const DEFAULT_SA = path.join(FUNCTIONS_DIR, 'certs', 'firebase-adminsdk.json');

const req = createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
const admin = req('firebase-admin');

function findServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? (path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
          ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
          : path.resolve(FUNCTIONS_DIR, process.env.FIREBASE_SERVICE_ACCOUNT_PATH))
      : null,
    DEFAULT_SA
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const DEFAULT_ADMIN_CONFIG = {
  companyName: 'GREEN MILE CONSTRUCTION RD, S.R.L.',
  rnc: '1-32-05073-8',
  rpeNumber: 'RPE-2026-048219',
  address: 'Av. Winston Churchill, Ens. Piantini, Santo Domingo, D.N.',
  email: 'facturacion@greenmilerd.com',
  phone: '809-555-0100',
  adminPin: '2026',
  standardCommissionPct: 12,
  govCommissionPct: 15,
  cardFeePct: 3.25,
  cardItbisRetentionPct: 2.0,
  govIsrRetentionPct: 5.0,
  dgiiCertExpiry: '2026-12-31',
  tssCertExpiry: '2026-12-31',
  banks: [
    { bank: 'Banco Popular Dominicano', type: 'Cuenta Corriente RD$', number: '801-442819-3', sigefPrimary: false },
    { bank: 'Banreservas (Cuenta SIGEF Estado)', type: 'Cuenta Corriente RD$', number: '960-118294-7', sigefPrimary: true },
    { bank: 'Banco BHD', type: 'Cuenta Corriente RD$', number: '104-882190-0', sigefPrimary: false }
  ],
  sequences: {
    E31: { prefix: 'E31', label: 'Crédito Fiscal Electrónico', next: 101, max: 5000, expires: '2027-12-31' },
    E32: { prefix: 'E32', label: 'Consumo Electrónico', next: 501, max: 10000, expires: '2027-12-31' },
    E45: { prefix: 'E45', label: 'Gubernamental Electrónico', next: 15, max: 1000, expires: '2027-12-31' },
    E44: { prefix: 'E44', label: 'Regímenes Especiales Electrónico', next: 8, max: 1000, expires: '2027-12-31' },
    E41: { prefix: 'E41', label: 'Compras Electrónico (Propietarios)', next: 24, max: 2000, expires: '2027-12-31' },
    E34: { prefix: 'E34', label: 'Nota de Crédito Electrónica', next: 1, max: 1000, expires: '2027-12-31' }
  }
};

async function main() {
  const saPath = findServiceAccountPath();
  if (!saPath) {
    console.error('❌ No se encontró cuenta de servicio Firebase Admin SDK.');
    console.error(`   Coloca el archivo JSON en: ${DEFAULT_SA}`);
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  console.log(`🔐 Conectando a Firebase Admin SDK — Proyecto: ${sa.project_id} (${sa.client_email})`);

  admin.initializeApp({
    credential: admin.credential.cert(sa)
  });

  const db = admin.firestore();
  const cfgRef = db.collection('admin_config').doc('main');
  const cfgSnap = await cfgRef.get();

  if (!cfgSnap.exists) {
    await cfgRef.set({
      ...DEFAULT_ADMIN_CONFIG,
      initializedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Documento admin_config/main inicializado en Cloud Firestore con secuencias e-NCF.');
  } else {
    const existing = cfgSnap.data() || {};
    const mergedSeqs = { ...DEFAULT_ADMIN_CONFIG.sequences, ...(existing.sequences || {}) };
    await cfgRef.set({ sequences: mergedSeqs }, { merge: true });
    console.log(`✓ admin_config/main ya existe en Cloud Firestore (Emisor: ${existing.companyName || DEFAULT_ADMIN_CONFIG.companyName}).`);
  }

  const [eqSnap, bkSnap, ecfSnap] = await Promise.all([
    db.collection('equipment').get(),
    db.collection('bookings').get(),
    db.collection('ecf_documents').get()
  ]);

  console.log('\n📊 Estado actual de Cloud Firestore:');
  console.log(`   • equipment:      ${eqSnap.size} documento(s)`);
  console.log(`   • bookings:       ${bkSnap.size} documento(s)`);
  console.log(`   • ecf_documents:  ${ecfSnap.size} XML(s) archivado(s)`);
  console.log('\n✅ Conexión Firebase Admin SDK verificada exitosamente.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error conectando a Cloud Firestore:', err.message);
  process.exit(1);
});
