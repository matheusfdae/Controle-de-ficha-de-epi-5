import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { getMinhaAssinatura, removerMinhaAssinatura, salvarMinhaAssinatura } from '@/services/assinaturaUsuarioService';

const mensagem = (e: unknown, padrao: string) =>
  (e as { message?: string } | null)?.message || padrao;

/** Assinatura do usuário logado: vê a atual, desenha outra, salva ou remove. */
export default function MinhaAssinatura() {
  const { user } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    getMinhaAssinatura(userId)
      .then(a => { if (ativo) setAtual(a); })
      .catch(e => toast.error(mensagem(e, 'Falha ao carregar sua assinatura')))
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [userId]);

  const salvar = async () => {
    if (!user || !nova) return;
    setSalvando(true);
    try {
      await salvarMinhaAssinatura(user.id, nova);
      setAtual(nova);
      setNova('');
      toast.success('Sua assinatura foi salva!');
    } catch (e) {
      toast.error(mensagem(e, 'Falha ao salvar assinatura'));
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!user) return;
    try {
      await removerMinhaAssinatura(user.id);
      setAtual('');
      toast.success('Assinatura removida');
    } catch (e) {
      toast.error(mensagem(e, 'Falha ao remover assinatura'));
    }
  };

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      {atual && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sua assinatura atual</Label>
          <div className="border rounded-lg p-4 bg-white flex items-center justify-center">
            <img src={atual} alt="Sua assinatura" className="max-h-24 object-contain" />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={remover}>
              <Trash2 className="h-4 w-4 mr-2" /> Remover assinatura
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          {atual ? 'Substituir por nova assinatura' : 'Desenhar sua assinatura'}
        </Label>
        <SignaturePad label="" onSave={setNova} />
      </div>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={!nova || salvando}>
          <Save className="h-4 w-4 mr-2" /> {salvando ? 'Salvando…' : 'Salvar assinatura'}
        </Button>
      </div>
    </div>
  );
}
