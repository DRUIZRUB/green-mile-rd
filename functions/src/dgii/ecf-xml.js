'use strict';

const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');

/**
 * Generador y Firmador Oficial de XML e-CF v1.0 (DGII República Dominicana · Ley 32-23)
 * Soporta:
 *  - 31 (E31 Crédito Fiscal Electrónico)
 *  - 32 (E32 Factura de Consumo Electrónica)
 *  - 34 (E34 Nota de Crédito Electrónica)
 *  - 41 (E41 Comprobante de Compras Electrónico — Propietario Persona Física)
 *  - 44 (E44 Regímenes Especiales Electrónico — Exento ITBIS 0%)
 *  - 45 (E45 Comprobante Gubernamental Electrónico — Estado RD + Retención 5% ISR)
 */

function xmlEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanRnc(str) {
  return String(str || '').replace(/\D/g, '');
}

function fmtDgiiDate(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function fmtDgiiDateTime(dateObj) {
  const d = dateObj || new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
}

function fmtDec(n) {
  return (Number(n) || 0).toFixed(2);
}

function mapPaymentFormCode(paymentMethod) {
  // Catálogo DGII Tabla FormaPago: 1=Efectivo, 2=Cheque/Transferencia/Depósito, 3=Tarjeta Débito/Crédito, 4=Venta a Crédito
  if (paymentMethod === 'card') return '3';
  if (paymentMethod === 'transfer') return '2';
  if (paymentMethod === 'gov_po' || paymentMethod === 'credit') return '4';
  return '2';
}

/**
 * Construye el XML e-CF v1.0 conforme al esquema técnico oficial de la DGII.
 */
function buildEcfXml({ booking, encf, expiresDate, emisor, creditNoteRef = null }) {
  const typeCode = String(encf || 'E31').slice(1, 3); // '31', '32', '34', '41', '44', '45'
  const isExempt = typeCode === '44';
  const isGov = typeCode === '45';
  const isCreditNote = typeCode === '34';
  const isPurchase = typeCode === '41';

  const netSubtotal = Number(booking.netSubtotal || 0);
  const itbis = isExempt ? 0 : Number(booking.itbis || Math.round(netSubtotal * 0.18));
  const total = Number(booking.total || (netSubtotal + itbis));

  const issueDateStr = fmtDgiiDate(booking.encfIssuedAt || new Date());
  const expiryDateStr = fmtDgiiDate(expiresDate || '2027-12-31');
  const signTimeStr = fmtDgiiDateTime(new Date());

  const buyerRnc = cleanRnc(isPurchase ? booking.ownerRnc : booking.renterRnc);
  const buyerName = (isPurchase ? booking.owner : booking.renter) || 'CLIENTE GENERAL';
  const formaPago = mapPaymentFormCode(booking.paymentMethod);
  const tipoPago = (booking.paymentMethod === 'gov_po' || booking.paymentMethod === 'credit') ? '2' : '1'; // 1=Contado, 2=Crédito

  const isrRet = isGov
    ? Number(booking.govIsrRetention || Math.round(netSubtotal * 0.05))
    : (isPurchase ? Number(booking.ownerIsrRetained || Math.round(netSubtotal * 0.10)) : 0);
  const itbisRet = isGov
    ? Number(booking.govItbisRetention || 0)
    : (isPurchase ? itbis : 0);

  const indFacturacion = isExempt ? '4' : '1'; // 1=Gravado ITBIS 18%, 4=Exento

  const fechaLimitePago = (tipoPago === '2')
    ? fmtDgiiDate(new Date(Date.now() + ((booking.govData && booking.govData.paymentTermsDays) || 45) * 86400000))
    : '';

  const itemDesc = `Alquiler ${booking.title || 'Maquinaria Pesada'} (${booking.qty || 1} ${booking.unitLabel || 'días'} en ${booking.city || 'RD'})`
    .slice(0, 80);

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${xmlEsc(typeCode)}</TipoeCF>
      <eNCF>${xmlEsc(encf)}</eNCF>
      ${typeCode !== '32' && !isCreditNote ? `<FechaVencimientoSecuencia>${xmlEsc(expiryDateStr)}</FechaVencimientoSecuencia>` : ''}
      ${isCreditNote ? '<IndicadorNotaCredito>0</IndicadorNotaCredito>' : ''}
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>${tipoPago}</TipoPago>
      ${fechaLimitePago ? `<FechaLimitePago>${xmlEsc(fechaLimitePago)}</FechaLimitePago>` : ''}
      <TablaFormasPago>
        <FormaDePago>
          <FormaPago>${formaPago}</FormaPago>
          <MontoPago>${fmtDec(total)}</MontoPago>
        </FormaDePago>
      </TablaFormasPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${xmlEsc(cleanRnc(emisor.rnc))}</RNCEmisor>
      <RazonSocialEmisor>${xmlEsc(String(emisor.razonSocial || '').slice(0, 150))}</RazonSocialEmisor>
      <NombreComercial>${xmlEsc(String(emisor.nombreComercial || emisor.razonSocial || '').slice(0, 150))}</NombreComercial>
      <DireccionEmisor>${xmlEsc(String(emisor.direccion || 'Santo Domingo, RD').slice(0, 100))}</DireccionEmisor>
      <Municipio>${xmlEsc(emisor.municipio || '010101')}</Municipio>
      <Provincia>${xmlEsc(emisor.provincia || '010000')}</Provincia>
      <CorreoEmisor>${xmlEsc(emisor.correo || 'facturacion@greenmilerd.com')}</CorreoEmisor>
      <FechaEmision>${xmlEsc(issueDateStr)}</FechaEmision>
    </Emisor>
    <Comprador>
      ${buyerRnc ? `<RNCComprador>${xmlEsc(buyerRnc)}</RNCComprador>` : ''}
      <RazonSocialComprador>${xmlEsc(String(buyerName).slice(0, 150))}</RazonSocialComprador>
      ${booking.govData && booking.govData.entityEmail ? `<CorreoComprador>${xmlEsc(booking.govData.entityEmail)}</CorreoComprador>` : ''}
      ${booking.address ? `<DireccionComprador>${xmlEsc(String(booking.address).slice(0, 100))}</DireccionComprador>` : ''}
      ${booking.govData && booking.govData.poNumber ? `<NumeroOrdenCompra>${xmlEsc(String(booking.govData.poNumber).slice(0, 50))}</NumeroOrdenCompra>` : ''}
    </Comprador>
    <Totales>
      ${isExempt ? `<MontoExento>${fmtDec(netSubtotal)}</MontoExento>` : `<MontoGravadoTotal>${fmtDec(netSubtotal)}</MontoGravadoTotal>
      <MontoGravadoI1>${fmtDec(netSubtotal)}</MontoGravadoI1>
      <ITBIS1>18</ITBIS1>
      <TotalITBIS>${fmtDec(itbis)}</TotalITBIS>
      <TotalITBIS1>${fmtDec(itbis)}</TotalITBIS1>`}
      <MontoTotal>${fmtDec(total)}</MontoTotal>
      ${itbisRet > 0 ? `<TotalITBISRetencion>${fmtDec(itbisRet)}</TotalITBISRetencion>` : ''}
      ${isrRet > 0 ? `<TotalISRRetencion>${fmtDec(isrRet)}</TotalISRRetencion>` : ''}
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <IndicadorFacturacion>${indFacturacion}</IndicadorFacturacion>
      ${(isrRet > 0 || itbisRet > 0) ? `<Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        ${itbisRet > 0 ? `<MontoITBISRetenido>${fmtDec(itbisRet)}</MontoITBISRetenido>` : ''}
        ${isrRet > 0 ? `<MontoISRRetenido>${fmtDec(isrRet)}</MontoISRRetenido>` : ''}
      </Retencion>` : ''}
      <NombreItem>${xmlEsc(itemDesc)}</NombreItem>
      <IndicadorBienoServicio>2</IndicadorBienoServicio>
      <CantidadItem>${fmtDec(booking.qty || 1)}</CantidadItem>
      <UnidadMedida>43</UnidadMedida>
      <PrecioUnitarioItem>${fmtDec(netSubtotal / Math.max(1, Number(booking.qty) || 1))}</PrecioUnitarioItem>
      <MontoItem>${fmtDec(netSubtotal)}</MontoItem>
    </Item>
  </DetallesItems>
  ${isCreditNote && creditNoteRef ? `<InformacionReferencia>
    <NCFModificado>${xmlEsc(creditNoteRef.ncfModificado)}</NCFModificado>
    <FechaNCFModificado>${xmlEsc(fmtDgiiDate(creditNoteRef.fechaModificado))}</FechaNCFModificado>
    <CodigoModificacion>${xmlEsc(creditNoteRef.codigoModificacion || '1')}</CodigoModificacion>
  </InformacionReferencia>` : ''}
  <FechaHoraFirma>${xmlEsc(signTimeStr)}</FechaHoraFirma>
</ECF>`;

  return {
    xml: xml.replace(/^\s*[\r\n]/gm, ''),
    issueDateStr,
    signTimeStr,
    total,
    itbis,
    netSubtotal
  };
}

/**
 * Extrae clave privada PEM y certificado X.509 PEM desde un archivo PKCS#12 (.p12 / .pfx) en Base64.
 */
function extractPemFromP12(p12Base64, password) {
  const derBytes = forge.util.decode64(p12Base64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password || ''));

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]
    || [];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  if (!keyBags.length || !keyBags[0].key) {
    throw new Error('No se encontró clave privada dentro del certificado .p12 de DGII.');
  }
  if (!certBags.length || !certBags[0].cert) {
    throw new Error('No se encontró certificado X.509 dentro del archivo .p12 de DGII.');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBags[0].key);
  const certPem = forge.pki.certificateToPem(certBags[0].cert);
  const certBodyBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  return { privateKeyPem, certPem, certBodyBase64 };
}

/**
 * Firma un documento XML (Semilla o e-CF) con XMLDSig Enveloped RSA-SHA256
 * conforme al estándar oficial de la DGII y extrae el Código de Seguridad (6 primeros caracteres de SignatureValue).
 */
function signXmlWithP12(rawXml, p12Base64, password) {
  const { privateKeyPem, certPem } = extractPemFromP12(p12Base64, password);

  // Validar que el XML es bien formado antes de firmar
  const doc = new DOMParser().parseFromString(rawXml, 'text/xml');
  const rootName = doc.documentElement && doc.documentElement.nodeName;
  if (!rootName) throw new Error('XML inválido: no se encontró elemento raíz.');

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
  });

  sig.addReference({
    xpath: '/*',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    isEmptyUri: true
  });

  sig.computeSignature(rawXml, {
    location: { reference: `/*[local-name()='${rootName}']`, action: 'append' }
  });

  const signedXml = sig.getSignedXml();
  const sigValMatch = signedXml.match(/<SignatureValue[^>]*>([^<]+)<\/SignatureValue>/i);
  const signatureValue = sigValMatch ? sigValMatch[1].replace(/\s+/g, '') : '';
  const securityCode = signatureValue.slice(0, 6);

  return { signedXml, signatureValue, securityCode };
}

/**
 * Construye la URL oficial de verificación QR (Timbre DGII) codificando correctamente caracteres especiales (+ -> %2B).
 */
function buildDgiiQrUrl({ dgiiEnv = 'testecf', rncEmisor, rncComprador, encf, issueDateStr, total, signTimeStr, securityCode }) {
  const isConsumerSmall = String(encf || '').startsWith('E32') && Number(total) < 250000;
  const host = isConsumerSmall ? 'https://fc.dgii.gov.do' : 'https://ecf.dgii.gov.do';
  const path = isConsumerSmall ? 'ConsultaTimbreFC' : 'ConsultaTimbre';

  const params = new URLSearchParams();
  params.set('RncEmisor', cleanRnc(rncEmisor));
  if (!isConsumerSmall && cleanRnc(rncComprador)) {
    params.set('RncComprador', cleanRnc(rncComprador));
  }
  params.set('ENCF', encf);
  if (!isConsumerSmall) params.set('FechaEmision', issueDateStr);
  params.set('MontoTotal', fmtDec(total));
  if (!isConsumerSmall) params.set('FechaFirma', signTimeStr);
  params.set('CodigoSeguridad', securityCode);

  return `${host}/${dgiiEnv}/${path}?${params.toString()}`;
}

module.exports = {
  buildEcfXml,
  extractPemFromP12,
  signXmlWithP12,
  buildDgiiQrUrl,
  fmtDgiiDate,
  fmtDgiiDateTime
};
