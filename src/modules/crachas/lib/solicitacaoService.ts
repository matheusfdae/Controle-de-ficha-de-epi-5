import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { cpfValido } from '../../../../supabase/functions/_shared/senior';
import { obterUsuarioAtual } from './usuario';

/**
 * Solicitação de crachá pelo link público (quem pede se identifica). As funções do
 * banco (migration 20261020120000) conferem o solicitante a cada chamada e
 * devolvem {erro} quando algo não confere.
 */

export const MOTIVOS = [
  { valor: 'primeira_via', rotulo: '1ª via (nunca teve crachá)' },
  { valor: 'perda', rotulo: '2ª via — perda / roubo' },
  { valor: 'dano', rotulo: '2ª via — dano / desgaste' },
  { valor: 'mudanca_cargo', rotulo: 'Mudança de cargo ou posto' },
  { valor: 'mudanca_nome', rotulo: 'Mudança de nome' },
  { valor: 'outro', rotulo: 'Outro (explique na observação)' },
] as const;
export type Motivo = (typeof MOTIVOS)[number]['valor'];

export const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Quem solicita: identificado pela matrícula OU pelo CPF (só um dos dois). */
export type Solicitante = { matricula: number; cpf?: undefined } | { cpf: string; matricula?: undefined };

const solicitanteArgs = (s: Solicitante) => ({ _sol_matricula: s.matricula ?? null, _sol_cpf: s.cpf ? soDigitos(s.cpf) : null });

export interface SolicitanteIdentificado { nome: string; cargo: string | null; uf: string | null }

export interface ColaboradorParaCracha {
  nome: string;
  matricula: number;
  cargo: string | null;
  empresa: string | null;
  local: string | null;
  posto: string | null;
  uf: string | null;
  situacao: string | null;
  vigilante: boolean;
  tem_foto: boolean;
  tipo_sanguineo: string | null;
  cnv: string | null;
  solicitacao: { status: string; enviada_em: string | null; motivo_recusa: string | null } | null;
}

export const soDigitos = (v: string) => v.replace(/\D/g, '');

/** Matrícula da Senior: só números, até 9 dígitos (cabe em integer). */
export function matriculaValida(v: string): number | null {
  const d = soDigitos(v);
  return d && d.length <= 9 ? Number(d) : null;
}

export { cpfValido };

export function formatarCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function formatarTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

async function chamar<T>(fn: 'cracha_solicitacao_identificar' | 'cracha_solicitacao_buscar' | 'cracha_solicitacao_enviar', args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message?.includes('Failed to fetch') ? 'Sem conexão com o servidor. Verifique a internet.' : error.message);
  const r = data as { erro?: string } | null;
  if (r?.erro) throw new Error(r.erro);
  return r as T;
}

export const identificarSolicitante = (s: Solicitante) =>
  chamar<SolicitanteIdentificado>('cracha_solicitacao_identificar', { _matricula: s.matricula ?? null, _cpf: s.cpf ? soDigitos(s.cpf) : null });

export const buscarColaborador = (s: Solicitante, busca: { matricula?: number; cpf?: string }) =>
  chamar<ColaboradorParaCracha>('cracha_solicitacao_buscar', {
    ...solicitanteArgs(s),
    _matricula: busca.matricula ?? null, _cpf: busca.cpf ? soDigitos(busca.cpf) : null,
  });

/** Reduz a foto (lado maior 900 px) e converte para JPEG antes de enviar. */
export async function prepararFoto(arquivo: File, ladoMaior = 900): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não foi possível ler a foto. Tente outra.'));
      i.src = url;
    });
    const escala = Math.min(1, ladoMaior / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob(b => (b ? ok(b) : falha(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function enviarSolicitacao(s: Solicitante, dados: {
  matricula: number; telefone: string; motivo: Motivo; observacao: string;
  foto: Blob | null; tipoSanguineo: string; cnv: string;
}) {
  let caminho: string | null = null;
  if (dados.foto) {
    caminho = `solicitacoes/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from('cracha-fotos')
      .upload(caminho, dados.foto, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error('Não foi possível enviar a foto: ' + error.message);
  }
  return chamar<{ ok: true; nome: string }>('cracha_solicitacao_enviar', {
    ...solicitanteArgs(s), _sol_telefone: soDigitos(dados.telefone),
    _matricula: dados.matricula, _cpf: null,
    _motivo: dados.motivo, _observacao: dados.observacao || null, _foto: caminho,
    _tipo_sanguineo: dados.tipoSanguineo || null, _cnv: soDigitos(dados.cnv) || null,
  });
}

// ---------- Lado do RH ----------

export type StatusSolicitacao = 'recebida' | 'em_analise' | 'aprovada' | 'rejeitada';

/** Muda o status; ao aprovar, a foto enviada passa a ser a foto do crachá. */
export async function revisarSolicitacao(
  emp: { id: string; request_photo_url: string | null; photo_url: string | null },
  status: StatusSolicitacao, motivoRecusa?: string,
) {
  const { data: { user } } = await obterUsuarioAtual();
  const payload: TablesUpdate<'cracha_employees'> = {
    request_status: status,
    rejection_reason: status === 'rejeitada' ? (motivoRecusa?.trim() || null) : null,
    reviewed_by: user?.id ?? null,
    reviewed_at: new Date().toISOString(),
  };
  if (status === 'aprovada' && emp.request_photo_url) payload.photo_url = emp.request_photo_url;
  const { error } = await supabase.from('cracha_employees').update(payload).eq('id', emp.id);
  if (error) throw error;
}
