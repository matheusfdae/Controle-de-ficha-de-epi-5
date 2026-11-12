import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cpfValido, formatarCpf, soDigitos, type Solicitante } from '@/modules/crachas/lib/solicitacaoService';
import { buscarColaborador, type ColaboradorSenior, type ModoBusca } from '../lib/movimentacaoService';

const MODOS: { v: ModoBusca; t: string; dica: string }[] = [
  { v: 'nome', t: 'Nome', dica: 'Digite pelo menos 3 letras do nome' },
  { v: 'matricula', t: 'Matrícula', dica: 'Digite a matrícula' },
  { v: 'cpf', t: 'CPF', dica: '000.000.000-00' },
];

/**
 * Escolhe um colaborador ativo da Senior buscando por nome, matrícula ou CPF.
 * O nome e a matrícula gravados no lançamento são os da Senior.
 */
export default function EscolherColaborador({ quem, valor, mudar, rotulo, excluirId }: {
  quem: Solicitante; valor: ColaboradorSenior | null; mudar: (c: ColaboradorSenior | null) => void;
  rotulo: string; excluirId?: string | null;
}) {
  const [modo, setModo] = useState<ModoBusca>('nome');
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState<ColaboradorSenior[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const seq = useRef(0);

  // Pronto para buscar: nome com 3+ letras, matrícula com dígitos, CPF válido.
  const termo = modo === 'nome' ? texto.trim() : soDigitos(texto);
  const pronto = modo === 'nome' ? termo.replace(/\s/g, '').length >= 3 : modo === 'matricula' ? termo.length >= 1 : cpfValido(termo);

  useEffect(() => {
    if (valor || !pronto) { setLista(null); setErro(''); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBuscando(true); setErro('');
      try {
        const r = await buscarColaborador(quem, modo, termo);
        if (n === seq.current) setLista(r);
      } catch (e) { if (n === seq.current) { setErro((e as Error).message); setLista(null); } }
      finally { if (n === seq.current) setBuscando(false); }
    }, modo === 'nome' ? 400 : 600);
    return () => clearTimeout(t);
  }, [quem, modo, termo, pronto, valor]);

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <UserCheck className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight break-words">{valor.nome}</p>
          <p className="text-xs text-muted-foreground">Matrícula {valor.matricula}{valor.cargo ? ` · ${valor.cargo}` : ''}</p>
          {valor.local && <p className="text-[11px] text-muted-foreground truncate">{valor.local}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => { mudar(null); setTexto(''); }}>
          <X className="h-4 w-4" /> Trocar
        </Button>
      </div>
    );
  }

  const dica = MODOS.find(m => m.v === modo)!.dica;
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border p-0.5 text-sm" role="radiogroup" aria-label={`Buscar ${rotulo} por`}>
        {MODOS.map(m => (
          <button key={m.v} type="button" role="radio" aria-checked={modo === m.v}
            onClick={() => { setModo(m.v); setTexto(''); setLista(null); }}
            className={cn('px-3 py-1 rounded', modo === m.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            {m.t}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input className="pl-8 pr-8" autoComplete="off" aria-label={`Buscar ${rotulo}`} placeholder={dica}
          inputMode={modo === 'nome' ? 'text' : 'numeric'}
          value={modo === 'cpf' ? formatarCpf(texto) : texto}
          onChange={e => setTexto(modo === 'nome' ? e.target.value.slice(0, 80) : soDigitos(e.target.value).slice(0, modo === 'cpf' ? 11 : 9))} />
        {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {modo === 'cpf' && termo.length === 11 && !cpfValido(termo) && <p className="text-xs text-destructive">CPF inválido.</p>}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {lista && (
        <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
          {lista.filter(c => c.id !== excluirId).map(c => (
            <button key={c.id} type="button" onClick={() => mudar(c)}
              className="w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none">
              <p className="text-sm font-medium break-words">{c.nome}</p>
              <p className="text-xs text-muted-foreground">Matrícula {c.matricula}{c.cargo ? ` · ${c.cargo}` : ''}{c.local ? ` · ${c.local}` : ''}</p>
            </button>
          ))}
          {lista.filter(c => c.id !== excluirId).length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum colaborador ativo na Senior com esse {modo === 'nome' ? 'nome' : modo === 'cpf' ? 'CPF' : 'número de matrícula'}.</p>
          )}
        </div>
      )}
    </div>
  );
}
