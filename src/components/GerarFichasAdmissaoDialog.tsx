import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSignature, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { EPI, Funcao, listFuncaoEpis } from '@/services/estoqueService';
import {
  AdmitidoFicha, ItemAdmissao, faltaTamanho, gerarFichasAdmissao, itensDoKit,
} from '@/services/integracaoService';

export interface PessoaAdmissao {
  chave: string;
  dados: AdmitidoFicha;
  /** Tipo de uniforme sugerido (pelo cargo ou escolhido no cadastro manual). */
  kitId?: string;
}

interface Linha { kitId: string; itens: ItemAdmissao[]; carregando: boolean }

/**
 * Gera as fichas de admissão (EPI e uniforme, pendentes de assinatura) de uma
 * ou várias pessoas: escolhe o Tipo de uniforme, confere itens e tamanhos.
 */
export default function GerarFichasAdmissaoDialog({
  pessoas, aberto, onFechar, funcoes, catalogo, tamanhos, modeloId, onGeradas,
}: {
  pessoas: PessoaAdmissao[];
  aberto: boolean;
  onFechar: () => void;
  funcoes: Funcao[];
  catalogo: EPI[];
  tamanhos: Record<string, string[]>;
  modeloId?: string;
  onGeradas: (chaves: string[]) => void;
}) {
  const { estados } = useAuth();
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [gerando, setGerando] = useState<{ feitos: number; total: number } | null>(null);

  async function escolherKit(chave: string, kitId: string) {
    setLinhas(l => ({ ...l, [chave]: { kitId, itens: l[chave]?.itens ?? [], carregando: true } }));
    try {
      const itens = kitId ? itensDoKit(await listFuncaoEpis(kitId), catalogo) : [];
      setLinhas(l => ({ ...l, [chave]: { kitId, itens, carregando: false } }));
    } catch {
      setLinhas(l => ({ ...l, [chave]: { kitId, itens: [], carregando: false } }));
      toast.error('Não foi possível carregar os itens do tipo de uniforme');
    }
  }

  // Ao abrir: tipo de uniforme sugerido de cada pessoa.
  useEffect(() => {
    if (!aberto) return;
    setLinhas({});
    for (const p of pessoas) {
      const kit = p.kitId
        ?? funcoes.find(f => f.nome.trim().toLowerCase() === p.dados.funcao.trim().toLowerCase())?.id ?? '';
      if (kit) escolherKit(p.chave, kit);
      else setLinhas(l => ({ ...l, [p.chave]: { kitId: '', itens: [], carregando: false } }));
    }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const alterarItem = (chave: string, i: number, patch: Partial<ItemAdmissao>) =>
    setLinhas(l => ({ ...l, [chave]: { ...l[chave], itens: l[chave].itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) } }));

  const problemaDe = (p: PessoaAdmissao): string | null => {
    const l = linhas[p.chave];
    if (!p.dados.uf) return 'sem estado';
    if (!estados.includes(p.dados.uf)) return `sem acesso ao estado ${p.dados.uf}`;
    if (!l?.kitId) return 'escolha o tipo de uniforme';
    if (!l.itens.some(i => i.incluir)) return 'nenhum item marcado';
    const sem = faltaTamanho(l.itens, tamanhos);
    if (sem.length) return `informe o tamanho de ${sem.map(i => i.nome).join(', ')}`;
    return null;
  };

  async function gerar() {
    const prontas = pessoas.filter(p => !problemaDe(p));
    if (!prontas.length) return toast.error('Nenhuma pessoa pronta: confira os avisos em vermelho.');
    setGerando({ feitos: 0, total: prontas.length });
    const ok: string[] = [];
    let fichas = 0;
    for (const [i, p] of prontas.entries()) {
      try {
        fichas += await gerarFichasAdmissao(p.dados, linhas[p.chave].itens, modeloId);
        ok.push(p.chave);
      } catch (e) {
        toast.error(`${p.dados.nome}: ${e instanceof Error ? e.message : 'erro ao gerar'}`);
      }
      setGerando({ feitos: i + 1, total: prontas.length });
    }
    setGerando(null);
    if (ok.length) {
      toast.success(`${fichas} ficha(s) gerada(s) para ${ok.length} pessoa(s), pendentes de assinatura.`
        + (prontas.length < pessoas.length ? ` ${pessoas.length - prontas.length} ficaram de fora (ver avisos).` : ''));
      onGeradas(ok);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => !o && !gerando && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar fichas de admissão ({pessoas.length})</DialogTitle>
          <DialogDescription>
            Para cada pessoa saem duas fichas pendentes de assinatura, uma de EPI e uma de uniforme, com os
            itens do tipo de uniforme escolhido. A baixa no estoque acontece ao gerar, como na Nova Ficha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pessoas.map(p => {
            const l = linhas[p.chave];
            const problema = problemaDe(p);
            return (
              <div key={p.chave} className={`rounded-lg border p-3 space-y-2 ${problema ? 'border-amber-400' : ''}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.dados.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.dados.funcao || 'sem cargo'} · {p.dados.posto || 'sem posto'} · {p.dados.uf || 'sem UF'} · {p.dados.empresa}
                    </div>
                  </div>
                  <Select value={l?.kitId ?? ''} onValueChange={v => escolherKit(p.chave, v)}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Tipo de uniforme" /></SelectTrigger>
                    <SelectContent>
                      {funcoes.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {l?.carregando && <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Carregando itens…</p>}
                {!!l?.itens.length && (
                  <div className="grid gap-1.5">
                    {l.itens.map((it, i) => (
                      <div key={`${it.epiId}-${i}`} className={`grid grid-cols-[auto_1fr_6rem_4rem] items-center gap-2 text-sm ${it.incluir ? '' : 'opacity-50'}`}>
                        <input type="checkbox" className="h-4 w-4" checked={it.incluir}
                          onChange={e => alterarItem(p.chave, i, { incluir: e.target.checked })} />
                        <span className="truncate">
                          <Badge variant="outline" className="mr-1.5 text-[10px]">{it.tipo === 'epi' ? 'EPI' : 'Uniforme'}</Badge>
                          {it.nome}
                        </span>
                        <Input className="h-8" placeholder="Tam." value={it.tamanho} list={`tam-${p.chave}-${i}`}
                          onChange={e => alterarItem(p.chave, i, { tamanho: e.target.value })} />
                        <datalist id={`tam-${p.chave}-${i}`}>
                          {(tamanhos[it.epiId] ?? []).map(t => <option key={t} value={t} />)}
                        </datalist>
                        <Input className="h-8" inputMode="numeric" value={String(it.quantidade)}
                          onChange={e => alterarItem(p.chave, i, { quantidade: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} />
                      </div>
                    ))}
                  </div>
                )}
                {problema && <p className="text-xs text-amber-700">⚠ {problema}</p>}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={!!gerando}>Cancelar</Button>
          <Button onClick={gerar} disabled={!!gerando}>
            {gerando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSignature className="h-4 w-4 mr-1" />}
            {gerando ? `Gerando ${gerando.feitos}/${gerando.total}…` : `Gerar fichas (${pessoas.filter(p => !problemaDe(p)).length} pronta(s))`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
