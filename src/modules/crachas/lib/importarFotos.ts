import { supabase } from '@/integrations/supabase/client';
import { prepararFoto } from './solicitacaoService';

/**
 * Importação das fotos do sistema antigo de crachás. Os arquivos vêm como
 * "<matrícula>_<Nome_Do_Colaborador>[_2].jpg"; a foto é ligada ao colaborador
 * pela matrícula (sem os zeros da frente) e, quando a matrícula não serve
 * (zerada ou de ninguém), pelo nome — só se o nome for de uma pessoa só.
 */

export interface ColaboradorFoto {
  id: string; employee_id: string; full_name: string; photo_url: string | null; desligado_em: string | null;
}

/** `texto` = nome do arquivo inteiro (sem extensão e sem "_2"), para achar o nome no fim. */
export interface FotoLida { arquivo: File; matricula: string | null; nome: string; texto: string; variante: number }

export type ComoCasou = 'matricula' | 'nome';
export interface FotoCasada { foto: FotoLida; colaborador: ColaboradorFoto; como: ComoCasou }

export interface ResultadoCasamento {
  casadas: FotoCasada[];
  /** Arquivo sem colaborador (nem pela matrícula, nem pelo nome). */
  semColaborador: FotoLida[];
  /** Outra foto do mesmo colaborador (ex.: "_2"): fica de fora, vale a primeira. */
  repetidas: FotoCasada[];
  /** Nome de mais de uma pessoa e sem matrícula que desempate. */
  ambiguas: FotoLida[];
  ignorados: File[];
}

const EXTENSOES = /\.(jpe?g|png|webp)$/i;

const semZeros = (m: string) => m.replace(/\D/g, '').replace(/^0+/, '');
export const chaveNome = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "002002233_VALDEIR_ALVES_DOS_SANTOS_2.jpg" -> matrícula 2002233, nome, variante 2. */
export function lerNomeArquivo(arquivo: File): FotoLida {
  let base = arquivo.name.replace(EXTENSOES, '');
  let variante = 1;
  const v = base.match(/_(\d{1,2})$/);
  if (v && base.indexOf('_') < v.index!) { variante = Number(v[1]); base = base.slice(0, v.index); }
  const m = base.match(/^(\d+)[_\s-]+(.*)$/);
  const matricula = m ? semZeros(m[1]) || null : null;
  const nome = (m ? m[2] : base).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return { arquivo, matricula, nome, texto: base.replace(/_/g, ' '), variante };
}

/** Liga cada foto a um colaborador. Ativos têm preferência sobre desligados. */
export function casarFotos(arquivos: File[], colaboradores: ColaboradorFoto[]): ResultadoCasamento {
  const ativosPrimeiro = [...colaboradores].sort((a, b) => Number(!!a.desligado_em) - Number(!!b.desligado_em));
  const porMatricula = new Map<string, ColaboradorFoto[]>();
  const porNome = new Map<string, ColaboradorFoto[]>();
  for (const c of ativosPrimeiro) {
    const m = semZeros(c.employee_id ?? '');
    if (m) porMatricula.set(m, [...(porMatricula.get(m) ?? []), c]);
    const n = chaveNome(c.full_name ?? '');
    if (n) porNome.set(n, [...(porNome.get(n) ?? []), c]);
  }

  const r: ResultadoCasamento = { casadas: [], semColaborador: [], repetidas: [], ambiguas: [], ignorados: [] };
  const fotos = arquivos.filter(a => EXTENSOES.test(a.name)).map(lerNomeArquivo)
    .sort((a, b) => a.variante - b.variante || a.arquivo.name.localeCompare(b.arquivo.name));
  r.ignorados = arquivos.filter(a => !EXTENSOES.test(a.name));
  const usados = new Set<string>();

  for (const foto of fotos) {
    const nome = chaveNome(foto.nome);
    let achado: ColaboradorFoto | undefined;
    let como: ComoCasou = 'matricula';
    const mesmos = foto.matricula ? porMatricula.get(foto.matricula) ?? [] : [];
    if (mesmos.length) {
      // Mesma matrícula em mais de um cadastro: desempata pelo nome; senão, o ativo.
      achado = mesmos.find(c => chaveNome(c.full_name) === nome) ?? mesmos[0];
    } else {
      // Nome igual; senão, o arquivo termina com o nome completo ("Atribuida_pelo_RH_<nome>", "NA_<nome>").
      const texto = chaveNome(foto.texto);
      let homonimos = nome ? porNome.get(nome) ?? [] : [];
      if (!homonimos.length) {
        homonimos = [...porNome.entries()]
          .filter(([n]) => n.includes(' ') && (texto === n || texto.endsWith(' ' + n)))
          .flatMap(([, cs]) => cs);
      }
      const ativos = homonimos.filter(c => !c.desligado_em);
      const candidatos = ativos.length ? ativos : homonimos;
      if (candidatos.length > 1) { r.ambiguas.push(foto); continue; }
      achado = candidatos[0];
      como = 'nome';
    }
    if (!achado) { r.semColaborador.push(foto); continue; }
    const casada = { foto, colaborador: achado, como };
    if (usados.has(achado.id)) { r.repetidas.push(casada); continue; }
    usados.add(achado.id);
    r.casadas.push(casada);
  }
  return r;
}

/** Envia a foto (reduzida para JPEG) e passa a ser a foto do crachá do colaborador. */
export async function enviarFotoColaborador(colaboradorId: string, arquivo: File): Promise<string> {
  const blob = await prepararFoto(arquivo);
  const caminho = `colaboradores/${colaboradorId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('cracha-fotos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Não foi possível enviar a foto: ' + error.message);
  const url = `/storage/v1/object/public/cracha-fotos/${caminho}`;
  const { error: e2 } = await supabase.from('cracha_employees').update({ photo_url: url }).eq('id', colaboradorId);
  if (e2) throw new Error('A foto subiu, mas não foi gravada no colaborador: ' + e2.message);
  return url;
}
