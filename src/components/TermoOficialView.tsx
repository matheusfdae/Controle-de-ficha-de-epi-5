import logoUrl from '@/assets/logo-5estrelas-horizontal.png';
import { listaCas, TEXTO_NR6 } from '@/lib/termoEpiPdf';
import type { TermoColetivo, TermoColetivoItem } from '@/services/termoColetivoService';

interface Props { termo: TermoColetivo; itens: TermoColetivoItem[] }

const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Termo de Entrega de EPI na tela, no mesmo layout do PDF (src/lib/termoEpiPdf.ts)
 * e da planilha "19. MODELO - Entrega EPI" (Rev 00).
 */
export default function TermoOficialView({ termo, itens }: Props) {
  const linhasVazias = Math.max(12 - itens.length, 0);
  const cel = 'border border-black px-2 py-1';
  return (
    <div className="overflow-x-auto">
      <div className="bg-white text-black mx-auto shadow-lg border border-black/40 print:shadow-none print:border-0"
           style={{ minWidth: 640, maxWidth: 900, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>
        <div className="flex items-center border-b border-black">
          <div className="w-44 p-2 border-r border-black shrink-0 flex items-center justify-center">
            <img src={logoUrl} alt="Logo" className="max-h-14 object-contain" />
          </div>
          <div className="flex-1 text-center font-bold text-base px-2 py-4">TERMO DE ENTREGA DE EPI - Rev 00</div>
        </div>
        <div className="flex border-b border-black">
          <div className="flex-[3] px-2 py-1 border-r border-black"><b>POSTO:</b> {termo.posto}</div>
          <div className="flex-[2] px-2 py-1"><b>MÊS:</b> {termo.mes_referencia}</div>
        </div>
        <div className="px-2 py-1"><b>LÍDER:</b> {termo.lider || ''}</div>
        <table className="w-full border-collapse">
          <colgroup><col style={{ width: '38%' }} /><col style={{ width: '28%' }} /><col style={{ width: '7%' }} /><col style={{ width: '27%' }} /></colgroup>
          <thead>
            <tr className="bg-neutral-200 font-bold text-center">
              <td className={cel}>NOME COMPLETO COLABORADOR</td>
              <td className={cel}>MATERIAL RECEBIDO</td>
              <td className={cel}>QTD</td>
              <td className={cel}>ASSINATURA</td>
            </tr>
          </thead>
          <tbody>
            {itens.map(it => (
              <tr key={it.id} style={{ height: 42 }}>
                <td className={cel}>{it.colaborador_nome}</td>
                <td className={cel}>{it.material}{it.tamanho ? ` (${it.tamanho})` : ''}</td>
                <td className={`${cel} text-center`}>{it.quantidade}</td>
                <td className={`${cel} relative`}>
                  {it.assinatura_url && <img src={it.assinatura_url} alt="assinatura" className="h-9 object-contain" />}
                  {it.data_assinatura && (
                    <span className="absolute right-1 bottom-0.5 text-[9px] text-neutral-500">{dataHora(it.data_assinatura)}</span>
                  )}
                </td>
              </tr>
            ))}
            {Array.from({ length: linhasVazias }, (_, i) => (
              <tr key={`v${i}`} style={{ height: 42 }}>
                <td className={cel} /><td className={cel} /><td className={cel} /><td className={cel} />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-black px-2 py-2">{TEXTO_NR6}</div>
        <div className="border-t border-black px-2 py-2">
          <div className="font-bold">CA (Certificado de Aprovação)</div>
          {listaCas(itens.map(i => ({ material: i.material, ca: i.ca ?? null }))).map(c => <div key={c}>{c}</div>)}
        </div>
      </div>
    </div>
  );
}
