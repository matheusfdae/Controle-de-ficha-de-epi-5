import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';

export const TODOS_ESTADOS = '__todos__';

interface Props {
  value: string;
  onChange: (uf: string) => void;
  id?: string;
  /** Mostra a opção "Todos os estados" (valor TODOS_ESTADOS), para filtros. */
  permitirTodos?: boolean;
  /** Estados a esconder (ex.: a origem, no destino de uma transferência). */
  excluir?: string[];
  /** Lista própria em vez dos estados do usuário (ex.: destino de transferência). */
  opcoes?: string[];
  className?: string;
  placeholder?: string;
}

/** Estados (UF) que o usuário logado pode acessar. */
export default function EstadoSelect({
  value, onChange, id, permitirTodos, excluir = [], opcoes, className, placeholder = 'Estado',
}: Props) {
  const { estados } = useAuth();
  const lista = (opcoes ?? estados).filter(uf => !excluir.includes(uf));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {permitirTodos && lista.length > 1 && <SelectItem value={TODOS_ESTADOS}>Todos os estados</SelectItem>}
        {lista.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
        {lista.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Nenhum estado liberado para o seu usuário. Peça ao administrador (tela Usuários).
          </p>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Estado escolhido numa tela, lembrado entre visitas. Começa no único estado
 * do usuário quando ele só tem um; volta para vazio se o estado lembrado
 * deixou de ser acessível.
 */
export function useEstadoLembrado(chave: string, permitirTodos = false): [string, (uf: string) => void] {
  const { estados } = useAuth();
  const [uf, setUf] = useState<string>(() => {
    try { return localStorage.getItem(`uf:${chave}`) ?? ''; } catch { return ''; }
  });
  useEffect(() => {
    if (!estados.length) return;
    const valido = estados.includes(uf) || (permitirTodos && uf === TODOS_ESTADOS && estados.length > 1);
    if (!valido) setUf(estados.length === 1 ? estados[0] : permitirTodos ? TODOS_ESTADOS : estados[0]);
  }, [estados, uf, permitirTodos]);
  const escolher = (novo: string) => {
    setUf(novo);
    try { localStorage.setItem(`uf:${chave}`, novo); } catch { /* armazenamento indisponível */ }
  };
  return [uf, escolher];
}
