import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { importarPrecos, nomeMaterial, reais, type Material } from '../lib/pedidosService';
import { valorCelula, type Celula } from '../lib/planilhaPostos';
import { casarPrecos, lerAbaPrecos, type PrecoLido } from '../lib/planilhaPrecos';

/**
 * Importa os preços dos itens de uma planilha (.xlsx) com as colunas ITEM e
 * PREÇO (ou VALOR / UNITÁRIO), em qualquer aba. Mostra o que bateu com o
 * catálogo e o que não bateu antes de gravar.
 */
export default function ImportarPrecos({ open, onOpenChange, materiais, onImportado }: {
  open: boolean; onOpenChange: (o: boolean) => void; materiais: Material[]; onImportado: () => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [lidos, setLidos] = useState<PrecoLido[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  // Nome como o banco compara: "Item" ou "Item — Variação".
  const catalogo = useMemo(() => materiais.map(m => ({ nome: nomeMaterial(m, materiais), m })), [materiais]);
  const r = useMemo(() => casarPrecos(lidos, catalogo), [lidos, catalogo]);
  const mudam = r.achados.filter(a => catalogo.find(c => c.nome === a.nome)?.m.preco !== a.preco).length;

  const limpar = () => { setLidos([]); setAvisos([]); setNomeArquivo(''); };
  const ler = async (f: File) => {
    setLendo(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const todos: PrecoLido[] = [];
      const av: string[] = [];
      wb.eachSheet(ws => {
        const grade: Celula[][] = [];
        ws.eachRow({ includeEmpty: true }, (row, n) => {
          grade[n - 1] = [];
          row.eachCell({ includeEmpty: true }, (c, col) => { grade[n - 1][col - 1] = valorCelula(c.value); });
        });
        const a = lerAbaPrecos(ws.name, grade);
        todos.push(...a.itens); av.push(...a.avisos);
      });
      if (!todos.length) { toast.error('Nenhum preço encontrado: a planilha precisa de uma coluna ITEM e uma coluna PREÇO (ou VALOR).'); return; }
      setLidos(todos); setAvisos(av); setNomeArquivo(f.name);
    } catch (e) { toast.error('Não foi possível ler a planilha: ' + (e as Error).message); }
    finally { setLendo(false); }
  };

  const gravar = async () => {
    setGravando(true);
    try {
      const res = await importarPrecos(r.achados.map(a => ({ nome: a.nome, preco: a.preco.toFixed(2) })));
      toast.success(`${res.atualizados} preço(s) gravado(s).${res.nao_encontrados.length ? ` ${res.nao_encontrados.length} não encontrado(s).` : ''}`);
      onImportado(); onOpenChange(false); limpar();
    } catch (e) { toast.error((e as Error).message); }
    finally { setGravando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!gravando) { onOpenChange(o); if (!o) limpar(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Importar preços</DialogTitle>
          <DialogDescription>
            Planilha .xlsx com uma coluna de <b>item</b> (ITEM, DESCRIÇÃO ou PRODUTO) e uma de <b>preço</b> (PREÇO, VALOR ou UNITÁRIO).
            O item é ligado pelo nome do catálogo (sem diferenciar acento e maiúsculas). Pedidos já feitos mantêm o preço do dia em que foram feitos.
          </DialogDescription>
        </DialogHeader>
        <input ref={arquivo} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ler(f); }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" disabled={lendo || gravando} onClick={() => arquivo.current?.click()}>
            {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher planilha (.xlsx)
          </Button>
          {nomeArquivo && <span className="text-sm text-muted-foreground">{nomeArquivo} · {lidos.length} linha(s) com preço</span>}
        </div>

        {lidos.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{r.achados.length}</p><p className="text-xs text-muted-foreground">itens do catálogo</p></div>
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{mudam}</p><p className="text-xs text-muted-foreground">com preço novo</p></div>
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{r.naoAchados.length}</p><p className="text-xs text-muted-foreground">não estão no catálogo</p></div>
            </div>
            <details className="rounded-md border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Preços que vão ser gravados ({r.achados.length})</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto text-xs space-y-0.5">
                {r.achados.map(a => {
                  const antes = catalogo.find(c => c.nome === a.nome)?.m.preco;
                  return <li key={a.nome}>{a.nome}: <b>{reais(a.preco)}</b>{antes != null && antes !== a.preco && <span className="text-muted-foreground"> (era {reais(antes)})</span>}</li>;
                })}
              </ul>
            </details>
            {r.naoAchados.length > 0 && (
              <details className="rounded-md border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Não estão no catálogo ({r.naoAchados.length})</summary>
                <p className="text-xs text-muted-foreground mt-1">Esses nomes não existem em Itens; os preços deles não entram. Cadastre o item (ou corrija o nome na planilha) e importe de novo.</p>
                <ul className="mt-2 max-h-40 overflow-y-auto text-xs space-y-0.5">{r.naoAchados.map(l => <li key={`${l.aba}-${l.linha}`}>{l.nome} — {reais(l.preco)} <span className="text-muted-foreground">({l.aba}, linha {l.linha})</span></li>)}</ul>
              </details>
            )}
            {avisos.length > 0 && (
              <details className="rounded-md border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Avisos ({avisos.length})</summary>
                <ul className="mt-2 max-h-32 overflow-y-auto text-xs">{avisos.map(a => <li key={a}>{a}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={gravando} onClick={() => { onOpenChange(false); limpar(); }}>Cancelar</Button>
          <Button className="gap-2" disabled={gravando || r.achados.length === 0} onClick={gravar}>
            {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Gravar {r.achados.length} preço(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
