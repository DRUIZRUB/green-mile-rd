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

function buildHtml({ basePrefix, equipmentId, title, description, canonicalUrl, ogImageUrl }) {
  const logoSrc = `${basePrefix}logo.png`;
  const homeHref = `${basePrefix}index.html`;
  const cssHref = `${basePrefix}css/equipo.css`;
  const dataJs = `${basePrefix}js/catalog-data.js`;
  const pageJs = `${basePrefix}js/equipo-page.js`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0D223A" />
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
  <meta property="og:image:width" content="640" />
  <meta property="og:image:height" content="480" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${escAttr(ogImageUrl)}" />
  <link rel="manifest" href="${basePrefix}manifest.json" />
  <link rel="apple-touch-icon" href="${basePrefix}icons/apple-touch-icon.png" />

  <link rel="stylesheet" href="${cssHref}" />
</head>
<body>
  <header class="detail-header">
    <div class="header-inner">
      <div class="header-left">
        <a class="back-link" href="${homeHref}">← Catálogo</a>
        <a class="brand-mini" href="${homeHref}">
          <img src="${logoSrc}" alt="Green Mile Construction RD" />
          <div>
            <strong>GREEN MILE</strong>
            <span>App RD</span>
          </div>
        </a>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost btn-fav" id="headerFavBtn" onclick="window.GM_DETAIL && window.GM_DETAIL.toggleFavorite()">♡ Guardar</button>
        <button type="button" class="btn btn-primary" onclick="window.GM_DETAIL && window.GM_DETAIL.nativeShare()">🔗 Compartir</button>
      </div>
    </div>
  </header>

  <main class="page-wrap" id="pageContent">
    <div class="panel not-found">
      <p>Cargando anuncio…</p>
    </div>
  </main>

  <!-- CONTRATO PDF IMPRIMIBLE -->
  <div class="sheet-backdrop" id="contractModal" onclick="if(event.target===this)window.GM_DETAIL.closeSheet('contractModal')">
    <div class="sheet">
      <div class="sheet-head no-print">
        <div>
          <h3>Contrato Digital Firmado</h3>
          <p>Listo para guardar en PDF o compartir</p>
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
            <li>✓ Prioridad de soporte en obra</li>
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
  <script src="${basePrefix}js/firebase-config.js"></script>
  <script src="${basePrefix}js/native-bridge.js"></script>
  <script src="${basePrefix}js/dgii-validator.js"></script>
  <script src="${basePrefix}js/geo-map.js"></script>
  <script src="${basePrefix}js/reviews.js"></script>
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
    : `${BASE_PUBLIC_URL}logo.png`;

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
    title: 'Anuncio de Maquinaria Pesada | Green Mile App RD',
    description: 'Alquiler gestionado de maquinaria pesada en República Dominicana con cotizador, mapa de distancia, e-NCF y contrato digital.',
    canonicalUrl: `${BASE_PUBLIC_URL}equipo.html`,
    ogImageUrl: `${BASE_PUBLIC_URL}logo.png`
  }),
  'utf8'
);

console.log(`✓ Generated ${GM.DEFAULT_EQUIPMENT.length} static listing pages in public/equipo/ + public/equipo.html`);
