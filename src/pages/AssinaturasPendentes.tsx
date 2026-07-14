import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ClipboardSignature, RefreshCw, Search, Tablet } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichas, criarTokenAssinatura } from '@/services/fichaService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';

export default function AssinaturasPendentes() {
  const navigate = useNavigate();
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [gerandoId, setGerandoId] = useState<string | null>(null);

  const irAssinar = async (fichaId: string) => {
    setGerandoId(fichaId);
    const token = await criarTokenAssinatura(fichaId);
    setGerandoId(null);
    if (!token) { toast.error('Erro ao gerar link de assinatura'); return; }
    navigate(`/assinar/${token}`);
  };

  const load = async () => {
    setLoading(true);
    const all = await getFichas();
    setFichas(all.filter(f => f.status !== 'assinada'));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // realtime: atualiza assim que admin criar/alterar uma ficha
    const ch = supabase
      .channel('fichas-pendentes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas_epi' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = fichas.filter(f =>
    !q ||
    f.nomeFuncionario.toLowerCase().includes(q.toLowerCase()) ||
    f.funcao.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-5">
        <BackButton />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary">
              <Tablet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Assinaturas Pendentes</h2>
              <p className="text-sm text-muted-foreground">Selecione uma ficha para assinar neste dispositivo</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou função…"
            className="pl-9 h-11"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Carregando…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <ClipboardSignature className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma ficha pendente no momento.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(f => (
              <Card key={f.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{f.nomeFuncionario}</h3>
                      <Badge variant="secondary">Pendente</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {f.funcao} · {f.itens.length} {f.itens.length === 1 ? 'item' : 'itens'} · criada em {new Date(f.criadoEm).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Button size="lg" onClick={() => irAssinar(f.id)} disabled={gerandoId === f.id}>
                    <ClipboardSignature className="h-4 w-4 mr-2" /> {gerandoId === f.id ? 'Gerando link…' : 'Assinar'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
