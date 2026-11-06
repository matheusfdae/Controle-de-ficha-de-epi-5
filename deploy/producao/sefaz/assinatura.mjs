// Certificado A1 e assinatura do evento de Ciência da Operação (210210) para a SEFAZ.
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

const UMA_HORA = 60 * 60 * 1000;

/** Chave e certificado (PEM) do A1 .pfx. `arquivo` só aparece nas mensagens de erro. */
export function lerCertificado(pfx, senha, arquivo = 'certificado') {
  const der = pfx.toString('binary');
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), senha);
  const chave = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0]
    ?? (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!chave?.key || !certs.length) throw new Error(`${arquivo}: não achei a chave e o certificado (senha certa?)`);
  // O certificado da empresa é o que casa com a chave (o pfx pode trazer a cadeia junto).
  const pub = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(chave.key.n, chave.key.e));
  const doTitular = certs.find(c => forge.pki.publicKeyToPem(c.cert.publicKey) === pub) ?? certs[0];
  const validoAte = doTitular.cert.validity.notAfter;
  if (validoAte < new Date()) throw new Error(`${arquivo}: certificado vencido em ${validoAte.toISOString().slice(0, 10)}`);
  return { keyPem: forge.pki.privateKeyToPem(chave.key), certPem: forge.pki.certificateToPem(doTitular.cert), validoAte };
}


export const horaBrasilia = (d = new Date()) => new Date(d.getTime() - 3 * UMA_HORA).toISOString().slice(0, 19) + '-03:00';

/** <evento> de Ciência da Operação assinado (XMLDSig, RSA-SHA1, C14N), como a SEFAZ pede. */
export function eventoCiencia(emp, chave, cert) {
  const xml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="ID210210${chave}01">`
    + `<cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>${emp.cnpj}</CNPJ><chNFe>${chave}</chNFe>`
    + `<dhEvento>${horaBrasilia()}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>`
    + '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>';
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='infEvento']", action: 'after' } });
  return sig.getSignedXml();
}
