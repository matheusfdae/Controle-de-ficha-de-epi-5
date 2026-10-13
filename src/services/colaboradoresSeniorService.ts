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
  | { etapa: 'colaboradores' }
  | { etapa: 'postos'; empresa: number }
  | { etapa: 'descricoes'; postos: string[]; escalas: number[] };

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
 * Atualiza tudo da Senior em 3 etapas (cada chamada cabe no limite de 60 s
 * das Edge Functions): colaboradores, posto/escala de cada um, descrições.
 */
export async function atualizarDaSenior(
  aviso: (texto: string) => void = () => {},
): Promise<{ total: number; inativados: number; postosRecebidos: number; postosGravados: number; escalasGravadas: number }> {
  aviso('1/3 · Buscando os colaboradores na Senior… (~40 s)');
  const lista = await buscarEtapa<{ empresas: number[]; dados: Json[] }>({ etapa: 'colaboradores' });
  if (!lista.dados?.length) throw new Error('A Senior não devolveu colaboradores');
  const { data, error } = await supabase.rpc('sincronizar_colaboradores_senior', { _empresas: lista.empresas, _dados: lista.dados });
  if (error) throw new Error(error.message);
  const r = data as { gravados: number; inativados: number };

  const postos = new Set<string>();
  const escalas = new Set<number>();
  for (const empresa of lista.empresas) {
    aviso(`2/3 · Postos de trabalho e escalas da empresa ${empresa}… (~50 s)`);
    const p = await buscarEtapa<{ empresa: number; dados: { posto_estrutura: number | null; posto_codigo: string | null; escala_codigo: number | null }[] }>(
      { etapa: 'postos', empresa });
    const { error: e2 } = await supabase.rpc('senior_gravar_postos_escalas', { _empresa: empresa, _dados: p.dados as unknown as Json });
    if (e2) throw new Error(e2.message);
    for (const d of p.dados) {
      if (d.posto_codigo) postos.add(`${d.posto_estrutura}|${d.posto_codigo}`);
      if (d.escala_codigo) escalas.add(d.escala_codigo);
    }
  }

  aviso('3/3 · Nomes dos postos e das escalas…');
  const desc = await buscarEtapa<{ postos: Json; escalas: Json }>({ etapa: 'descricoes', postos: [...postos], escalas: [...escalas] });
  const { data: d3, error: e3 } = await supabase.rpc('senior_gravar_descricoes', { _postos: desc.postos, _escalas: desc.escalas });
  if (e3) throw new Error(`Etapa 3 (nomes dos postos): ${e3.message}`);
  const nomes = d3 as { postos: number; escalas: number } | null;
  return {
    total: r.gravados, inativados: r.inativados,
    postosRecebidos: (desc.postos as unknown[]).length, postosGravados: nomes?.postos ?? 0, escalasGravadas: nomes?.escalas ?? 0,
  };
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
  for (const f of fichas) {
    let c: ColaboradorLista | null | undefined = porCpf.get(chaveCpf(f.cpf));
    let forma: FormaLigacao = 'cpf';
    if (!c) { c = porMatricula.get(soDigitos(f.matricula)); forma = 'matricula'; }
    if (!c) { c = porNome.get(chaveSolta(f.nomeFuncionario || '')); forma = 'nome'; }
    if (!c) { fichasSemColaborador.push(f); continue; }
    ligadasPor[forma]++;
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
  return { porColaborador, fichasSemColaborador, ligadasPor };
}
