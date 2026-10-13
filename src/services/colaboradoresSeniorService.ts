import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import type { EPIFicha } from '@/types/epi';
import { chaveSolta } from '@/lib/geoPlanilha';

export type ColaboradorLista = Tables<'colaboradores_senior'>;

const PAGINA = 1000;

/** Todos os colaboradores gravados (o Supabase devolve no máximo 1000 por vez). */
export async function listarColaboradoresSenior(): Promise<ColaboradorLista[]> {
  const todos: ColaboradorLista[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from('colaboradores_senior').select('*')
      .order('nome').range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todos;
  }
}

type PedidoEtapa =
  | { etapa: 'colaboradores'; empresa: number; periodo: number }
  | { etapa: 'postos'; empresa: number; matriculas: number[] }
  | { etapa: 'descricoes'; postos: string[]; escalas: number[] };

/** Mesmas partes do agendador da VM: cada chamada cabe no limite de 60 s. */
const EMPRESAS = [1, 3];
const PERIODOS = 3;
const MATRICULAS_POR_LOTE = 400;
const POSTOS_POR_LOTE = 300;
const emLotes = <T,>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

/** Pede uma etapa à Senior (Edge Function na produção; o próprio PC no localhost). */
async function buscarEtapa<T>(pedido: PedidoEtapa): Promise<T> {
  let resp: (T & { error?: string }) | null;
  if (import.meta.env.DEV) {
    const res = await fetch('/__senior/listar-colaboradores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido),
    });
    resp = await res.json().catch(() => null);
    if (!res.ok) throw new Error(resp?.error || `Falha ao consultar a Senior (HTTP ${res.status})`);
  } else {
    const { data, error } = await supabase.functions.invoke('senior-listar-colaboradores', { body: pedido });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const corpo: { error?: string } | null = await ctx?.json?.().catch(() => null) ?? null;
      throw new Error(corpo?.error || error.message || 'Falha ao consultar a Senior');
    }
    resp = data;
  }
  if (!resp || resp.error) throw new Error(resp?.error || 'Resposta vazia da Senior');
  return resp;
}

/**
 * Atualiza tudo da Senior, em partes (as mesmas do agendador da VM):
 * colaboradores por empresa e período de admissão; desligados só se todas as
 * partes da empresa deram certo; posto e escala em lotes de matrículas; nomes.
 */
export async function atualizarDaSenior(
  aviso: (texto: string) => void = () => {},
): Promise<{ total: number; inativados: number; postosRecebidos: number; postosGravados: number; escalasGravadas: number }> {
  let total = 0;
  let inativados = 0;
  let desde: string | null = null;
  const matriculas = new Map<number, number[]>();

  for (const empresa of EMPRESAS) {
    const daEmpresa: number[] = [];
    for (let periodo = 0; periodo < PERIODOS; periodo++) {
      aviso(`1/3 · Colaboradores da empresa ${empresa}, parte ${periodo + 1} de ${PERIODOS}…`);
      const lista = await buscarEtapa<{ dados: { num_cad: number }[] }>({ etapa: 'colaboradores', empresa, periodo });
      const { data, error } = await supabase.rpc('sincronizar_colaboradores_senior', {
        _empresas: [empresa], _dados: lista.dados as unknown as Json, _inativar: false,
      });
      if (error) throw new Error(error.message);
      const r = data as { gravados: number; sincronizado_em: string };
      desde ??= r.sincronizado_em;
      total += r.gravados;
      daEmpresa.push(...lista.dados.map(d => d.num_cad));
    }
    matriculas.set(empresa, daEmpresa);
    // Todas as partes da empresa vieram: quem não veio saiu da Senior.
    const { data: n, error } = await supabase.rpc('senior_inativar_ausentes', { _empresa: empresa, _desde: desde! });
    if (error) throw new Error(error.message);
    inativados += n as number;
  }

  const postos = new Set<string>();
  const escalas = new Set<number>();
  for (const empresa of EMPRESAS) {
    const lotes = emLotes([...new Set(matriculas.get(empresa) ?? [])].sort((a, b) => a - b), MATRICULAS_POR_LOTE);
    for (const [i, lote] of lotes.entries()) {
      aviso(`2/3 · Postos e escalas da empresa ${empresa}, parte ${i + 1} de ${lotes.length}…`);
      const p = await buscarEtapa<{ dados: { posto_estrutura: number | null; posto_codigo: string | null; escala_codigo: number | null }[] }>(
        { etapa: 'postos', empresa, matriculas: lote });
      const { error } = await supabase.rpc('senior_gravar_postos_escalas', { _empresa: empresa, _dados: p.dados as unknown as Json });
      if (error) throw new Error(error.message);
      for (const d of p.dados) {
        if (d.posto_codigo) postos.add(`${d.posto_estrutura}|${d.posto_codigo}`);
        if (d.escala_codigo) escalas.add(d.escala_codigo);
      }
    }
  }

  let postosRecebidos = 0;
  let postosGravados = 0;
  let escalasGravadas = 0;
  const lotesPostos = emLotes([...postos], POSTOS_POR_LOTE);
  for (const [i, lote] of (lotesPostos.length ? lotesPostos : [[]]).entries()) {
    aviso(`3/3 · Nomes dos postos e das escalas, parte ${i + 1} de ${Math.max(1, lotesPostos.length)}…`);
    const desc = await buscarEtapa<{ postos: Json[]; escalas: Json[] }>(
      { etapa: 'descricoes', postos: lote, escalas: i === 0 ? [...escalas] : [] });
    const { data, error } = await supabase.rpc('senior_gravar_descricoes', { _postos: desc.postos, _escalas: desc.escalas });
    if (error) throw new Error(`Etapa 3 (nomes dos postos): ${error.message}`);
    const nomes = data as { postos: number; escalas: number } | null;
    postosRecebidos += desc.postos.length;
    postosGravados += nomes?.postos ?? 0;
    escalasGravadas += nomes?.escalas ?? 0;
  }
  return { total, inativados, postosRecebidos, postosGravados, escalasGravadas };
}

export interface ResumoFichas {
  quantidade: number;
  /** Data de entrega da ficha mais recente (aaaa-mm-dd). */
  ultima: string | null;
  pendentes: number;
}

export type FormaLigacao = 'cpf' | 'matricula' | 'nome';

export interface Comparacao {
  porColaborador: Map<string, ResumoFichas>;
  /** Fichas que não batem com nenhum colaborador da lista (desligado antigo, terceiro, CPF/matrícula digitados errado). */
  fichasSemColaborador: EPIFicha[];
  /** Quantas fichas ligaram por CPF, por matrícula e só pelo nome. */
  ligadasPor: Record<FormaLigacao, number>;
  /** De quem é cada ficha (id da ficha -> colaborador e como ligou). */
  porFicha: Map<string, { colaborador: ColaboradorLista; forma: FormaLigacao }>;
}

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
/** CPF com 9 a 11 dígitos (a Senior e as fichas às vezes perdem os zeros à esquerda). */
const chaveCpf = (v: string | null | undefined) => {
  const d = soDigitos(v);
  return d.length >= 9 && d.length <= 11 && !/^0+$/.test(d) ? d.padStart(11, '0') : '';
};

/**
 * Liga cada ficha a um colaborador da Senior: primeiro pelo CPF, depois pela
 * matrícula, por último pelo nome. Uma ficha conta para um colaborador só.
 */
export function cruzarComFichas(colaboradores: ColaboradorLista[], fichas: EPIFicha[]): Comparacao {
  const porCpf = new Map<string, ColaboradorLista>();
  const porMatricula = new Map<string, ColaboradorLista>();
  const porNome = new Map<string, ColaboradorLista | null>(); // null = nome repetido, não liga
  for (const c of colaboradores) {
    const cpf = chaveCpf(c.cpf);
    if (cpf) porCpf.set(cpf, c);
    porMatricula.set(String(c.num_cad), c);
    const nome = chaveSolta(c.nome);
    porNome.set(nome, porNome.has(nome) ? null : c);
  }

  const fichasDe = new Map<string, EPIFicha[]>();
  const fichasSemColaborador: EPIFicha[] = [];
  const ligadasPor: Record<FormaLigacao, number> = { cpf: 0, matricula: 0, nome: 0 };
  const porFicha = new Map<string, { colaborador: ColaboradorLista; forma: FormaLigacao }>();
  for (const f of fichas) {
    let c: ColaboradorLista | null | undefined = porCpf.get(chaveCpf(f.cpf));
    let forma: FormaLigacao = 'cpf';
    if (!c) { c = porMatricula.get(soDigitos(f.matricula)); forma = 'matricula'; }
    if (!c) { c = porNome.get(chaveSolta(f.nomeFuncionario || '')); forma = 'nome'; }
    if (!c) { fichasSemColaborador.push(f); continue; }
    ligadasPor[forma]++;
    porFicha.set(f.id, { colaborador: c, forma });
    fichasDe.set(c.id, [...(fichasDe.get(c.id) ?? []), f]);
  }

  const porColaborador = new Map<string, ResumoFichas>();
  for (const c of colaboradores) {
    const lista = fichasDe.get(c.id) ?? [];
    porColaborador.set(c.id, {
      quantidade: lista.length,
      ultima: lista.reduce<string | null>((m, f) => (!m || f.dataEntrega > m ? f.dataEntrega : m), null),
      pendentes: lista.filter(f => f.status === 'pendente').length,
    });
  }
  return { porColaborador, fichasSemColaborador, ligadasPor, porFicha };
}
