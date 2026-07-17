import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Mail } from 'lucide-react';
import { useCanManageInvites } from '@/hooks/useCanManageInvites';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type InviteRole = 'edit' | 'view';

// Convite por e-mail via Clerk Invitations API (admin-invite-user).
// Gate próprio (useCanManageInvites/publicMetadata.role), separado do
// isAdmin do sistema de fichas/estoque — a checagem que vale de verdade é a
// do backend (verifyEditor), esta tela só evita mostrar o formulário a
// quem não tem o papel.
export default function Convites() {
  const canManage = useCanManageInvites();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('view');
  const [departamento, setDepartamento] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canManage) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-invite-user', {
        body: {
          email_address: email.trim().toLowerCase(),
          role,
          departamento: departamento.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Convite enviado!');
      setEmail('');
      setDepartamento('');
      setRole('view');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao enviar convite');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <UserPlus className="h-5 w-5" /> Convidar usuário
        </h1>
        <p className="text-sm text-muted-foreground">
          Envia um convite por e-mail (só domínio corporativo) via Clerk.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Novo convite
          </CardTitle>
          <CardDescription>A pessoa recebe um e-mail com um link para definir a senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail corporativo</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@grupo5estrelas.com.br" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Permissão</Label>
              <Select value={role} onValueChange={v => setRole(v as InviteRole)}>
                <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Visualização</SelectItem>
                  <SelectItem value="edit">Edição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="departamento">Departamento (opcional)</Label>
              <Input id="departamento" value={departamento} onChange={e => setDepartamento(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>Enviar convite</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
