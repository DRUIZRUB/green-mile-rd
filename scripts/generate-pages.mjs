#!/usr/bin/env node
/**
 * Generates individual shareable HTML pages for every equipment listing in
 * public/js/catalog-data.js, plus the dynamic fallback public/equipo.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GM = require('../public/js/catalog-data.js');

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const EQUIPO_DIR = path.join(PUBLIC_DIR, 'equipo');
const BASE_PUBLIC_URL = GM.PUBLIC_BASE_URL;

function escAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ASSET_VER = '20261122-5';

function buildHtml({ basePrefix, equipmentId, title, description, canonicalUrl, ogImageUrl }) {
  const logoSrc = `${basePrefix}logo.png?v=${ASSET_VER}`;
  const homeHref = `${basePrefix}index.html`;
  const cssHref = `${basePrefix}css/equipo.css?v=${ASSET_VER}`;
  const dataJs = `${basePrefix}js/catalog-data.js?v=${ASSET_VER}`;
  const pageJs = `${basePrefix}js/equipo-page.js?v=${ASSET_VER}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0D223A" />
  <link rel="icon" type="image/png" href="${logoSrc}" />
  <title>${escAttr(title)}</title>
  <meta name="description" content="${escAttr(description)}" />
  <link rel="canonical" href="${escAttr(canonicalUrl)}" />

  <!-- Open Graph / WhatsApp / Redes Sociales -->
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="es_DO" />
  <meta property="og:site_name" content="Green Mile Construction RD" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${escAttr(canonicalUrl)}" />
  <meta property="og:image" content="${escAttr(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${escAttr(ogImageUrl)}" />
  <link rel="manifest" href="${basePrefix}manifest.json" />
  <link rel="apple-touch-icon" href="${basePrefix}icons/apple-touch-icon.png" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref}" />
</head>
<body>
  <header class="detail-header">
    <div class="header-inner">
      <div class="header-left">
        <a class="back-link" href="${homeHref}" aria-label="Volver al Catálogo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          <span class="back-label">Catálogo</span>
        </a>
      </div>
      <a class="brand-logo-link brand-mini" href="${homeHref}" aria-label="Green Mile Construction RD — Catálogo">
        <img src="${logoSrc}" width="97" height="78" alt="Green Mile Construction RD" />
      </a>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost btn-fav" id="headerFavBtn" onclick="window.GM_DETAIL && window.GM_DETAIL.toggleFavorite()" aria-label="Guardar equipo en favoritos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          <span class="btn-label">Guardar</span>
        </button>
        <button type="button" class="btn btn-primary btn-share-hdr" onclick="window.GM_DETAIL && window.GM_DETAIL.nativeShare()" aria-label="Compartir anuncio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span class="btn-label">Compartir</span>
        </button>
      </div>
    </div>
  </header>

  <main class="page-wrap" id="pageContent">
    <div class="panel not-found">
      <p>Cargando anuncio…</p>
    </div>
  </main>

  <footer class="detail-footer">
    <div class="detail-footer-inner">
      <a class="footer-brand" href="${homeHref}" aria-label="Green Mile Construction RD">
        <img src="${logoSrc}" width="67" height="54" alt="Green Mile Construction RD" />
      </a>
      <nav class="detail-footer-links" aria-label="Enlaces institucionales">
        <a href="${homeHref}">Catálogo RD</a>
        <a href="${basePrefix}acerca-de.html">Acerca de</a>
        <a href="${basePrefix}terminos.html">Términos y Condiciones</a>
        <a href="${basePrefix}privacidad.html">Seguridad y Privacidad</a>
        <a href="${basePrefix}admin.html">Administración</a>
      </nav>
      <div class="detail-footer-copy">© 2026 Green Mile Construction RD · Alquiler Gestionado con e-NCF</div>
    </div>
  </footer>

  <!-- CONTRATO PDF IMPRIMIBLE -->
  <div class="sheet-backdrop" id="contractModal" onclick="if(event.target===this)window.GM_DETAIL.closeSheet('contractModal')">
    <div class="sheet">
      <div class="sheet-head no-print">
        <div>
          <h3>Contrato Digital y Factura e-CF</h3>
          <p>Listo para guardar en PDF, imprimir o radicar</p>
        </div>
        <button type="button" class="close-x" onclick="window.GM_DETAIL.closeSheet('contractModal')">&times;</button>
      </div>
      <div class="sheet-body" id="contractBody"></div>
    </div>
  </div>

  <!-- GREEN MILE PRO -->
  <div class="sheet-backdrop" id="proSheet" onclick="if(event.target===this)window.GM_DETAIL.closeSheet('proSheet')">
    <div class="sheet" style="max-width:440px;">
      <div class="sheet-head">
        <div>
          <h3>Green Mile Pro RD</h3>
          <p>Beneficios para contratistas frecuentes</p>
        </div>
        <button type="button" class="close-x" onclick="window.GM_DETAIL.closeSheet('proSheet')">&times;</button>
      </div>
      <div class="sheet-body">
        <div style="background:var(--navy-soft); border:1.5px solid var(--navy); border-radius:16px; padding:18px; margin-bottom:16px;">
          <div style="font-size:26px; font-weight:800; color:var(--navy);">RD$ 2,900 <span style="font-size:12px; font-weight:500; color:var(--text-muted);">/ mes</span></div>
          <ul style="list-style:none; margin-top:12px; font-size:13px; display:flex; flex-direction:column; gap:7px;">
            <li>✓ <strong>10% de descuento</strong> automático en alquileres</li>
            <li>✓ Contratos digitales ilimitados con e-NCF</li>
            <li>✓ Prioridad de soporte en obra y acceso a crédito corporativo</li>
          </ul>
        </div>
        <button type="button" class="btn btn-primary" style="width:100%;" onclick="window.GM_DETAIL.activatePro()">Activar Plan Pro</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    window.GM_PAGE = { basePrefix: ${JSON.stringify(basePrefix)}, equipmentId: ${JSON.stringify(equipmentId)} };
  </script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js"></script>
  <script src="${dataJs}"></script>
  <script src="${basePrefix}js/firebase-config.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/native-bridge.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/dgii-validator.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/billing-engine.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/api-client.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/geo-map.js?v=${ASSET_VER}"></script>
  <script src="${basePrefix}js/reviews.js?v=${ASSET_VER}"></script>
  <script src="${pageJs}"></script>
</body>
</html>
`;
}

// Ensure clean equipo/ output dir
fs.mkdirSync(EQUIPO_DIR, { recursive: true });
for (const f of fs.readdirSync(EQUIPO_DIR)) {
  if (f.endsWith('.html')) fs.unlinkSync(path.join(EQUIPO_DIR, f));
}

// 1. Generate 44 static individual listing pages
for (const item of GM.DEFAULT_EQUIPMENT) {
  const slug = GM.getStaticSlug(item);
  const filePath = path.join(EQUIPO_DIR, `${slug}.html`);
  const canonicalUrl = `${BASE_PUBLIC_URL}equipo/${slug}.html`;
  const imgName = path.basename(item.img || '', path.extname(item.img || ''));
  const ogJpgRel = `img/og/${imgName}.jpg`;
  const ogImageUrl = fs.existsSync(path.join(PUBLIC_DIR, ogJpgRel))
    ? `${BASE_PUBLIC_URL}${ogJpgRel}`
    : `${BASE_PUBLIC_URL}img/og/green-mile-og.jpg`;

  const priceStr = GM.fmtRD(item.priceDay);
  const title = `${item.title} en ${item.city} — ${priceStr}/día | Green Mile RD`;
  const description = `Alquiler de ${item.title} (${item.power || item.category}) en ${item.city}, República Dominicana. ${priceStr}/día${item.operator ? ' con operador certificado' : ''}. ${item.desc}`;

  fs.writeFileSync(
    filePath,
    buildHtml({
      basePrefix: '../',
      equipmentId: item.id,
      title,
      description,
      canonicalUrl,
      ogImageUrl
    }),
    'utf8'
  );
}

// 2. Generate dynamic fallback public/equipo.html for user-published equipment
fs.writeFileSync(
  path.join(PUBLIC_DIR, 'equipo.html'),
  buildHtml({
    basePrefix: './',
    equipmentId: null,
    title: 'Anuncio de Maquinaria Pesada | Green Mile Construction RD',
    description: 'Alquiler gestionado de maquinaria pesada en República Dominicana con cotizador, mapa de distancia, e-NCF y contrato digital.',
    canonicalUrl: `${BASE_PUBLIC_URL}equipo.html`,
    ogImageUrl: `${BASE_PUBLIC_URL}img/og/green-mile-og.jpg`
  }),
  'utf8'
);

console.log(`✓ Generated ${GM.DEFAULT_EQUIPMENT.length} static listing pages in public/equipo/ + public/equipo.html`);
