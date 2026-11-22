# Integraciones Backend Producción — Green Mile Construction RD

Todo el backend productivo de **Green Mile Construction RD** ya está implementado en [`functions/`](./functions/) sobre **Firebase Cloud Functions v2 (Node.js 22)**, conectado al frontend mediante [`public/js/api-client.js`](./public/js/api-client.js) y monitoreado en tiempo real desde el **Centro Administrativo (`public/admin.html` → Configuración Empresa)**.

> **Cero cambios de código requeridos al pasar a producción:** únicamente completa `functions/.env` con tus llaves API y ejecuta `./scripts/configure-secrets.sh --deploy`.

---

## 1. Arquitectura Implementada

| Capa | Archivo | Responsabilidad |
|---|---|---|
| **Router HTTP v2** | `functions/index.js` | Expuesto en `/api/**` (Firebase Hosting rewrite) y `https://us-central1-studio-8139121026-17b90.cloudfunctions.net/api` |
| **Pasarelas de Pago RD** | `functions/src/payments/index.js` | **Azul** (JSON + mTLS + failover automático), **CardNET**, **Visanet / CyberSource** (HMAC-SHA256), **Stripe** y **Sandbox** con enmascaramiento PCI-DSS |
| **Motor DGII e-CF v1.0** | `functions/src/dgii/ecf-xml.js` & `ecf-service.js` | Construcción XML v1.0 (`E31`, `E32`, `E34`, `E41`, `E44`, `E45`), firma digital **XMLDSig RSA-SHA256** con certificado `.p12`, autenticación Semilla/ValidarSemilla JWT, consulta de `TrackId`, URL QR oficial DGII, contador atómico Firestore e historial inmutable en `ecf_documents` |
| **Notificaciones** | `functions/src/notifications/index.js` | Envío automático de facturas, expedientes gubernamentales E45 (`.gob.do`) y liquidaciones a propietarios vía **Resend API / SMTP** y **WhatsApp Business Cloud API** |
| **Cliente Frontend** | `public/js/api-client.js` | Conecta checkout de equipos (`equipo-page.js`) y consola administrativa (`admin-app.js`) con fallback transparente a Sandbox local si Cloud Functions aún no está desplegado |

---

## 2. Endpoints Disponibles (`/api/**`)

- `GET  /api/health` — Diagnóstico seguro de integraciones activas (jamás expone secretos).
- `POST /api/payments/charge` — Autoriza tarjeta en pasarela RD + emite e-CF atómico + guarda orden + envía notificaciones.
- `POST /api/payments/void` — Anula transacción con tarjeta y emite Nota de Crédito `e-CF 34` (requiere PIN o `ADMIN_API_SECRET`).
- `POST /api/ecf/issue` — Emite y firma cualquier e-CF (`E31`, `E32`, `E45`, `E44`, `E41`, `E34`) desde Administración.
- `GET  /api/ecf/status/:trackId` — Consulta en vivo el estado de aceptación en DGII y actualiza la orden en Firestore.
- `GET  /api/ecf/xml/:encf` — Descarga el archivo `.xml` oficial firmado archivado en `ecf_documents`.
- `POST /api/gov/notify` — Envía el expediente gubernamental `e-CF 45` (con XML adjunto) al correo `.gob.do` de la institución.
- `POST /api/settlements/notify` — Envía aviso de liquidación transferida al propietario de la maquinaria.
- `POST /api/webhooks/payment` — Webhook asíncrono con verificación HMAC-SHA256 para conciliación automática.

---

## 3. Checklist de API Keys y Credenciales (Qué Necesitas Pasar)

Copia [`functions/.env.example`](./functions/.env.example) a `functions/.env` (archivo protegido por `.gitignore`) y llena únicamente los bloques que vayas a activar:

### A. Pasarela de Pagos con Tarjeta (elige 1 en `PAYMENT_PROVIDER`)

1. **Azul — Banco Popular (`PAYMENT_PROVIDER=azul`)**
   - `AZUL_ENV`: `test` (pruebas) o `prod` (producción)
   - `AZUL_AUTH1`: Header `Auth1` entregado por Azul
   - `AZUL_AUTH2`: Header `Auth2` entregado por Azul
   - `AZUL_STORE_ID`: Merchant / Store ID (11 dígitos)
   - `AZUL_CERT_BASE64`: Certificado cliente mTLS `.crt`/`.pem` en Base64 (`./scripts/configure-secrets.sh --encode-cert cert.pem`)
   - `AZUL_KEY_BASE64`: Llave privada mTLS `.key` en Base64 (`./scripts/configure-secrets.sh --encode-cert key.pem`)

2. **CardNET (`PAYMENT_PROVIDER=cardnet`)**
   - `CARDNET_ENV`: `test` o `prod`
   - `CARDNET_MERCHANT_ID`, `CARDNET_TERMINAL_ID`, `CARDNET_MERCHANT_TYPE` (default `5082`)
   - `CARDNET_PUBLIC_KEY` y `CARDNET_PRIVATE_KEY`

3. **Visanet Dominicana / CyberSource (`PAYMENT_PROVIDER=visanet`)**
   - `VISANET_ENV`: `test` o `prod`
   - `VISANET_MERCHANT_ID`, `VISANET_API_KEY_ID`, `VISANET_API_SECRET`

4. **Stripe (`PAYMENT_PROVIDER=stripe`)**
   - `STRIPE_SECRET_KEY` (`sk_test_...` o `sk_live_...`)
   - `STRIPE_WEBHOOK_SECRET` (`whsec_...`)

### B. Facturación Electrónica DGII — Ley 32-23 (elige modo en `DGII_ECF_MODE`)

1. **Opción 1 — Conexión Directa a DGII con Certificado `.p12` (`DGII_ECF_MODE=direct_dgii`)**
   - `DGII_ENV`: `testecf` (pre-certificación), `certecf` (certificación) o `ecf` (producción)
   - `DGII_EMISOR_RNC`: RNC oficial de 9 dígitos de Green Mile Construction RD
   - `DGII_EMISOR_RAZON_SOCIAL`, `DGII_EMISOR_DIRECCION`, `DGII_EMISOR_CORREO`
   - `DGII_CERT_P12_BASE64`: Certificado digital tributario `.p12` (INDOTEL / Viafirma / Cámara) en Base64 (`./scripts/configure-secrets.sh --encode-cert firma.p12`)
   - `DGII_CERT_PASSWORD`: Contraseña del archivo `.p12`

2. **Opción 2 — API de Proveedor Certificado e-CF (`DGII_ECF_MODE=provider_api`)**
   - `ECF_PROVIDER_BASE_URL`: URL base del endpoint REST de emisión
   - `ECF_PROVIDER_API_KEY` y `ECF_PROVIDER_SECRET`

### C. Correo Electrónico y WhatsApp Automáticos (Opcional pero Recomendado)

- **Resend API (`EMAIL_PROVIDER=resend`):** `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`
- **SMTP Corporativo (`EMAIL_PROVIDER=smtp`):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- **WhatsApp Business Cloud API:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ADMIN_PHONE`

### D. Seguridad de Administración y Webhooks

- `ADMIN_API_SECRET`: Token largo opcional para autenticar llamadas administrativas vía `Authorization: Bearer ...` (adicional al PIN configurado en Firestore).
- `PAYMENT_WEBHOOK_SECRET`: Secreto compartido HMAC-SHA256 para verificar webhooks de pasarelas.

---

## 4. Comandos Rápidos de Validación y Despliegue

```bash
# 1. Codificar un certificado .p12 o .pem a Base64 (1 línea)
./scripts/configure-secrets.sh --encode-cert /ruta/a/certificado.p12

# 2. Validar que todas las llaves requeridas estén cargadas (sin imprimir secretos)
./scripts/configure-secrets.sh --check

# 3. Correr pruebas unitarias y de firma criptográfica XMLDSig localmente
npm run functions:test

# 4. Desplegar Cloud Functions v2, Reglas de Firestore y Hosting
./scripts/configure-secrets.sh --deploy
```

> **Nota sobre Firebase Blaze:** Firebase Cloud Functions v2 requiere que el proyecto `studio-8139121026-17b90` esté en el plan **Blaze** (pago por uso con capa gratuita generosa de 2 millones de invocaciones/mes). Una vez desplegado, abre `admin.html` → **Configuración Empresa** y pulsa **🔄 Probar Conexión Backend** para confirmar que todos los indicadores aparezcan en verde.

---

## 5. Garantías de Seguridad

- **PCI-DSS:** Ni el navegador ni Firestore ni los logs almacenan jamás el número completo de tarjeta (PAN) ni el CVV; únicamente marca, últimos 4 dígitos y código de autorización bancaria (`authCode`).
- **Protección de Secretos:** `.gitignore` bloquea `.env`, `functions/.env`, `*.p12`, `*.pfx`, `*.pem`, `*.key` y `*.crt`.
- **Inmutabilidad Fiscal:** La colección `ecf_documents` en [`firestore.rules`](./firestore.rules) solo puede ser escrita por el backend privilegiado (Firebase Admin SDK), protegiendo el archivo histórico de XMLs firmados para auditorías DGII.
