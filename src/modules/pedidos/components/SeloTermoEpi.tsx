import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { FileSignature } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/** Selo do Termo de EPI do pedido (assinaturas feitas / total), com link para o termo. */
export default function SeloTermoEpi({ pedidoId }: { pedidoId: string }) {
  const [termo, setTermo] = useState<{ id: string; total: number; assinadas: number } | null>(null);
  useEffect(() => {
    supabase.from('termos_epi_coletivos').select('id, termos_epi_coletivos_itens(data_assinatura)').eq('pedido_id' as never, pedidoId).maybeSingle()
      .then(({ data }) => {
        const d = data as { id: string; termos_epi_coletivos_itens: { data_assinatura: string | null }[] } | null;
        setTermo(d ? { id: d.id, total: d.termos_epi_coletivos_itens.length, assinadas: d.termos_epi_coletivos_itens.filter(i => i.data_assinatura).length } : null);
      });
  }, [pedidoId]);
  if (!termo) return <Badge variant="outline" className="text-muted-foreground font-normal">Termo de EPI não montado</Badge>;
  const completo = termo.total > 0 && termo.assinadas === termo.total;
  return (
    <Link to={`/termo-coletivo/${termo.id}`}>
      <Badge variant="outline" className={`gap-1 font-normal hover:bg-muted ${completo ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400' : 'border-amber-500/50 text-amber-700 dark:text-amber-400'}`}>
        <FileSignature className="h-3 w-3" /> Termo de EPI: {termo.assinadas}/{termo.total} assinadas
      </Badge>
    </Link>
  );
}
