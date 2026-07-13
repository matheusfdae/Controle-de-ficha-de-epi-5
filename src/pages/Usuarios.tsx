import { useState, useEffect } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, ShieldCheck, UserPlus, Pencil, Trash2, RefreshCw, KeyRound, KeySquare, Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import { PermissionsMatrix } from '@/components/PermissionsMatrix';
import {
  MODULES, ROLE_PRESETS, ROLE_LABELS, ROLE_BADGE_CLASS, RolePreset,
  PermissionMap, emptyPermissions, permissionsToRows, rowsToPermissions,
} from '@/lib/permissions';

type ManageableRole = Exclude<RolePreset, never>;
const ROLE_OPTIONS: ManageableRole[] = ['admin', 'rh', 'supervisor', 'almoxarife', 'colaborador'];

interface Row {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  ativo: boolean;
}

const emptyForm = {
  nome: '',
  email: '',
  password: '',
  sendInvite: true,
  role: 'colaborador' as ManageableRole,
  permissions: ROLE_PRESETS.colaborador,
};

export default function Usuarios() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    nome: '', email: '', role: 'colaborador' as ManageableRole, permissions: emptyPermissions(),
  });
  const [pwdTarget, setPwdTarget] = useState<Row | null>(null);
  const [pwdValue, setPwdValue] = useState('');

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
        : userRoles.includes('almoxarife') ? 'almoxarife'
        : 'colaborador';
      return { id: p.id, email: p.email, nome: p.nome_completo || p.email, role, ativo: p.ativo !== false };
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

  const gerarSenha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, password: s, sendInvite: false }));
    setShowPwd(true);
  };

  const applyRolePreset = (role: ManageableRole, target: 'new' | 'edit') => {
    const preset = ROLE_PRESETS[role];
    if (target === 'new') setForm(f => ({ ...f, role, permissions: { ...preset } }));
    else setEditForm(f => ({ ...f, role, permissions: { ...preset } }));
  };

  const handleAdd = async () => {
    if (!form.nome.trim() || !form.email.trim()) {
      toast.error('Preencha nome e e-mail corporativo'); return;
    }
    if (!form.email.includes('@')) { toast.error('E-mail inválido'); return; }
    if (!form.sendInvite && form.password.length < 6) {
      toast.error('Senha manual precisa de pelo menos 6 caracteres'); return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.sendInvite ? '' : form.password,
        role: form.role,
        send_invite: form.sendInvite,
        redirect_to: `${window.location.origin}/reset-password`,
        permissions: permissionsToRows(form.permissions),
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Falha ao criar usuário');
      return;
    }
    if (form.sendInvite) {
      toast.success(`Convite enviado para ${form.email}. O usuário definirá a senha pelo link do e-mail.`);
    } else {
      toast.success(`Usuário criado. Senha temporária definida — troca obrigatória no 1º acesso.`);
    }
    setForm({ ...emptyForm });
    setShowPwd(false);
    setOpen(false);
    setTimeout(load, 400);
  };

  const startEdit = async (row: Row) => {
    setEditing(row);
    const { data: perms } = await supabase.from('user_permissions')
      .select('module, can_view, can_create, can_edit, can_delete')
      .eq('user_id', row.id);
    const permMap = perms && perms.length > 0
      ? rowsToPermissions(perms as any)
      : ROLE_PRESETS[(row.role as ManageableRole) ?? 'colaborador'];
    setEditForm({
      nome: row.nome,
      email: row.email || '',
      role: (ROLE_OPTIONS.includes(row.role as ManageableRole) ? row.role : 'colaborador') as ManageableRole,
      permissions: permMap,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const novoEmail = (editForm.email || '').trim().toLowerCase();
      if (!novoEmail || !novoEmail.includes('@')) {
        toast.error('E-mail inválido'); return;
      }
      // Se o e-mail mudou, atualiza via edge function (auth + profile)
      if (novoEmail !== (editing.email || '').toLowerCase()) {
        const { data, error } = await supabase.functions.invoke('admin-update-email', {
          body: { user_id: editing.id, new_email: novoEmail },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || 'Falha ao atualizar e-mail');
        }
      }

      const { error: profErr } = await supabase.from('profiles').update({ nome_completo: editForm.nome }).eq('id', editing.id);
      if (profErr) throw profErr;

      // Sincroniza papel: remove os "elevados" e insere apenas o novo (colaborador é sempre garantido)
      const elevated = ['admin', 'rh', 'supervisor', 'almoxarife'];
      await supabase.from('user_roles').delete().eq('user_id', editing.id).in('role', elevated as any);
      if (editForm.role !== 'colaborador') {
        const { error } = await supabase.from('user_roles').insert({ user_id: editing.id, role: editForm.role as any });
        if (error) throw error;
      }

      // Substitui todas as permissões
      await supabase.from('user_permissions').delete().eq('user_id', editing.id);
      const rows = permissionsToRows(editForm.permissions).map(r => ({ ...r, user_id: editing.id }));
      if (rows.length > 0) {
        const { error } = await supabase.from('user_permissions').insert(rows);
        if (error) throw error;
      }

      toast.success('Usuário atualizado!');
      setEditing(null);
      load();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao atualizar usuário');
    }
  };

  const handleDelete = async (row: Row) => {
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: row.id },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Falha ao excluir');
      return;
    }
    toast.success(`Usuário ${row.nome} excluído definitivamente!`);
    load();
  };

  const handleResendInvite = async (row: Row) => {
    const { data, error } = await supabase.functions.invoke('admin-resend-invite', {
      body: { email: row.email, redirect_to: `${window.location.origin}/reset-password` },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Falha ao reenviar convite');
      return;
    }
    toast.success(`Link de acesso reenviado para ${row.email}`);
  };

  const handleDirectSetPassword = async () => {
    if (!pwdTarget) return;
    if (pwdValue.length < 6) { toast.error('Senha mínima de 6 caracteres'); return; }
    const { error } = await supabase.functions.invoke('admin-set-password', {
      body: { user_id: pwdTarget.id, new_password: pwdValue, force_change: true },
    });
    if (error) { toast.error(error.message || 'Falha ao definir senha'); return; }
    toast.success(`Senha redefinida. ${pwdTarget.nome} precisará trocá-la no próximo acesso.`);
    setPwdTarget(null); setPwdValue('');
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Usuários</h2>
            <p className="text-sm text-muted-foreground">
              Cadastre por e-mail corporativo, defina papel e marque permissões por módulo.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setShowPwd(false); setForm({ ...emptyForm }); } }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Usuário</DialogTitle>
                <DialogDescription>
                  O usuário receberá um e-mail com link para criar a própria senha no primeiro acesso.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="dados">
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="permissoes">Permissões</TabsTrigger>
                </TabsList>
                <TabsContent value="dados" className="space-y-3 pt-3">
                  <div>
                    <Label>Nome completo</Label>
                    <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: João da Silva" />
                  </div>
                  <div>
                    <Label>E-mail corporativo</Label>
                    <Input type="email" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="joao.silva@empresa.com.br" />
                  </div>
                  <div>
                    <Label>Papel</Label>
                    <Select value={form.role} onValueChange={(v) => applyRolePreset(v as ManageableRole, 'new')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      As permissões vêm marcadas pelo perfil e podem ser ajustadas na próxima aba.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        id="sendInvite"
                        type="checkbox"
                        checked={form.sendInvite}
                        onChange={(e) => setForm({ ...form, sendInvite: e.target.checked, password: e.target.checked ? '' : form.password })}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="sendInvite" className="cursor-pointer">
                        Enviar link de definição de senha por e-mail (recomendado)
                      </Label>
                    </div>
                    {!form.sendInvite && (
                      <div>
                        <Label>Senha temporária</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input type={showPwd ? 'text' : 'password'} value={form.password}
                              onChange={e => setForm({ ...form, password: e.target.value })}
                              placeholder="Mínimo 6 caracteres" className="pr-10" />
                            <button type="button" onClick={() => setShowPwd(s => !s)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <Button type="button" variant="outline" size="icon" onClick={gerarSenha} title="Gerar senha">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Troca será obrigatória no primeiro acesso.</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="permissoes" className="pt-3">
                  <PermissionsMatrix value={form.permissions} onChange={(p) => setForm({ ...form, permissions: p })} />
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? 'Salvando...' : (form.sendInvite ? 'Enviar convite' : 'Criar usuário')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuários cadastrados</CardTitle>
            <CardDescription>Gerencie nome, papel e permissões dos usuários do sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            )}
            {users.map(u => {
              const badgeClass = ROLE_BADGE_CLASS[(u.role as RolePreset)] ?? ROLE_BADGE_CLASS.colaborador;
              return (
                <div key={u.id} className={`flex items-center gap-3 p-3 rounded-lg border transition ${!u.ativo ? 'opacity-60' : 'hover:bg-muted/30'}`}>
                  <div className="p-2 rounded-lg bg-muted">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {u.nome}
                      {u.id === user?.id && <span className="text-xs text-muted-foreground ml-1">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge className={`${badgeClass} border-0`}>{ROLE_LABELS[(u.role as RolePreset)] ?? u.role}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(u)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Reenviar convite por e-mail">
                        <Mail className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reenviar convite?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Um novo link para definir a senha será enviado para <strong>{u.email}</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleResendInvite(u)}>Enviar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="ghost" size="icon" title="Definir senha manualmente"
                    onClick={() => { setPwdTarget(u); setPwdValue(''); }}>
                    <KeySquare className="h-4 w-4" />
                  </Button>
                  {u.id !== user?.id && (
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
                            O usuário <strong>{u.nome}</strong> será excluído DEFINITIVAMENTE do sistema, junto com suas fichas e integrações. Esta ação não pode ser desfeita.
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
              );
            })}
          </CardContent>
        </Card>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
              <DialogDescription>{editing?.email}</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="dados">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="permissoes">Permissões</TabsTrigger>
              </TabsList>
              <TabsContent value="dados" className="space-y-3 pt-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail corporativo</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="usuario@empresa.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alterar o e-mail muda o login do usuário (confirmado automaticamente).
                  </p>
                </div>
                <div>
                  <Label>Papel</Label>
                  <Select value={editForm.role} onValueChange={(v) => applyRolePreset(v as ManageableRole, 'edit')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trocar o papel reaplica as permissões padrão desse perfil.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="permissoes" className="pt-3">
                <PermissionsMatrix
                  value={editForm.permissions}
                  onChange={(p) => setEditForm({ ...editForm, permissions: p })}
                />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!pwdTarget} onOpenChange={(o) => !o && setPwdTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Definir nova senha</DialogTitle>
              <DialogDescription>
                Defina uma senha diretamente para <strong>{pwdTarget?.nome}</strong>.
                O usuário precisará trocá-la no próximo acesso.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Nova senha</Label>
              <Input type="text" value={pwdValue} onChange={e => setPwdValue(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwdTarget(null)}>Cancelar</Button>
              <Button onClick={handleDirectSetPassword}>Definir senha</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
