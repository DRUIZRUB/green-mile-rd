#!/usr/bin/env node
/**
 * Green Mile Construction RD — Despliegue de firestore.rules vía Firebase Admin SDK (Security Rules API)
 * Funciona con la cuenta de servicio Firebase Admin SDK sin requerir el rol serviceUsageConsumer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FUNCTIONS_DIR = path.join(ROOT_DIR, 'functions');
const RULES_PATH = path.join(ROOT_DIR, 'firestore.rules');
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

async function main() {
  const saPath = findServiceAccountPath();
  if (!saPath) {
    console.error('❌ No se encontró cuenta de servicio Firebase Admin SDK.');
    process.exit(1);
  }
  if (!fs.existsSync(RULES_PATH)) {
    console.error('❌ No se encontró firestore.rules en la raíz del proyecto.');
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  const source = fs.readFileSync(RULES_PATH, 'utf8');

  admin.initializeApp({
    credential: admin.credential.cert(sa)
  });

  console.log(`🔐 Publicando firestore.rules en proyecto ${sa.project_id}…`);
  const ruleset = await admin.securityRules().releaseFirestoreRulesetFromSource(source);
  console.log(`✅ firestore.rules publicado y activo en producción (ruleset: ${ruleset.name}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error publicando firestore.rules:', err.message);
  process.exit(1);
});
