// Robô da SEFAZ: puxa as NF-e emitidas contra cada CNPJ do grupo (NF-e Distribuição DFe)
// e grava no banco pelas funções sefaz_* (migration 20261108120000_notas_sefaz.sql).
// O banco aplica o preço da nota mais recente no material ligado ao código do fornecedor.
//
// Roda de hora em hora pelo cron (deploy/producao/sefaz/configurar-sefaz.sh), num container:
//   /config/empresas.json  [{ "cnpj": "...", "nome": "...", "uf": "DF", "pfx": "arquivo.pfx", "senha": "..." }]
//   /config/<arquivo>.pfx  certificado A1 de cada empresa (a filial pode usar o pfx da matriz)
//   /config/icp-brasil.pem cadeia ICP-Brasil (o configurar-sefaz.sh baixa do ITI): é com ela
//                          que o robô confere que está falando com a SEFAZ de verdade
//   env SUPABASE_URL, SERVICE_KEY
//
// Fluxo da SEFAZ: a nota chega primeiro como resumo (resNFe, sem itens). O robô registra
// a Ciência da Operação (evento 210210) e, nas próximas consultas, a SEFAZ entrega a nota
// completa (procNFe), com os itens e preços. Sem nada novo, a SEFAZ exige 1 hora de espera
// (senão responde 656 - consumo indevido), por isso a próxima consulta fica guardada no banco.
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { eventoCiencia, lerCertificado } from './assinatura.mjs';
import { lerEvento, lerNotaCompleta, lerResumo, lerRetornoDist, lerRetornoEvento } from './nota.mjs';

const CONFIG = process.env.CONFIG_DIR ?? '/config';
const SUPABASE_URL = (process.env.SUPABASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SERVICE_KEY;
const URL_DIST = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_EVENTO = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const UF_IBGE = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27,
  SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
const UMA_HORA = 60 * 60 * 1000;
const MAX_LOTES = 20; // por empresa e por rodada (50 documentos cada)

const log = (...a) => console.log(new Date().toISOString(), ...a);
const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// ---------- banco (PostgREST com a chave service_role) ----------
async function rest(caminho, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status} em ${caminho}: ${corpo.slice(0, 300)}`);
  return corpo ? JSON.parse(corpo) : null;
}
const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

function agente(cert) {
  const arquivo = `${CONFIG}/icp-brasil.pem`;
  if (!fs.existsSync(arquivo)) throw new Error('Falta icp-brasil.pem (rode de novo o configurar-sefaz.sh)');
  return new https.Agent({ key: cert.keyPem, cert: cert.certPem, ca: [...tls.rootCertificates, fs.readFileSync(arquivo, 'utf8')] });
}

function soap(url, acao, corpo, agent) {
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + `<soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', agent, timeout: 60_000,
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${acao}"`, 'Content-Length': Buffer.byteLength(envelope) },
    }, res => {
      let dados = '';
      res.setEncoding('utf8');
      res.on('data', d => { dados += d; });
      res.on('end', () => res.statusCode >= 500 && !dados.includes('<') ? reject(new Error(`SEFAZ HTTP ${res.statusCode}`)) : resolve(dados));
    });
    req.on('timeout', () => req.destroy(new Error('SEFAZ não respondeu em 60 s')));
    req.on('error', reject);
    req.end(envelope);
  });
}

// ---------- Distribuição DFe ----------
async function consultarNSU(emp, ultNSU, agent) {
  const corpo = '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>'
    + '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
    + `<tpAmb>1</tpAmb><cUFAutor>${UF_IBGE[emp.uf]}</cUFAutor><CNPJ>${emp.cnpj}</CNPJ>`
    + `<distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>`;
  return lerRetornoDist(await soap(URL_DIST, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse', corpo, agent));
}

async function processarDocumento(emp, doc) {
  const xml = zlib.gunzipSync(Buffer.from(doc.base64, 'base64')).toString('utf8');
  if (doc.schema.startsWith('resNFe')) {
    const r = lerResumo(xml, emp.cnpj);
    await rpc('sefaz_gravar_nota', { _nota: r });
    if (r.cancelada) { await rpc('sefaz_cancelar_nota', { _chave: r.chave }); return 'cancelada'; }
    return 'resumo';
  }
  if (doc.schema.startsWith('procNFe')) {
    const n = lerNotaCompleta(xml);
    // A SEFAZ também entrega notas em que a empresa é só transportadora ou autorizada.
    if (n.destinatario_cnpj !== emp.cnpj) return 'outra';
    await rpc('sefaz_gravar_nota', { _nota: { ...n, cnpj_destinatario: emp.cnpj } });
    return 'completa';
  }
  if (doc.schema.startsWith('resEvento') || doc.schema.startsWith('procEventoNFe')) {
    const e = lerEvento(xml);
    if (e.tpEvento === '110111' && e.chave) { await rpc('sefaz_cancelar_nota', { _chave: e.chave }); return 'cancelada'; }
    return 'evento';
  }
  return 'outro';
}

// ---------- Ciência da Operação (210210) ----------
async function darCiencia(emp, cert, agent) {
  const seisHoras = new Date(Date.now() - 6 * UMA_HORA).toISOString();
  const pendentes = await rest(`notas_sefaz?select=chave&cnpj_destinatario=eq.${emp.cnpj}&situacao=eq.resumo&ciencia_em=is.null`
    + `&or=(ciencia_erro.is.null,updated_at.lt.${seisHoras})&order=emissao.desc&limit=100`);
  let feitas = 0;
  for (let i = 0; i < pendentes.length; i += 20) {
    const lote = pendentes.slice(i, i + 20).map(p => p.chave);
    const corpo = '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">'
      + `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote>`
      + lote.map(ch => eventoCiencia(emp, ch, cert)).join('') + '</envEvento></nfeDadosMsg>';
    const ret = lerRetornoEvento(await soap(URL_EVENTO, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento', corpo, agent));
    for (const ch of lote) {
      const r = ret.porChave[ch];
      const ok = r && ['135', '136', '573'].includes(r.cStat);
      await rpc('sefaz_marcar_ciencia', { _chave: ch, _erro: ok ? null : (r ? `${r.cStat} - ${r.xMotivo}` : `${ret.lote.cStat} - ${ret.lote.xMotivo}`) });
      if (ok) feitas++;
    }
  }
  return { pendentes: pendentes.length, feitas };
}

// ---------- uma empresa ----------
async function rodarEmpresa(emp) {
  const [estado] = await rest(`sefaz_empresas?select=ult_nsu,proxima_consulta_em&cnpj=eq.${emp.cnpj}`);
  if (estado?.proxima_consulta_em && new Date(estado.proxima_consulta_em) > new Date()) {
    log(emp.cnpj, 'aguardando a SEFAZ até', estado.proxima_consulta_em);
    return;
  }
  let ultNSU = estado?.ult_nsu ?? '000000000000000';
  let cert, agent;
  try {
    cert = lerCertificado(fs.readFileSync(`${CONFIG}/${emp.pfx}`), emp.senha, emp.pfx);
    agent = agente(cert);
  } catch (e) {
    await rpc('sefaz_registrar_consulta', { _cnpj: emp.cnpj, _nome: emp.nome, _uf: emp.uf, _ult_nsu: null, _max_nsu: null,
      _proxima: null, _status: 'erro', _erro: e.message });
    throw e;
  }
  const contagem = {};
  let ret = null;
  let proxima = null;
  let erro = null;
  try {
    for (let lote = 0; lote < MAX_LOTES; lote++) {
      ret = await consultarNSU(emp, ultNSU, agent);
      if (ret.cStat === '138') {
        for (const doc of ret.docs) {
          const tipo = await processarDocumento(emp, doc);
          contagem[tipo] = (contagem[tipo] ?? 0) + 1;
        }
        ultNSU = ret.ultNSU;
        if (ret.ultNSU === ret.maxNSU) { proxima = new Date(Date.now() + UMA_HORA); break; }
        continue;
      }
      // 137 = nada novo; 656 = consultou cedo demais. Os dois pedem 1 hora de espera.
      if (ret.cStat === '137' && ret.ultNSU) ultNSU = ret.ultNSU;
      if (ret.cStat !== '137') erro = `${ret.cStat} - ${ret.xMotivo}`;
      proxima = new Date(Date.now() + UMA_HORA);
      break;
    }
  } catch (e) {
    erro = e.message;
    proxima = new Date(Date.now() + 15 * 60 * 1000);
  }
  await rpc('sefaz_registrar_consulta', { _cnpj: emp.cnpj, _nome: emp.nome, _uf: emp.uf, _ult_nsu: ultNSU, _max_nsu: ret?.maxNSU ?? null,
    _proxima: proxima?.toISOString() ?? null, _status: ret ? `${ret.cStat} - ${ret.xMotivo}` : 'erro', _erro: erro });

  let ciencia;
  try { ciencia = await darCiencia(emp, cert, agent); } catch (e) { ciencia = { erro: e.message }; }
  log(emp.cnpj, emp.nome ?? '', `NSU ${ultNSU}/${ret?.maxNSU ?? '?'}`, JSON.stringify(contagem), 'ciência:', JSON.stringify(ciencia), erro ? `ERRO: ${erro}` : '');
}

// ---------- principal ----------
if (!SERVICE_KEY) { console.error('Falta SERVICE_KEY (rode o configurar-sefaz.sh).'); process.exit(1); }
const empresas = JSON.parse(fs.readFileSync(`${CONFIG}/empresas.json`, 'utf8'))
  .map(e => ({ ...e, cnpj: soDigitos(e.cnpj), uf: String(e.uf ?? 'DF').toUpperCase() }))
  .filter(e => e.cnpj.length === 14 && e.pfx);
if (!empresas.length) { log('Nenhuma empresa em empresas.json.'); process.exit(0); }
let falhas = 0;
for (const emp of empresas) {
  if (!UF_IBGE[emp.uf]) { log(emp.cnpj, `UF inválida: ${emp.uf}`); falhas++; continue; }
  try { await rodarEmpresa(emp); } catch (e) { falhas++; log(emp.cnpj, 'ERRO:', e.message); }
}
process.exit(falhas ? 1 : 0);
