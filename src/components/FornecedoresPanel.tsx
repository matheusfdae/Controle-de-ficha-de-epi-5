import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Save, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { cnpjValido, formatarCnpj, soDigitos } from '@/lib/cnpj';
import { Fornecedor, listFornecedores, salvarFornecedor, excluirFornecedor } from '@/services/fornecedoresService';

const vazio = (): Partial<Fornecedor> => ({ nome: '', cnpj: '', nicho: '', ativo: true, observacao: '' });

export default function FornecedoresPanel() {
  const { can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<Partial<Fornecedor> | null>(null);

  const carregar = () => listFornecedores().then(setLista).catch(e => toast.error(e.message));
  useEffect(() => { carregar(); }, []);

  const termo = busca.toLowerCase();
  const filtrados = lista.filter(f =>
    f.nome.toLowerCase().includes(termo) || (f.nicho ?? '').toLowerCase().includes(termo)
    || (f.cnpj ?? '').includes(soDigitos(busca) || '\u0000'));

  async function salvar() {
    if (!form?.nome?.trim()) { toast.error('Informe o nome'); return; }
    if (form.cnpj && !cnpjValido(form.cnpj)) { toast.error('CNPJ inválido (dígito verificador não confere)'); return; }
    try {
      await salvarFornecedor(form as Fornecedor);
      toast.success('Fornecedor salvo');
      setForm(null);
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
  }

  async function excluir(f: Fornecedor) {
    if (!(await confirm(`Excluir o fornecedor ${f.nome}? As entradas já lançadas continuam no histórico.`))) return;
    try { await excluirFornecedor(f.id); setForm(null); carregar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir'); }
  }

  const cnpjDigitado = soDigitos(form?.cnpj);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input placeholder="Buscar por nome, nicho ou CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-sm" />
        {can('estoque', 'create') && (
          <Button onClick={() => setForm(vazio())}><Plus className="h-4 w-4 mr-1" /> Cadastrar fornecedor</Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtrados.map(f => (
          <Card key={f.id} className={`cursor-pointer hover:border-primary/50 transition-colors ${f.ativo ? '' : 'opacity-60'}`}
            onClick={() => can('estoque', 'edit') && setForm({ ...f, cnpj: formatarCnpj(f.cnpj) })}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{f.nome}</h3>
                {!f.ativo && <Badge variant="secondary">Inativo</Badge>}
              </div>
              <p className="text-sm font-mono text-muted-foreground">
                {f.cnpj ? formatarCnpj(f.cnpj) : <span className="text-amber-600 dark:text-amber-400 font-sans">CNPJ não informado</span>}
              </p>
              {f.nicho && <p className="text-xs text-muted-foreground">{f.nicho}</p>}
            </CardContent>
          </Card>
        ))}
        {filtrados.length === 0 && (
          <p className="text-center text-muted-foreground py-12 col-span-full">
            <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum fornecedor encontrado.
          </p>
        )}
      </div>

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label htmlFor="f-nome">Razão social *</Label>
                <Input id="f-nome" value={form.nome ?? ''} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div><Label htmlFor="f-cnpj">CNPJ</Label>
                <Input id="f-cnpj" value={form.cnpj ?? ''} placeholder="00.000.000/0000-00"
                  onChange={e => setForm({ ...form, cnpj: e.target.value })}
                  onBlur={() => setForm({ ...form, cnpj: formatarCnpj(form.cnpj) })} />
                {cnpjDigitado.length === 14 && !cnpjValido(cnpjDigitado) && (
                  <p className="text-xs text-destructive mt-1">Dígito verificador não confere — confira o número.</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">É pelo CNPJ que a nota (XML ou PDF) é ligada ao fornecedor.</p>
              </div>
              <div><Label htmlFor="f-nicho">O que fornece</Label>
                <Input id="f-nicho" value={form.nicho ?? ''} placeholder="Uniformes, calçados, EPIs..." onChange={e => setForm({ ...form, nicho: e.target.value })} /></div>
              <div><Label htmlFor="f-obs">Observação</Label>
                <Textarea id="f-obs" rows={2} value={form.observacao ?? ''} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch id="f-ativo" checked={form.ativo ?? true} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                <Label htmlFor="f-ativo">Ativo</Label>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between gap-2">
            {form?.id && can('estoque', 'delete') && (
              <Button variant="destructive" onClick={() => excluir(form as Fornecedor)}>Excluir</Button>
            )}
            <Button onClick={salvar}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
