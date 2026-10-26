// Regra da troca de uniforme, usada pela tela (Vencimentos) e pela Edge
// Function que envia a convocação por e-mail. Sem imports de Deno/npm de
// propósito: roda nos dois lados e é testada pelo vitest.
//
// Troca: X meses depois da ASSINATURA da última ficha de uniforme do
// colaborador. O prazo é o do POSTO dessa ficha (cadastro de Postos), conforme
// o contrato: "obrigatória" (o contrato exige a troca no prazo, ex.: 6 meses) ou
// "flexível" (troca conforme o uso, ex.: 12 meses). Posto ainda não analisado
// usa MESES_TROCA_PADRAO (e-mail do Dionei, 22/10/2026). Datas no fuso de Brasília.
//
// Posto, cargo e matrícula vêm da SENIOR (colaboradores_senior, atualizada todo
// dia), achando o colaborador pelo CPF ou pela matrícula da ficha: assim o prazo
// segue o contrato onde ele trabalha HOJE. Desligado na Senior sai da convocação.
// Quem não é achado na Senior fica com os dados da própria ficha.

export const MESES_TROCA_PADRAO = 12;
export const DIAS_AVISO = 30;
const FUSO = 'America/Sao_Paulo';

export type SituacaoTroca = 'vencido' | 'proximo' | 'em_dia';

export interface ItemCatalogo { id: string; nome: string; tipo: 'epi' | 'uniforme' }

export interface ItemFichaBase { epiId?: string | null; descricao?: string | null; recebido?: boolean | null }

export interface FichaBase {
  id: string;
  numero?: number | null;
  nome: string;
  cpf?: string | null;
  matricula?: string | null;
  funcao?: string | null;
  posto?: string | null;
  uf: string;
  status: string; // 'assinada' conta
  /** timestamp ISO da assinatura do colaborador */
  assinadoEm?: string | null;
  /** yyyy-MM-dd */
  dataEntrega?: string | null;
  /** Telefone digitado na ficha. */
  telefone?: string | null;
  itens: ItemFichaBase[];
}

/**
 * Prazo de troca do posto. `definida` = falso para posto sem análise (usa o padrão).
 * `postoCadastro` = nome do posto no cadastro de Postos (vazio = posto fora do cadastro).
 */
export interface RegraTroca { meses: number; obrigatoria: boolean; definida: boolean; postoCadastro?: string }

export const REGRA_PADRAO: RegraTroca = { meses: MESES_TROCA_PADRAO, obrigatoria: false, definida: false };

/** Posto do cadastro com a regra de troca (colunas de public.postos). */
export interface PostoTroca {
  nome: string;
  apelidos?: string[] | null;
  troca_uniforme_meses?: number | null;
  troca_uniforme_obrigatoria?: boolean | null;
}

/**
 * Regra do posto: o primeiro nome que bate com o cadastro (nome ou apelido). Aceita o
 * nome com sobra no fim, como vem da Senior ("IDP NORTE - AGENTE DE PORTARIA" = "IDP NORTE"),
 * ficando com o posto de nome mais longo. Sem cadastro ou sem prazo, o padrão.
 */
export function criarRegraTroca(postos: PostoTroca[]): (...nomes: (string | null | undefined)[]) => RegraTroca {
  const porNome = new Map<string, RegraTroca>();
  for (const p of postos) {
    const regra: RegraTroca = p.troca_uniforme_meses
      ? { meses: p.troca_uniforme_meses, obrigatoria: !!p.troca_uniforme_obrigatoria, definida: true, postoCadastro: p.nome }
      : { ...REGRA_PADRAO, postoCadastro: p.nome };
    for (const n of [p.nome, ...(p.apelidos ?? [])]) if (chaveTexto(n) && !porNome.has(chaveTexto(n))) porNome.set(chaveTexto(n), regra);
  }
  const chaves = [...porNome.keys()].filter(k => k.length >= 4).sort((a, b) => b.length - a.length);
  const achar = (nome: string) => {
    const k = chaveTexto(nome);
    if (!k) return undefined;
    return porNome.get(k) ?? porNome.get(chaves.find(c => k.startsWith(c)) ?? '');
  };
  return (...nomes) => {
    for (const n of nomes) { const r = n ? achar(n) : undefined; if (r) return r; }
    return REGRA_PADRAO;
  };
}

/** Colaborador como gravado em colaboradores_senior (só o que a convocação usa). */
export interface ColaboradorSeniorBase {
  num_cad: number;
  cpf?: string | null;
  cargo?: string | null;
  posto_descricao?: string | null;
  nome_local?: string | null;
  uf?: string | null;
  telefone?: string | null;
  ativo: boolean;
}

/** "0003-0001-IDP NORTE - AGENTE" -> "IDP NORTE - AGENTE" (igual a nomePostoTrabalho de senior.ts). */
const semCodigoPosto = (d: string | null | undefined) => (d ?? '').replace(/^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*/, '').trim();

/** Acha o colaborador da ficha na Senior: pelo CPF; sem CPF, pela matrícula. Prefere o cadastro ativo. */
export function criarBuscaSenior(colaboradores: ColaboradorSeniorBase[]) {
  const porCpf = new Map<string, ColaboradorSeniorBase>();
  const porMat = new Map<string, ColaboradorSeniorBase>();
  const guardar = (m: Map<string, ColaboradorSeniorBase>, k: string, c: ColaboradorSeniorBase) => {
    const atual = m.get(k);
    if (!atual || (!atual.ativo && c.ativo)) m.set(k, c);
  };
  for (const c of colaboradores) {
    const cpf = (c.cpf || '').replace(/\D/g, '');
    if (cpf) guardar(porCpf, cpf.padStart(11, '0'), c);
    guardar(porMat, String(c.num_cad), c);
  }
  return (f: Pick<FichaBase, 'cpf' | 'matricula'>): ColaboradorSeniorBase | null => {
    const cpf = (f.cpf || '').replace(/\D/g, '');
    const mat = (f.matricula || '').replace(/\D/g, '');
    return (cpf.length >= 9 ? porCpf.get(cpf.padStart(11, '0')) : undefined) ?? (mat ? porMat.get(mat) : undefined) ?? null;
  };
}

export const regraTexto = (r: Pick<RegraTroca, 'meses' | 'obrigatoria' | 'definida'>) =>
  !r.definida ? `Sem análise · ${r.meses} meses` : `${r.obrigatoria ? 'Obrigatória' : 'Flexível'} · ${r.meses} meses`;

export interface ConvocacaoUniforme {
  chave: string;
  nome: string;
  cpf: string;
  matricula: string;
  funcao: string;
  posto: string;
  uf: string;
  /** Telefone do cadastro da Senior, como veio (vazio sem Senior). */
  telefone: string;
  /** Telefones digitados nas fichas do colaborador (de EPI ou uniforme), da mais nova para a mais antiga. */
  telefonesFicha: string[];
  fichaId: string;
  fichaNumero?: number;
  /** yyyy-MM-dd */
  dataAssinatura: string;
  /** Ficha assinada sem data de assinatura registrada: usou a data de entrega. */
  semDataAssinatura: boolean;
  /** yyyy-MM-dd */
  dataTroca: string;
  /** Prazo usado (do posto atual na Senior; sem Senior, do posto da ficha). */
  regra: RegraTroca;
  /** De onde vieram posto/cargo: Senior (hoje) ou a própria ficha. */
  origem: 'senior' | 'ficha';
  diasRestantes: number;
  situacao: SituacaoTroca;
  itens: string[];
}

/** Ignora maiúsculas, acentos, hífens e espaços. */
export function chaveTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Data (yyyy-MM-dd) em Brasília de um instante. */
export function dataBrasilia(instante: Date | string): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante;
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Soma meses a yyyy-MM-dd; 31/01 + 1 mês = 28 ou 29/02 (último dia do mês). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);
}

export function formatarData(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Tipo do item da ficha: pelo catálogo (epiId) ou, se digitado à mão, pela descrição. */
export function criarClassificador(catalogo: ItemCatalogo[]) {
  const porId = new Map(catalogo.map(c => [c.id, c.tipo]));
  const porNome = new Map(catalogo.map(c => [chaveTexto(c.nome), c.tipo]));
  return (item: ItemFichaBase): 'epi' | 'uniforme' | null =>
    (item.epiId && porId.get(item.epiId)) || porNome.get(chaveTexto(item.descricao || '')) || null;
}

/** Mesmo colaborador: pelo CPF; sem CPF, pelo nome. */
export function chaveColaborador(f: { cpf?: string | null; nome: string }): string {
  const cpf = (f.cpf || '').replace(/\D/g, '');
  return cpf.length >= 11 ? `cpf:${cpf}` : `nome:${chaveTexto(f.nome || '')}`;
}

export function calcularTrocasUniforme(
  fichas: FichaBase[], catalogo: ItemCatalogo[], hoje: Date = new Date(),
  regraDe: (...nomes: (string | null | undefined)[]) => RegraTroca = () => REGRA_PADRAO,
  seniorDe: (f: FichaBase) => ColaboradorSeniorBase | null = () => null,
): ConvocacaoUniforme[] {
  const tipoDe = criarClassificador(catalogo);
  const hojeIso = dataBrasilia(hoje);
  const ultima = new Map<string, { f: FichaBase; data: string; semData: boolean; itens: string[] }>();
  const telefones = new Map<string, { data: string; tel: string }[]>();

  for (const f of fichas) {
    const tel = (f.telefone || '').trim();
    if (tel) {
      const k = chaveColaborador(f);
      const l = telefones.get(k) ?? [];
      l.push({ data: f.assinadoEm || f.dataEntrega || '', tel });
      telefones.set(k, l);
    }
    if (f.status !== 'assinada') continue;
    // Itens entregues = marcados como recebidos; ficha antiga sem nenhuma marca conta todos.
    const entregues = f.itens.some(i => i.recebido) ? f.itens.filter(i => i.recebido) : f.itens;
    const uniformes = entregues.filter(i => tipoDe(i) === 'uniforme');
    if (uniformes.length === 0) continue;
    const data = f.assinadoEm ? dataBrasilia(f.assinadoEm) : (f.dataEntrega || '').slice(0, 10);
    if (!data) continue;
    const k = chaveColaborador(f);
    const atual = ultima.get(k);
    if (!atual || data > atual.data) {
      ultima.set(k, { f, data, semData: !f.assinadoEm, itens: uniformes.map(i => i.descricao || '') });
    }
  }

  const lista: ConvocacaoUniforme[] = [];
  for (const [chave, { f, data, semData, itens }] of ultima) {
    const sr = seniorDe(f);
    if (sr && !sr.ativo) continue; // desligado na Senior: não convoca
    const postoSenior = sr ? (semCodigoPosto(sr.posto_descricao) || (sr.nome_local ?? '').trim()) : '';
    const regra = sr ? regraDe(postoSenior, sr.nome_local, f.posto) : regraDe(f.posto);
    const dataTroca = somarMeses(data, regra.meses);
    const dias = diasEntre(hojeIso, dataTroca);
    lista.push({
      chave,
      nome: f.nome,
      cpf: f.cpf || '',
      matricula: sr ? String(sr.num_cad) : f.matricula || '',
      funcao: sr?.cargo || f.funcao || '',
      posto: regra.postoCadastro || postoSenior || f.posto || '',
      uf: sr?.uf || f.uf,
      telefone: sr?.telefone || '',
      telefonesFicha: [...new Set((telefones.get(chave) ?? []).sort((a, b) => b.data.localeCompare(a.data)).map(t => t.tel))],
      fichaId: f.id,
      fichaNumero: f.numero ?? undefined,
      dataAssinatura: data,
      semDataAssinatura: semData,
      dataTroca,
      regra,
      origem: sr ? 'senior' : 'ficha',
      diasRestantes: dias,
      situacao: dias <= 0 ? 'vencido' : dias <= DIAS_AVISO ? 'proximo' : 'em_dia',
      itens,
    });
  }
  return lista.sort((a, b) => a.diasRestantes - b.diasRestantes || a.nome.localeCompare(b.nome));
}

export const situacaoTexto = (t: Pick<ConvocacaoUniforme, 'diasRestantes'>) =>
  t.diasRestantes <= 0 ? `Vencido há ${Math.abs(t.diasRestantes)} dias` : `Vence em ${t.diasRestantes} dias`;
