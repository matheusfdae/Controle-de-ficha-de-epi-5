import { useState, useEffect } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, ShieldCheck, UserPlus, Pencil, Lock, Eye, EyeOff, Trash2, RefreshCw, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  ativo: boolean;
}

const LOGIN_DOMAIN = 'sistema.local';

// "João da Silva" → "joao.silva"
function gerarLoginDeNome(nome: string): string {
  const limpo = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const partes = limpo.split(/\s+/).filter(p => p.length > 1 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p));
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes[0]}.${partes[partes.length - 1]}`;
}

export default function Usuarios() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', emailEditado: false, password: '', isAdmin: false });
  const [showPwd, setShowPwd] = useState(false);

  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', role: 'colaborador' as UserRole, isAdmin: false });

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, email, nome_completo, ativo');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const rows: Row[] = (profiles || []).map((p: any) => {
      const userRoles = (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role);
      const role: UserRole =
        userRoles.includes('admin') ? 'admin'
        : userRoles.includes('rh') ? 'rh'
        : userRoles.includes('supervisor') ? 'supervisor'
        : 'colaborador';
      return { id: p.id, email: p.email, nome: p.nome_completo || p.email, role, ativo: p.ativo !== false };
    });
    setUsers(rows);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  // Auto-preenche email quando digita o nome (até o usuário editar manualmente)
  useEffect(() => {
    if (form.emailEditado) return;
    const login = gerarLoginDeNome(form.nome);
    setForm(f => ({ ...f, email: login ? `${login}@${LOGIN_DOMAIN}` : '' }));
  }, [form.nome, form.emailEditado]);

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

  const gerarSenha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, password: s }));
    setShowPwd(true);
  };

  const handleAdd = async () => {
    if (!form.nome.trim() || !form.email.trim() || !form.password.trim()) {
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
    if (newId) {
      // Marca para forçar troca de senha no primeiro acesso
      await supabase.from('profiles').update({ must_change_password: true }).eq('id', newId);
      if (form.isAdmin) {
        await supabase.from('user_roles').insert({ user_id: newId, role: 'admin' as any });
      }
    }
    toast.success(`Usuário criado! Login: ${form.email} — será solicitada a troca de senha no 1º acesso.`);
    setForm({ nome: '', email: '', emailEditado: false, password: '', isAdmin: false });
    setShowPwd(false);
    setOpen(false);
    setTimeout(load, 500);
  };

  const startEdit = (row: Row) => {
    setEditing(row);
    setEditForm({ nome: row.nome, role: row.role, isAdmin: row.role === 'admin' });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await supabase.from('profiles').update({ nome_completo: editForm.nome }).eq('id', editing.id);
    const novoRole: UserRole = editForm.isAdmin ? 'admin' : (editForm.role === 'admin' ? 'colaborador' : editForm.role);
    if (novoRole !== editing.role) {
      if (editing.role !== 'colaborador') {
        await supabase.from('user_roles').delete().eq('user_id', editing.id).eq('role', editing.role as any);
      }
      if (novoRole !== 'colaborador') {
        await supabase.from('user_roles').insert({ user_id: editing.id, role: novoRole as any });
      }
    }
    toast.success('Usuário atualizado!');
    setEditing(null);
    load();
  };

  const handleDelete = async (row: Row) => {
    // Soft delete: inativa o profile (não temos service_role no client para excluir auth.users)
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: false, inativado_em: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Usuário inativado com sucesso!');
    load();
  };

  const handleResetPassword = async (row: Row) => {
    const { error } = await supabase.auth.resetPasswordForEmail(row.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) { toast.error(error.message); return; }
    // Marca para exigir troca de senha no próximo acesso
    await supabase.from('profiles').update({ must_change_password: true }).eq('id', row.id);
    toast.success(`Link de redefinição enviado para ${row.email}`);
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
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setShowPwd(false); setForm({ nome: '', email: '', emailEditado: false, password: '', isAdmin: false }); } }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Usuário</DialogTitle>
                <DialogDescription>O login é gerado automaticamente a partir do nome.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={form.nome}
                    onChange={e => setForm({ ...form, nome: e.target.value })}
                    placeholder="Ex: João da Silva"
                  />
                </div>
                <div>
                  <Label>Login (e-mail)</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value, emailEditado: true })}
                    placeholder="joao.silva@sistema.local"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Gerado automaticamente como nome.sobrenome — edite se quiser.</p>
                </div>
                <div>
                  <Label>Senha</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPwd ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        placeholder="Mínimo 6 caracteres"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button type="button" variant="outline" size="icon" onClick={gerarSenha} title="Gerar senha">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <Label className="cursor-pointer">Administrador</Label>
                    <p className="text-xs text-muted-foreground">Acesso total ao sistema</p>
                  </div>
                  <Switch checked={form.isAdmin} onCheckedChange={(c) => setForm({ ...form, isAdmin: c })} />
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
              Gerencie nome, perfil e acesso dos usuários do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            )}
            {users.map(u => (
              <div key={u.id} className={`flex items-center gap-3 p-3 rounded-lg border transition ${!u.ativo ? 'opacity-50' : 'hover:bg-muted/30'}`}>
                <div className={`p-2 rounded-lg ${u.role === 'admin' ? 'bg-primary/10' : 'bg-muted'}`}>
                  {u.role === 'admin'
                    ? <ShieldCheck className="h-4 w-4 text-primary" />
                    : <Lock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {u.nome} {u.id === user?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                    {!u.ativo && <span className="text-xs text-destructive ml-1">(inativo)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                  {roleLabel(u.role)}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => startEdit(u)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                {u.ativo && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Redefinir senha">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Redefinir senha?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Será enviado um link de redefinição de senha para <strong>{u.email}</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleResetPassword(u)}>Enviar link</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {u.id !== user?.id && u.ativo && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Excluir usuário">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O usuário <strong>{u.nome}</strong> será inativado e perderá o acesso ao sistema. Esta ação pode ser revertida pelo suporte.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(u)}
                        >Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                <Label>Perfil base</Label>
                <Select
                  value={editForm.isAdmin ? 'admin' : editForm.role === 'admin' ? 'colaborador' : editForm.role}
                  onValueChange={(v: UserRole) => setEditForm({ ...editForm, role: v, isAdmin: v === 'admin' })}
                  disabled={editForm.isAdmin}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rh">RH</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <Label className="cursor-pointer">Administrador</Label>
                  <p className="text-xs text-muted-foreground">Acesso total ao sistema</p>
                </div>
                <Switch
                  checked={editForm.isAdmin}
                  onCheckedChange={(c) => setEditForm({ ...editForm, isAdmin: c })}
                />
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
