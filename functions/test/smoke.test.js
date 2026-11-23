'use strict';

// Garantizar que las pruebas de humo corran siempre en sandbox aislado aunque existan llaves reales en functions/.env
process.env.GM_SKIP_DOTENV = '1';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.DGII_ECF_MODE = 'sandbox';

const assert = require('node:assert');
const crypto = require('node:crypto');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');

const { getPublicHealthStatus, isOriginAllowed } = require('../src/config');
const { chargeCard, verifyWebhookSignature } = require('../src/payments');
const { buildEcfXml, signXmlWithP12, buildDgiiQrUrl } = require('../src/dgii/ecf-xml');

function createTestP12(password) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: 'GREEN MILE CONSTRUCTION RD TEST' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    p12Base64: forge.util.encode64(p12Der),
    certPem: forge.pki.certificateToPem(cert)
  };
}

async function run() {
  console.log('1. Verificando diagnóstico /api/health y lista blanca CORS...');
  const health = getPublicHealthStatus();
  assert.strictEqual(health.ok, true);
  assert.strictEqual(health.payment.activeMode, 'sandbox');
  assert.strictEqual(health.dgii.activeMode, 'sandbox');
  assert.strictEqual(health.security.corsRestricted, true);
  assert.strictEqual(isOriginAllowed('https://green-mile-rd.web.app'), true);
  assert.strictEqual(isOriginAllowed('capacitor://localhost'), true);
  assert.strictEqual(isOriginAllowed('http://localhost:5000'), true);
  assert.strictEqual(isOriginAllowed('https://evil.example.com'), false);

  console.log('2. Verificando pasarela de tarjetas (validación Luhn + aprobación + declinación 0002)...');
  const okPay = await chargeCard({
    orderId: 1700001234,
    totalAmount: 105020,
    itbisAmount: 16020,
    description: 'Alquiler Retroexcavadora CAT',
    card: { holder: 'Ing. Carlos Mendez', number: '4532 0151 1283 0366', expiry: '12/29', cvv: '123' }
  });
  assert.strictEqual(okPay.approved, true);
  assert.strictEqual(okPay.cardInfo.brand, 'Visa');
  assert.strictEqual(okPay.cardInfo.last4, '0366');
  assert.strictEqual('number' in okPay.cardInfo, false, 'PCI-DSS: PAN must never be returned');
  assert.strictEqual('cvv' in okPay.cardInfo, false, 'PCI-DSS: CVV must never be returned');

  const declinedPay = await chargeCard({
    orderId: 1700001235,
    totalAmount: 50000,
    itbisAmount: 7627,
    card: { holder: 'Prueba Declinada', number: '4000 0000 0000 0002', expiry: '12/29', cvv: '123' }
  });
  assert.strictEqual(declinedPay.approved, false);
  assert.strictEqual(declinedPay.isoCode, '51');

  console.log('3. Generando certificado .p12 real y firmando XML e-CF 31, 45 (Estado), 44 y 34 con XMLDSig RSA-SHA256...');
  const { p12Base64, certPem } = createTestP12('clave-prueba-dgii');
  const emisor = {
    rnc: '132050738',
    razonSocial: 'GREEN MILE CONSTRUCTION RD, S.R.L.',
    nombreComercial: 'GREEN MILE CONSTRUCTION RD',
    direccion: 'Av. Winston Churchill, Santo Domingo, D.N.',
    municipio: '010101',
    provincia: '010000',
    correo: 'facturacion@greenmilerd.com'
  };

  // E45 Gubernamental
  const built45 = buildEcfXml({
    booking: {
      id: 1700009999,
      title: 'Bulldozer CAT D8T XL',
      city: 'La Romana',
      renter: 'MINISTERIO DE OBRAS PUBLICAS Y COMUNICACIONES',
      renterRnc: '4-01-00755-1',
      address: 'Villa Hermosa, La Romana',
      qty: 10,
      unitLabel: 'días',
      netSubtotal: 396500,
      itbis: 71370,
      total: 467870,
      paymentMethod: 'gov_po',
      govIsrRetention: 19825,
      govData: { poNumber: 'MOPC-DAF-CM-2026-0312', entityEmail: 'cuentasporpagar@mopc.gob.do', paymentTermsDays: 45 }
    },
    encf: 'E450000000015',
    expiresDate: '2027-12-31',
    emisor
  });
  assert(built45.xml.includes('<TipoeCF>45</TipoeCF>'));
  assert(built45.xml.includes('<TotalISRRetencion>19825.00</TotalISRRetencion>'));
  assert(built45.xml.includes('<NumeroOrdenCompra>MOPC-DAF-CM-2026-0312</NumeroOrdenCompra>'));

  const signed45 = signXmlWithP12(built45.xml, p12Base64, 'clave-prueba-dgii');
  assert(signed45.signedXml.includes('<Signature '), 'XMLDSig Signature element present');
  assert.strictEqual(signed45.securityCode.length, 6, '6-char DGII security code extracted');

  // Verificar criptográficamente la firma XMLDSig generada
  const doc = new DOMParser().parseFromString(signed45.signedXml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  assert(sigNode, 'Signature DOM node found');
  const verifier = new SignedXml({ publicCert: certPem });
  verifier.loadSignature(sigNode);
  assert.strictEqual(verifier.checkSignature(signed45.signedXml), true, 'Cryptographic XMLDSig verification MUST pass!');

  // E44 Exento
  const built44 = buildEcfXml({
    booking: { title: 'Excavadora JCB', city: 'Punta Cana', renter: 'CORAL BAVARO SAS', renterRnc: '1-32-44910-2', qty: 5, unitLabel: 'días', netSubtotal: 154500, itbis: 0, total: 154500, paymentMethod: 'transfer' },
    encf: 'E440000000008',
    expiresDate: '2027-12-31',
    emisor
  });
  assert(built44.xml.includes('<MontoExento>154500.00</MontoExento>'));

  // E34 Nota de Crédito
  const built34 = buildEcfXml({
    booking: { title: 'Retroexcavadora CAT', city: 'Santo Domingo', renter: 'CONSTRUCTORA RD', renterRnc: '1-31-88420-9', qty: 3, unitLabel: 'días', netSubtotal: 50000, itbis: 9000, total: 59000, paymentMethod: 'card' },
    encf: 'E340000000001',
    expiresDate: '2027-12-31',
    emisor,
    creditNoteRef: { ncfModificado: 'E310000000101', fechaModificado: new Date().toISOString(), codigoModificacion: '1' }
  });
  assert(built34.xml.includes('<NCFModificado>E310000000101</NCFModificado>'));

  // URL oficial QR DGII (incluyendo prueba de codificación de signo +)
  const qrUrl = buildDgiiQrUrl({
    dgiiEnv: 'testecf',
    rncEmisor: '1-32-05073-8',
    rncComprador: '4-01-00755-1',
    encf: 'E450000000015',
    issueDateStr: built45.issueDateStr,
    total: 467870,
    signTimeStr: built45.signTimeStr,
    securityCode: 'AB+12/'
  });
  assert(qrUrl.startsWith('https://ecf.dgii.gov.do/testecf/ConsultaTimbre?'));
  assert(qrUrl.includes('CodigoSeguridad=AB%2B12%2F'), 'Special characters in CodigoSeguridad must be URL-encoded');

  console.log('4. Verificando seguridad de webhooks (fail-closed sin secreto, HMAC estándar y Stripe-Signature)...');
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = JSON.stringify({ CustomOrderId: 'GM-12345', IsoCode: '00' });
  const noSecretCheck = verifyWebhookSignature(rawBody, 'anything');
  assert.strictEqual(noSecretCheck.verified, false);
  assert.strictEqual(noSecretCheck.reason, 'NO_SECRET_CONFIGURED');

  // HMAC estándar (pasarelas locales)
  process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_secret_123';
  const validSig = crypto.createHmac('sha256', 'test_webhook_secret_123').update(rawBody).digest('hex');
  assert.strictEqual(verifyWebhookSignature(rawBody, validSig).verified, true);
  assert.strictEqual(verifyWebhookSignature(rawBody, `sha256=${validSig}`).verified, true);
  assert.strictEqual(verifyWebhookSignature(rawBody, 'bad_sig').verified, false);

  // Firma oficial Stripe (t=<ts>,v1=<hex> + ventana anti-replay)
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_stripe_secret';
  const nowSec = 1795377600;
  const stripePayload = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { metadata: { orderId: '998877' } } } });
  const stripeSig = crypto.createHmac('sha256', 'whsec_test_stripe_secret').update(`${nowSec}.${stripePayload}`).digest('hex');
  const stripeHdr = `t=${nowSec},v1=${stripeSig}`;
  assert.strictEqual(verifyWebhookSignature(stripePayload, stripeHdr, { isStripe: true, nowSec }).verified, true);
  assert.strictEqual(
    verifyWebhookSignature(stripePayload, stripeHdr, { isStripe: true, nowSec: nowSec + 600 }).reason,
    'STRIPE_TIMESTAMP_OUT_OF_TOLERANCE'
  );
  assert.strictEqual(verifyWebhookSignature(stripePayload, `t=${nowSec},v1=deadbeef`, { isStripe: true, nowSec }).verified, false);

  console.log('5. Verificando motor de Importación Internacional de Repuestos (DGA <= US$200, DR-CAFTA, Marítimo LCL)...');
  const imp = require('../../public/js/import-engine.js');
  // Caso A: Courier aéreo <= US$ 200 FOB -> Exento DGA (Decreto 402-05)
  const smallAir = imp.calculateLandedCost({ fobUsd: 150, qty: 1, weightLb: 3, origin: 'usa_miami', shippingMode: 'air' });
  assert.strictEqual(smallAir.deMinimisExempt, true);
  assert.strictEqual(smallAir.tariffUsd, 0);
  assert.strictEqual(smallAir.dgaItbisUsd, 0);
  assert.strictEqual(smallAir.customsBrokerUsd, 0);
  assert.strictEqual(smallAir.depositPct, 100);
  assert(smallAir.totalRD > 0, 'Total RD$ must be positive');

  // Caso B: > US$ 200 FOB desde EE. UU. (DR-CAFTA 0% arancel + 18% ITBIS + corredor + anticipo 70%)
  const usaCafta = imp.calculateLandedCost({ fobUsd: 1200, qty: 1, weightLb: 10, origin: 'usa_miami', shippingMode: 'air', applyCafta: true });
  assert.strictEqual(usaCafta.deMinimisExempt, false);
  assert.strictEqual(usaCafta.caftaApplied, true);
  assert.strictEqual(usaCafta.tariffPct, 0);
  assert.strictEqual(usaCafta.tariffUsd, 0);
  assert(usaCafta.dgaItbisUsd > 0, 'ITBIS 18% DGA must apply over US$200');
  assert.strictEqual(usaCafta.depositPct, 70);
  assert.strictEqual(usaCafta.depositRD + usaCafta.balanceRD, usaCafta.totalRD);

  // Caso C: Europa / Asia Marítimo LCL -> aplica arancel no-CAFTA (8%) + flete marítimo más económico en carga pesada
  const asiaSea = imp.calculateLandedCost({ fobUsd: 2000, qty: 1, weightLb: 400, origin: 'asia', shippingMode: 'sea', applyCafta: true });
  const asiaAir = imp.calculateLandedCost({ fobUsd: 2000, qty: 1, weightLb: 400, origin: 'asia', shippingMode: 'air', applyCafta: true });
  assert.strictEqual(asiaSea.caftaApplied, false);
  assert.strictEqual(asiaSea.tariffPct, 8);
  assert(asiaSea.freightUsd < asiaAir.freightUsd, 'Sea freight must be cheaper than air for 400 lb heavy part');

  // Badges híbridos
  assert.strictEqual(imp.getFulfillmentMeta({ fulfillment: 'local_rd', stock: 3 }).isImport, false);
  assert.strictEqual(imp.getFulfillmentMeta({ fulfillment: 'import_air', originCountry: 'EE. UU.' }).isImport, true);
  assert.strictEqual(imp.getFulfillmentMeta({ fulfillment: 'import_sea', originCountry: 'Asia' }).mode, 'sea');

  console.log('✅ ALL BACKEND & IMPORT ENGINE TESTS PASSED (CORS + Payments + XMLDSig e-CF + Webhooks + Landed Cost DGA)!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
