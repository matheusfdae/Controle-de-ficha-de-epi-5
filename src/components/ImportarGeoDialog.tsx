import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PostoGeo, ResultadoGeo, chaveSolta, processarGeo } from '@/lib/geoPlanilha';
import { lerPlanilhaGeo } from '@/lib/geoPlanilhaExcel';
import { Posto, atualizarLocalizacao, inserirPostos } from '@/services/postosService';

type Acao = 'novo' | 'preencher' | 'manter' | 'sem_acesso';
interface Item { geo: PostoGeo; acao: Acao; existente?: Posto }

const ROTULO: Record<Acao, { texto: string; variante: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  novo: { texto: 'posto novo', variante: 'default' },
  preencher: { texto: 'preenche localização', variante: 'secondary' },
  manter: { texto: 'já tem localização (mantida)', variante: 'outline' },
  sem_acesso: { texto: 'sem acesso ao estado', variante: 'destructive' },
};

/** Botão + prévia da importação da planilha GEO (localização dos postos). */
export default function ImportarGeoDialog({ postos, onImportado }: { postos: Posto[]; onImportado: () => void }) {
  const { estados } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGeo | null>(null);
  const [arquivo, setArquivo] = useState('');

  // Posto existente pelo nome ou apelido, ignorando maiúsculas, acentos, hífens e espaços.
  const itens: Item[] = useMemo(() => {
    if (!resultado) return [];
    const idx = new Map<string, Posto>();
    for (const p of postos) for (const n of [p.nome, ...p.apelidos]) if (!idx.has(chaveSolta(n))) idx.set(chaveSolta(n), p);
    return resultado.postos.map(geo => {
      const existente = idx.get(chaveSolta(geo.nome));
      const uf = existente?.uf ?? geo.uf;
      const acao: Acao = !estados.includes(uf) ? 'sem_acesso'
        : !existente ? 'novo' : existente.latitude == null ? 'preencher' : 'manter';
      return { geo, acao, existente };
    });
  }, [resultado, postos, estados]);

  const conta = (a: Acao) => itens.filter(i => i.acao === a).length;
  const comAviso = itens.filter(i => i.geo.avisos.length > 0 && (i.acao === 'novo' || i.acao === 'preencher')).length;

  async function ler(file: File) {
    setLendo(true);
    try {
      const linhas = await lerPlanilhaGeo(await file.arrayBuffer());
      if (linhas.length === 0) throw new Error('Nenhuma aba com as colunas Nome Posto / Latitude / Longitude.');
      setResultado(processarGeo(linhas));
      setArquivo(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler a planilha');
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function importar() {
    setGravando(true);
    try {
      const novos = itens.filter(i => i.acao === 'novo')
        .map(i => ({ nome: i.geo.nome, uf: i.geo.uf, latitude: i.geo.latitude, longitude: i.geo.longitude }));
      await inserirPostos(novos);
      const preencher = itens.filter(i => i.acao === 'preencher');
      for (const i of preencher) await atualizarLocalizacao(i.existente!.id, i.geo.latitude, i.geo.longitude);
      toast.success(`${novos.length} posto(s) novo(s) e ${preencher.length} localização(ões) preenchida(s).`);
      setResultado(null);
      onImportado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar');
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) ler(f); }} />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={lendo}>
        {lendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
        Importar planilha GEO
      </Button>

      <Dialog open={!!resultado} onOpenChange={o => !o && !gravando && setResultado(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar localizações — {arquivo}</DialogTitle>
            <DialogDescription>
              Confira antes de gravar. Nomes limpos (sem função/turno) e linhas do mesmo lugar juntadas em um posto.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{conta('novo')} postos novos</Badge>
            <Badge variant="secondary">{conta('preencher')} localizações a preencher</Badge>
            <Badge variant="outline">{conta('manter')} já com localização (mantidas)</Badge>
            {conta('sem_acesso') > 0 && <Badge variant="destructive">{conta('sem_acesso')} sem acesso ao estado</Badge>}
            <Badge variant="outline">{resultado?.ignoradas.length ?? 0} linhas ignoradas (sem coordenada ou em vermelho)</Badge>
          </div>
          {comAviso > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {comAviso} posto(s) com coordenada suspeita na planilha (repetida ou fora do estado). Serão importados
              assim mesmo — depois corrija em Postos, clicando no mapa.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Coordenada</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map(i => (
                <TableRow key={i.geo.nome}>
                  <TableCell>
                    <div className="font-medium">{i.existente?.nome ?? i.geo.nome}</div>
                    {i.geo.origem.length > 1 && (
                      <div className="text-xs text-muted-foreground">{i.geo.origem.length} linhas da planilha</div>
                    )}
                    {i.geo.avisos.map(a => (
                      <div key={a} className="text-xs text-amber-700 dark:text-amber-400">⚠ {a}</div>
                    ))}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{i.existente?.uf ?? i.geo.uf}</Badge></TableCell>
                  <TableCell className="text-xs tabular-nums whitespace-nowrap">
                    {i.geo.latitude.toFixed(5)}, {i.geo.longitude.toFixed(5)}
                  </TableCell>
                  <TableCell><Badge variant={ROTULO[i.acao].variante}>{ROTULO[i.acao].texto}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResultado(null)} disabled={gravando}>Cancelar</Button>
            <Button onClick={importar} disabled={gravando || conta('novo') + conta('preencher') === 0}>
              {gravando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Importar {conta('novo') + conta('preencher')} posto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
