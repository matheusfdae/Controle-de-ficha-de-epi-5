import { EPIFicha, MotivoEntrega } from '@/types/epi';
import { ReactNode, useEffect, useState } from 'react';
import { getConfig, loadConfig } from '@/services/configService';

interface Props {
  ficha: EPIFicha;
  /** Modo assinatura: renderiza checkboxes interativos e área de assinatura no final */
  signMode?: {
    itensRecebidos: Record<string, boolean>;
    onToggleItem: (id: string) => void;
    signatureSlot: ReactNode;
  };
}

const motivos: { key: MotivoEntrega; label: string }[] = [
  { key: 'admissao', label: 'ADMISSÃO' },
  { key: 'substituicao', label: 'SUBSTITUIÇÃO' },
  { key: 'perda_extravio', label: 'PERDA/EXTRAVIO' },
  { key: 'demissao', label: 'DEMISSÃO' },
  { key: 'complemento', label: 'COMPLEMENTO' },
];

/**
 * Reproduz fielmente o layout oficial:
 * "TERMO DE RECEBIMENTO DE UNIFORME/EPI's - REV-00"
 */
export default function FichaOficialView({ ficha, signMode }: Props) {
  const minRows = 9;
  const rowsToRender = Math.max(ficha.itens.length, minRows);
  const [config, setConfig] = useState(getConfig());
  useEffect(() => {
    let active = true;
    loadConfig().then(cfg => { if (active) setConfig(cfg); });
    return () => { active = false; };
  }, []);
  const nomeParts = config.empresaNome.split(' ');
  const linha1 = nomeParts[0] || '';
  const linha2 = nomeParts.slice(1).join(' ') || '';

  return (
    <div className="bg-white text-black mx-auto shadow-lg border border-black/40 print:shadow-none print:border-0"
         style={{ width: '100%', maxWidth: 1100, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>
      {/* Header */}
      <div className="flex border-b border-black">
        <div className="w-40 flex flex-col items-center justify-center border-r border-black p-2 text-center">
          {config.logoDataUrl ? (
            <img src={config.logoDataUrl} alt="Logo" className="max-h-14 object-contain" />
          ) : (
            <>
              <div className="font-bold text-sm leading-tight">{linha1}</div>
              {linha2 && <div className="font-bold text-base leading-tight">{linha2}</div>}
              <div className="text-[8px] leading-tight">{config.empresaSubtitulo}</div>
            </>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center font-bold text-base px-2 py-3 text-center">
          TERMO DE RECEBIMENTO DE UNIFORME/EPI's - REV -00
        </div>
      </div>

      {/* Nome + motivos + turno */}
      <div className="flex items-stretch border-b border-black text-[11px]">
        <div className="flex items-center px-2 py-1 border-r border-black flex-1 min-w-0">
          <span className="font-bold mr-2 whitespace-nowrap">NOME DO FUNCIONÁRIO:</span>
          <span className="truncate">{ficha.nomeFuncionario}</span>
        </div>
        <div className="flex items-center gap-3 px-3 border-r border-black">
          {motivos.map(m => (
            <label key={m.key} className="flex items-center gap-1 text-[10px] font-bold">
              <span className="inline-flex items-center justify-center w-3 h-3 border border-black text-[9px] leading-none">
                {ficha.motivo === m.key ? 'X' : ''}
              </span>
              {m.label}
            </label>
          ))}
        </div>
        <div className="flex flex-col px-2 py-1 text-[10px] font-bold justify-center">
          <span>{ficha.turno === 'diurno' ? '☒' : '☐'} DIURNO</span>
          <span>{ficha.turno === 'noturno' ? '☒' : '☐'} NOTURNO</span>
        </div>
      </div>

      {/* Função + Fone */}
      <div className="flex border-b border-black text-[11px]">
        <div className="flex items-center px-2 py-1 border-r border-black flex-1">
          <span className="font-bold mr-2">FUNÇÃO:</span>
          <span>{ficha.funcao}</span>
        </div>
        <div className="flex items-center px-2 py-1 w-1/2">
          <span className="font-bold mr-2">FONE:</span>
          <span>{ficha.telefone}</span>
        </div>
      </div>

      {/* Termo de Responsabilidade */}
      <div className="bg-gray-300 border-b border-black text-center font-bold py-1 text-[12px]">
        TERMO DE RESPONSABILIDADE
      </div>

      <div className="flex border-b border-black">
        <div className="w-[58%] p-2 border-r border-black text-[10px] leading-snug text-justify">
          Declaro que recebi gratuitamente nesta data os EPI'S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: "Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI's fornecidos pela empresa". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT, inclusive no que couber a título de indenização por rescisão de contrato de trabalho a importância correspondente ao valor do material.
        </div>
        <div className="w-[42%] p-2 text-[9.5px] leading-snug">
          <p className="font-bold">BASE LEGAL: NR1 Item 1.8 (Cabe ao Empregado)</p>
          <p className="italic mt-1">a) Cumprir as disposições legais e regulamentares sobre segurança e saúde do trabalho, inclusive as ordens de serviço expedidas pelo empregador; (Alterado pela portaria SIT 84/2009).</p>
          <p className="font-bold mt-1">1.8.1 - Constitui ato faltoso a recusa injustificada do empregado ao cumprimento do disposto no item anterior.</p>
          <p className="font-bold mt-1">NR6 Item 6.7 (Cabe ao Empregado)</p>
          <p>6.7.1 - Cabe ao empregado quanto aos EPI's:</p>
          <p>a) Usar, utilizando-o apenas para a finalidade a que se destina;</p>
          <p>b) Responsabilizar-se pela guarda e conservação;</p>
          <p>c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;</p>
          <p>d) Cumprir as determinações do empregador sobre o uso adequado;</p>
        </div>
      </div>

      {/* Declaro adicional */}
      <div className="border-b border-black p-2 text-[10px] leading-snug text-justify">
        <span className="font-bold">DECLARO</span> para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços. Acrescento ainda que estou ciente que: quaisquer ajustes feitos neste material que possam impedir prejudicar limitar ou ainda causar algum dano ao meu serviço ou material são de MINHA responsabilidade.
      </div>

      {/* Assinaturas (linhas) */}
      <div className="flex border-b border-black">
        <div className="w-1/2 border-r border-black p-3 flex flex-col items-center justify-end" style={{ minHeight: 80 }}>
          <div className="flex-1" />
          <div className="text-[10px] uppercase mb-1">{ficha.nomeFuncionario || <span className="text-muted-foreground italic">Nome do colaborador</span>}</div>
          <div className="w-full border-t border-black pt-1 text-center text-[10px] font-bold">
            NOME COMPLETO (FUNCIONÁRIO)
          </div>
        </div>
        <div className="w-1/2 p-3 flex flex-col items-center justify-end relative" style={{ minHeight: 80 }}>
          <div className="flex-1 w-full flex items-center justify-center relative">
            {(ficha.assinaturaResponsavel || config.assinaturaEmpresa) && (
              <img
                src={ficha.assinaturaResponsavel || config.assinaturaEmpresa}
                alt="Assinatura da empresa"
                className="max-h-12 max-w-[220px] object-contain"
              />
            )}
            {config.carimboEmpresa && (
              <img
                src={config.carimboEmpresa}
                alt="Carimbo"
                className="pointer-events-none absolute"
                style={{
                  maxHeight: 70,
                  maxWidth: 160,
                  opacity: 0.85,
                  filter: 'contrast(1.4) saturate(0) brightness(0.9) sepia(1) hue-rotate(-40deg) saturate(6)',
                  mixBlendMode: 'multiply',
                }}
              />
            )}
          </div>
          <div className="w-full border-t border-black pt-1 text-center text-[10px] font-bold">
            EMPRESA
          </div>
          <div className="text-[10px]">{ficha.empresa}</div>
        </div>

      </div>

      {/* Tabela de itens */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-gray-200">
            <th rowSpan={2} className="border border-black px-1 py-1 w-[10%]">DATA ENTREGA</th>
            <th rowSpan={2} className="border border-black px-1 py-1 w-[6%]">QUANT.</th>
            <th rowSpan={2} className="border border-black px-1 py-1 w-[28%]">DESCRIÇÃO</th>
            <th rowSpan={2} className="border border-black px-1 py-1 w-[7%]">TAM. / Nº</th>
            <th rowSpan={2} className="border border-black px-1 py-1 w-[15%]">POSTO DE SERVIÇO</th>
            <th rowSpan={2} className="border border-black px-1 py-1 w-[12%]">ASSINATURA DO FUNCIONÁRIO</th>
            <th colSpan={3} className="border border-black px-1 py-1">DEVOLUÇÃO</th>
          </tr>
          <tr className="bg-gray-200">
            <th className="border border-black px-1 py-1 w-[8%]">DATA</th>
            <th className="border border-black px-1 py-1 w-[5%]">QUANT</th>
            <th className="border border-black px-1 py-1 w-[9%]">RECEBIDO POR</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowsToRender }).map((_, i) => {
            const item = ficha.itens[i];
            const checked = item ? (signMode ? !!signMode.itensRecebidos[item.id] : item.recebido) : false;
            return (
              <tr key={i} style={{ height: 28 }}>
                <td className="border border-black px-1 text-center">{item?.dataEntrega || ''}</td>
                <td className="border border-black px-1 text-center">{item ? item.quantidade : ''}</td>
                <td className="border border-black px-1">
                  {item?.descricao}
                  {item?.ca ? <span className="text-[9px] text-gray-700"> (CA {item.ca})</span> : null}
                </td>
                <td className="border border-black px-1 text-center">{item?.tamanho || ''}</td>
                <td className="border border-black px-1 text-center">{item?.postoServico || ''}</td>
                <td className="border border-black px-1 text-center">
                  {item ? (
                    signMode ? (
                      <button
                        type="button"
                        onClick={() => signMode.onToggleItem(item.id)}
                        className="inline-flex items-center justify-center w-full h-6 border border-black bg-white hover:bg-gray-100 overflow-hidden"
                        aria-label="Marcar como recebido"
                      >
                        {checked ? (
                          ficha.assinaturaColaborador ? (
                            <img src={ficha.assinaturaColaborador} alt="rubrica" className="max-h-6 object-contain" />
                          ) : '✓'
                        ) : ''}
                      </button>
                    ) : (
                      ficha.assinaturaColaborador ? (
                        <img src={ficha.assinaturaColaborador} alt="rubrica" className="max-h-6 mx-auto object-contain" />
                      ) : (checked ? '✓' : '')
                    )
                  ) : ''}
                </td>
                <td className="border border-black px-1 text-center">{item?.devolucao?.data || ''}</td>
                <td className="border border-black px-1 text-center">{item?.devolucao?.quantidade || ''}</td>
                <td className="border border-black px-1 text-center">{item?.devolucao?.recebidoPor || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Observações */}
      <div className="border-t border-black p-2 text-[10px]" style={{ minHeight: 40 }}>
        <span className="font-bold">OBSERVAÇÕES:</span> {ficha.observacoes || ''}
      </div>

      {/* Slot para assinatura interativa em modo assinar */}
      {signMode?.signatureSlot && (
        <div className="border-t-2 border-black p-3 bg-gray-50">
          {signMode.signatureSlot}
        </div>
      )}

      <div className="text-right text-[9px] text-gray-600 px-2 py-1 border-t border-black">
        Atualizado em 24/10/2025
      </div>
    </div>
  );
}
