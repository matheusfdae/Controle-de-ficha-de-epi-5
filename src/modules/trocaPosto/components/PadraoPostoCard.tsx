import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PadraoComNomes } from '../lib/trocaPostoService';

/**
 * O que a Senior lança junto com o posto (cargo, local e centro de custo do
 * posto, tabela R017CAR). Cargo diferente do atual fica em destaque.
 */
export default function PadraoPostoCard({ padrao, cargoAtual, cargoAtualNome, manterCargo }: {
  padrao: PadraoComNomes; cargoAtual: string | null; cargoAtualNome: string | null; manterCargo: boolean;
}) {
  const cargoMuda = !!padrao.cargo && !!cargoAtual && padrao.cargo !== cargoAtual && !manterCargo;
  const rotulo = (cod: string | null | undefined, nome: string | null | undefined) => (!cod ? '—' : nome ? `${cod} – ${nome}` : cod);
  return (
    <div className={cn('rounded-md border p-3 text-sm space-y-1',
      cargoMuda ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'bg-muted/40')}>
      <p className="font-medium flex items-center gap-1.5">
        {cargoMuda ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Info className="h-4 w-4 text-muted-foreground" />}
        A Senior lança junto com o posto:
      </p>
      <ul className="text-xs space-y-0.5 pl-6 list-disc">
        <li>
          Cargo: {manterCargo
            ? <strong>mantém {rotulo(cargoAtual, cargoAtualNome)}</strong>
            : <strong className={cn(cargoMuda && 'text-amber-800 dark:text-amber-300')}>{rotulo(padrao.cargo, padrao.cargo_nome)}</strong>}
          {cargoMuda && <> (hoje: {rotulo(cargoAtual, cargoAtualNome)}) — <strong>muda a função</strong></>}
        </li>
        <li>Centro de custo: <strong>{rotulo(padrao.centroCusto, padrao.centro_custo_nome)}</strong></li>
        <li>Local: <strong>{padrao.local ?? '—'}</strong></li>
      </ul>
    </div>
  );
}
