import { useState, useEffect } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ShieldAlert, ShieldCheck, UserPlus, Pencil, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
}

export default function Usuarios() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', nome: '', password: '', role: 'colaborador' as UserRole });

  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', role: 'colaborador' as UserRole });

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, email, nome_completo');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const rows: Row[] = (profiles || []).map((p: any) => {
      const userRoles = (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role);
      const role: UserRole =
        userRoles.includes('admin') ? 'admin'
        : userRoles.includes('rh') ? 'rh'
        : userRoles.includes('supervisor') ? 'supervisor'
        : 'colaborador';
      return { id: p.id, email: p.email, nome: p.nome_completo || p.email, role };
    });
    setUsers(rows);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
            <h3 className="font-semibold text-foreground">Acesso restrito</h3>
            <p className="text-sm text-muted-foreground">Apenas administradores podem acessar a gestão de usuários.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.nome.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (form.password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome_completo: form.nome },
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const newId = data.user?.id;
    if (newId && form.role !== 'colaborador') {
      // trigger já adicionou colaborador. Adiciona o role escolhido.
      await supabase.from('user_roles').insert({ user_id: newId, role: form.role });
    }
    toast.success('Usuário criado!');
    setForm({ email: '', nome: '', password: '', role: 'colaborador' });
    setOpen(false);
    setTimeout(load, 500);
  };

  const startEdit = (row: Row) => {
    setEditing(row);
    setEditForm({ nome: row.nome, role: row.role });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await supabase.from('profiles').update({ nome_completo: editForm.nome }).eq('id', editing.id);
    if (editForm.role !== editing.role) {
      // remove o antigo, adiciona o novo (mantém colaborador como base)
      await supabase.from('user_roles').delete().eq('user_id', editing.id).eq('role', editing.role);
      if (editForm.role !== 'colaborador') {
        await supabase.from('user_roles').insert({ user_id: editing.id, role: editForm.role });
      }
    }
    toast.success('Usuário atualizado!');
    setEditing(null);
    load();
  };

  const roleLabel = (r: UserRole) =>
    r === 'admin' ? 'Administrador' : r === 'rh' ? 'RH' : r === 'supervisor' ? 'Supervisor' : 'Colaborador';

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Usuários</h2>
            <p className="text-sm text-muted-foreground">
              Administre quem pode acessar e modificar o sistema.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Usuário</DialogTitle>
                <DialogDescription>Crie credenciais para um novo membro da equipe.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail (login)</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                </div>
                <div>
                  <Label>Perfil</Label>
                  <Select value={form.role} onValueChange={(v: UserRole) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="rh">RH</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="colaborador">Colaborador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleAdd}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuários cadastrados</CardTitle>
            <CardDescription>
              Gerencie nome e perfil dos usuários do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            )}
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition">
                <div className={`p-2 rounded-lg ${u.role === 'admin' ? 'bg-primary/10' : 'bg-muted'}`}>
                  {u.role === 'admin'
                    ? <ShieldCheck className="h-4 w-4 text-primary" />
                    : <Lock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {u.nome} {u.id === user?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                  {roleLabel(u.role)}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => startEdit(u)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} />
              </div>
              <div>
                <Label>Perfil</Label>
                <Select value={editForm.role} onValueChange={(v: UserRole) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="rh">RH</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
