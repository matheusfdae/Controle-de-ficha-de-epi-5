import type { jsPDF as JsPDF } from 'jspdf';
import logoUrl from '@/assets/logo-5estrelas-horizontal.png';
import { desenharRelatorio, nomeArquivoRelatorio } from '../../../../supabase/functions/_shared/relatorioMovimentacaoPdf';
import type { RelatorioDia } from './movimentacaoService';

/**
 * PDF do relatório do dia do fiscal (link público da movimentação diária).
 * O desenho fica em supabase/functions/_shared/relatorioMovimentacaoPdf.ts,
 * o mesmo que a passagem de plantão manda por e-mail.
 */
export { COLUNAS, celulas, resumo } from '../../../../supabase/functions/_shared/relatorioMovimentacaoPdf';

let logo: string | null | undefined;
async function carregarLogo(): Promise<string | null> {
  if (logo !== undefined) return logo;
  try {
    const blob = await (await fetch(logoUrl)).blob();
    logo = await new Promise<string>((ok, falha) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = falha;
      r.readAsDataURL(blob);
    });
  } catch { logo = null; }
  return logo;
}

export async function pdfRelatorioDia(r: RelatorioDia, baixar = true): Promise<JsPDF> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  desenharRelatorio(doc, r, await carregarLogo());
  if (baixar) doc.save(nomeArquivoRelatorio(r));
  return doc;
}
