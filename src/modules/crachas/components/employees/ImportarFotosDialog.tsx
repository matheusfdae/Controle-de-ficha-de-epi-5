import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FolderOpen, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { casarFotos, enviarFotoColaborador, type ColaboradorFoto, type FotoCasada, type FotoLida } from '@/modules/crachas/lib/importarFotos';

/** Quantas fotos sobem ao mesmo tempo. */
const PARALELO = 4;

/**
 * Importa uma pasta de fotos (sistema antigo de crachás): liga cada arquivo ao
 * colaborador pela matrícula ou pelo nome, mostra o resumo e só envia depois
 * de confirmar. Foto que o colaborador já tem só é trocada se marcar "Substituir".
 */
export function ImportarFotosDialog({ open, onOpenChange, colaboradores, onConcluido }: {
  open: boolean; onOpenChange: (o: boolean) => void; colaboradores: ColaboradorFoto[]; onConcluido: () => void;
}) {
  const pasta = useRef<HTMLInputElement>(null);
  const arquivos = useRef<HTMLInputElement>(null);
  const [lidos, setLidos] = useState<File[]>([]);
  const [substituir, setSubstituir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [falhas, setFalhas] = useState<{ nome: string; erro: string }[]>([]);
  const [fim, setFim] = useState<{ enviadas: number } | null>(null);

  const r = useMemo(() => casarFotos(lidos, colaboradores), [lidos, colaboradores]);
  const jaTem = r.casadas.filter(c => c.colaborador.photo_url);
  const aEnviar = substituir ? r.casadas : r.casadas.filter(c => !c.colaborador.photo_url);
  const porNome = r.casadas.filter(c => c.como === 'nome').length;

  const limpar = () => { setLidos([]); setFeitos(0); setFalhas([]); setFim(null); };
  const escolher = (lista: FileList | null) => { limpar(); setLidos(lista ? [...lista] : []); };

  const importar = async () => {
    setEnviando(true); setFeitos(0); setFalhas([]);
    const fila = [...aEnviar];
    const erros: { nome: string; erro: string }[] = [];
    let ok = 0;
    const trabalhar = async () => {
      for (let c = fila.shift(); c; c = fila.shift()) {
        try { await enviarFotoColaborador(c.colaborador.id, c.foto.arquivo); ok++; }
        catch (e) { erros.push({ nome: c.foto.arquivo.name, erro: (e as Error).message }); }
        setFeitos(n => n + 1);
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, trabalhar));
    setFalhas(erros); setFim({ enviadas: ok }); setEnviando(false);
    onConcluido();
    if (erros.length) toast.warning(`${ok} foto(s) importada(s); ${erros.length} com erro.`);
    else toast.success(`${ok} foto(s) importada(s).`);
  };

  const lista = (titulo: string, itens: (FotoLida | FotoCasada)[], dica: string) => itens.length > 0 && (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{titulo} ({itens.length})</summary>
      <p className="text-xs text-muted-foreground mt-1">{dica}</p>
      <ul className="mt-2 max-h-40 overflow-y-auto text-xs space-y-0.5">
        {itens.map(i => {
          const f = 'foto' in i ? i.foto : i;
          return <li key={f.arquivo.name} className="truncate">{f.arquivo.name}{'colaborador' in i && ` → ${i.colaborador.full_name}`}</li>;
        })}
      </ul>
    </details>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!enviando) { onOpenChange(o); if (!o) limpar(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-primary" /> Importar fotos</DialogTitle>
          <DialogDescription>
            Escolha a pasta de fotos. Cada arquivo é ligado ao colaborador pela matrícula do nome do arquivo
            (ex.: <code>002002233_VALDEIR_ALVES.jpg</code>) ou, se a matrícula não servir, pelo nome completo.
          </DialogDescription>
        </DialogHeader>

        <input ref={pasta} type="file" className="hidden" multiple accept="image/*"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={e => escolher(e.target.files)} />
        <input ref={arquivos} type="file" className="hidden" multiple accept="image/jpeg,image/png,image/webp" onChange={e => escolher(e.target.files)} />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={enviando} onClick={() => pasta.current?.click()}>
            <FolderOpen className="h-4 w-4" /> Escolher pasta
          </Button>
          <Button variant="ghost" className="gap-2" disabled={enviando} onClick={() => arquivos.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Ou escolher arquivos
          </Button>
        </div>

        {lidos.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{r.casadas.length}</p><p className="text-xs text-muted-foreground">com colaborador</p></div>
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{jaTem.length}</p><p className="text-xs text-muted-foreground">já têm foto</p></div>
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{r.semColaborador.length + r.ambiguas.length}</p><p className="text-xs text-muted-foreground">sem colaborador</p></div>
              <div className="rounded-md border p-2"><p className="text-2xl font-bold">{r.repetidas.length}</p><p className="text-xs text-muted-foreground">repetidas</p></div>
            </div>
            <p className="text-xs text-muted-foreground">
              {lidos.length} arquivo(s) lido(s) · {r.casadas.length - porNome} pela matrícula, {porNome} pelo nome
              {r.ignorados.length > 0 && ` · ${r.ignorados.length} não são foto (ignorados)`}.
            </p>

            <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <Checkbox checked={substituir} disabled={enviando} onCheckedChange={v => setSubstituir(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Substituir as fotos que já existem</span>
                <span className="block text-xs text-muted-foreground">
                  Desmarcado: só recebe foto quem ainda não tem ({r.casadas.length - jaTem.length}). Marcado: os {jaTem.length} que já têm foto também ficam com a da pasta.
                </span>
              </span>
            </label>

            {lista('Ligadas pelo nome', r.casadas.filter(c => c.como === 'nome'), 'A matrícula do arquivo não existe no sistema; o nome completo bateu com um colaborador só. Confira antes de importar.')}
            {lista('Sem colaborador', r.semColaborador, 'Nem a matrícula nem o nome existem no sistema. Essas fotos não entram.')}
            {lista('Nome de mais de uma pessoa', r.ambiguas, 'Sem matrícula válida e o nome é de mais de um colaborador. Essas fotos não entram.')}
            {lista('Repetidas', r.repetidas, 'Outra foto do mesmo colaborador (ex.: "_2"). Vale a primeira; estas não entram.')}

            {(enviando || fim) && (
              <div className="space-y-1">
                <Progress value={aEnviar.length ? (feitos / aEnviar.length) * 100 : 100} />
                <p className="text-xs text-muted-foreground">
                  {enviando ? `Enviando ${feitos} de ${aEnviar.length}… (não feche esta janela)` : `${fim!.enviadas} foto(s) importada(s).`}
                </p>
              </div>
            )}
            {falhas.length > 0 && (
              <details className="rounded-md border border-destructive/40 px-3 py-2 text-sm" open>
                <summary className="cursor-pointer font-medium text-destructive">Com erro ({falhas.length})</summary>
                <ul className="mt-2 max-h-32 overflow-y-auto text-xs">{falhas.map(f => <li key={f.nome}>{f.nome}: {f.erro}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={enviando} onClick={() => { onOpenChange(false); limpar(); }}>{fim ? 'Fechar' : 'Cancelar'}</Button>
          {!fim && (
            <Button className="gap-2" disabled={enviando || aEnviar.length === 0} onClick={importar}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Importar {aEnviar.length} foto(s)
            </Button>
          )}
          {fim && <Badge variant="outline">Concluído</Badge>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
