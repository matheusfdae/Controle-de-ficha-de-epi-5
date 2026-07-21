import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Tela de troca de senha obrigatória (profiles.must_change_password), para
// quando um admin definiu uma senha temporária (admin-create-user /
// admin-set-password / admin-resend-invite). O Clerk exige a senha atual
// para trocar via user.updatePassword — aqui é a senha temporária que o
// usuário acabou de usar para logar.
export default function ResetPassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const { user: clerkUser } = useUser();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('As senhas não conferem');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter ao menos 6 caracteres');
      return;
    }
    if (!clerkUser) return;

    setBusy(true);
    try {
      await clerkUser.updatePassword({ currentPassword, newPassword: password });
      if (user?.id) {
        await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id);
        await refreshUser();
      }
      toast.success('Senha atualizada!');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.message || err?.message || 'Falha ao atualizar senha');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Nova senha</CardTitle>
          <CardDescription>Defina sua nova senha de acesso</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p0">Senha temporária (atual)</Label>
              <Input id="p0" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p1">Nova senha</Label>
              <Input id="p1" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p2">Confirmar senha</Label>
              <Input id="p2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={6} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>Salvar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
