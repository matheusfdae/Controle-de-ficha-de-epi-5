// Teste de contrato com o web service da Senior, rodando da máquina local
// (precisa estar na rede interna). Só LÊ dados — usa ConsultarColaborador.
//
// Uso (PowerShell), sem colocar a senha em arquivo nem no histórico:
//   $env:SENIOR_WS_URL = "http://SERVIDOR:PORTA/g5-senior-services"
//   $env:SENIOR_WS_USER = "usuario_integracao"
//   $env:SENIOR_WS_PASSWORD = Read-Host -MaskInput "Senha Senior"
//   node scripts/senior-teste.ts 1 1234          # empresa cadastro [tipcol]
//   node scripts/senior-teste.ts 1 1234 1 --xml  # mostra o XML bruto também
import {
  buildEnvelope, seniorEndpoint, parseConsultarColaborador, type SeniorConfig,
} from '../supabase/functions/_shared/senior.ts';

const [numEmp, numCad, tipCol = '1'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const mostrarXml = process.argv.includes('--xml');
const { SENIOR_WS_URL, SENIOR_WS_USER, SENIOR_WS_PASSWORD, SENIOR_WS_MODULE } = process.env;

if (!numEmp || !numCad || !SENIOR_WS_URL || !SENIOR_WS_USER || !SENIOR_WS_PASSWORD) {
  console.error('Defina SENIOR_WS_URL, SENIOR_WS_USER, SENIOR_WS_PASSWORD e passe: <empresa> <cadastro> [tipcol]');
  process.exit(1);
}

const cfg: SeniorConfig = {
  baseUrl: SENIOR_WS_URL, user: SENIOR_WS_USER, password: SENIOR_WS_PASSWORD,
  module: SENIOR_WS_MODULE || 'rubi',
};
const url = seniorEndpoint(cfg, 'com.senior.g5.rh.hr.consultarColaborador');
console.log(`POST ${url}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
  body: buildEnvelope('ConsultarColaborador', cfg, { NumEmp: numEmp, TipCol: tipCol, NumCad: numCad }),
  signal: AbortSignal.timeout(20000),
}).catch((e: Error) => {
  console.error(`Sem conexão com a Senior: ${e.message}${e.cause ? ` (${(e.cause as Error).message})` : ''}`);
  process.exit(3);
});
const xml = await res.text();
console.log(`HTTP ${res.status}`);
if (mostrarXml) console.log(xml);

try {
  const lista = parseConsultarColaborador(xml);
  if (!lista.length) console.log('Nenhum colaborador retornado para essa matrícula.');
  for (const c of lista) console.table(c);
} catch (e) {
  console.error((e as Error).message);
  if (!mostrarXml) console.error('Rode de novo com --xml para ver a resposta completa.');
  process.exit(2);
}
