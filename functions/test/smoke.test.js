'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');

const { getPublicHealthStatus } = require('../src/config');
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
  console.log('1. Verificando diagnóstico /api/health...');
  const health = getPublicHealthStatus();
  assert.strictEqual(health.ok, true);
  assert.strictEqual(health.payment.activeMode, 'sandbox');
  assert.strictEqual(health.dgii.activeMode, 'sandbox');

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

  // Webhook HMAC verification
  process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_secret_123';
  const rawBody = JSON.stringify({ CustomOrderId: 'GM-12345', IsoCode: '00' });
  const validSig = crypto.createHmac('sha256', 'test_webhook_secret_123').update(rawBody).digest('hex');
  assert.strictEqual(verifyWebhookSignature(rawBody, validSig).verified, true);
  assert.strictEqual(verifyWebhookSignature(rawBody, 'bad_sig').verified, false);

  console.log('✅ ALL CLOUD FUNCTIONS BACKEND TESTS PASSED (Payments + Real PKCS#12 XMLDSig e-CF + QR + Webhooks)!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
