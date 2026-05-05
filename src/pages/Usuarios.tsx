import { useState } from 'react';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, ShieldCheck, UserPlus, Trash2, Pencil, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Usuarios() {
  const { user, isAdmin, listUsers, addUser, updateUser, deleteUser } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const users = listUsers();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', nome: '', password: '', role: 'operador' as UserRole });

  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', role: 'operador' as UserRole, password: '' });

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

  const handleAdd = () => {
    if (!form.username.trim() || !form.password.trim() || !form.nome.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    const res = addUser({ ...form, username: form.username.trim().toLowerCase() });
    if (!res.ok) {
      toast.error(res.error || 'Erro ao adicionar');
      return;
    }
    toast.success('Usuário criado!');
    setForm({ username: '', nome: '', password: '', role: 'operador' });
    setOpen(false);
    setRefresh(r => r + 1);
  };

  const startEdit = (username: string, nome: string, role: UserRole) => {
    setEditing(username);
    setEditForm({ nome, role, password: '' });
  };

  const saveEdit = () => {
    if (!editing) return;
    const patch: any = { nome: editForm.nome, role: editForm.role };
    if (editForm.password) patch.password = editForm.password;
    updateUser(editing, patch);
    toast.success('Usuário atualizado!');
    setEditing(null);
    setRefresh(r => r + 1);
  };

  const handleDelete = (username: string) => {
    if (username === user?.username) {
      toast.error('Você não pode excluir o próprio usuário');
      return;
    }
    deleteUser(username);
    toast.success('Usuário removido');
    setRefresh(r => r + 1);
  };

  return (
    <div className="p-4 lg:p-8 pb-20" key={refresh}>
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
                  <Label>Usuário (login)</Label>
                  <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="ex: joao.silva" />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
                <div>
                  <Label>Perfil</Label>
                  <Select value={form.role} onValueChange={(v: UserRole) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador (acesso total)</SelectItem>
                      <SelectItem value="operador">Operador (somente leitura)</SelectItem>
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
              <strong>Administrador</strong> pode criar, editar e excluir fichas e configurações.
              <strong> Operador</strong> apenas visualiza informações.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.map(u => (
              <div key={u.username} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition">
                <div className={`p-2 rounded-lg ${u.role === 'admin' ? 'bg-primary/10' : 'bg-muted'}`}>
                  {u.role === 'admin'
                    ? <ShieldCheck className="h-4 w-4 text-primary" />
                    : <Lock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {u.nome} {u.username === user?.username && <span className="text-xs text-muted-foreground">(você)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                </div>
                <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                  {u.role === 'admin' ? 'Administrador' : 'Operador'}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => startEdit(u.username, u.nome, u.role)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive" disabled={u.username === user?.username}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O usuário <strong>{u.nome}</strong> perderá o acesso ao sistema.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(u.username)} className="bg-destructive">
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
                    <SelectItem value="operador">Operador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nova senha (opcional)</Label>
                <Input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="Deixe em branco para manter" />
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
