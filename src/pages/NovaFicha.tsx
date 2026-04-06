import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Trash2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { EPIFicha, EPIItem } from '@/types/epi';
import { generateId, saveFicha } from '@/services/fichaService';
import SignaturePad from '@/components/SignaturePad';

const defaultItems: Omit<EPIItem, 'id'>[] = [
  { nome: 'Capacete de Segurança', ca: '', quantidade: 1, dataEntrega: '', recebido: false },
  { nome: 'Luvas de Proteção', ca: '', quantidade: 1, dataEntrega: '', recebido: false },
  { nome: 'Óculos de Proteção', ca: '', quantidade: 1, dataEntrega: '', recebido: false },
  { nome: 'Botina de Segurança', ca: '', quantidade: 1, dataEntrega: '', recebido: false },
  { nome: 'Protetor Auricular', ca: '', quantidade: 1, dataEntrega: '', recebido: false },
];

export default function NovaFicha() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];
  
  const [form, setForm] = useState({
    nomeColaborador: '',
    cpf: '',
    matricula: '',
    cargo: '',
    setor: '',
    empresa: '',
    dataEntrega: today,
  });

  const [itens, setItens] = useState<EPIItem[]>(
    defaultItems.map(item => ({ ...item, id: generateId(), dataEntrega: today }))
  );

  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState('');

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    setItens(prev => [...prev, {
      id: generateId(),
      nome: '',
      ca: '',
      quantidade: 1,
      dataEntrega: today,
      recebido: false,
    }]);
  };

  const removeItem = (id: string) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof EPIItem, value: any) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSave = (asSigned: boolean) => {
    if (!form.nomeColaborador.trim()) {
      toast.error('Informe o nome do colaborador');
      return;
    }
    if (!form.dataEntrega) {
      toast.error('Informe a data de entrega');
      return;
    }
    const checkedItems = itens.filter(i => i.recebido);
    if (checkedItems.length === 0) {
      toast.error('Marque ao menos um item de EPI');
      return;
    }

    if (asSigned && (!assinaturaColaborador || !assinaturaResponsavel)) {
      toast.error('É necessário ambas as assinaturas para finalizar');
      return;
    }

    const ficha: EPIFicha = {
      id: generateId(),
      ...form,
      itens,
      assinaturaColaborador: assinaturaColaborador || undefined,
      assinaturaResponsavel: assinaturaResponsavel || undefined,
      status: asSigned ? 'assinada' : 'pendente',
      criadoEm: new Date().toISOString(),
      assinadoEm: asSigned ? new Date().toISOString() : undefined,
    };

    saveFicha(ficha);
    toast.success(asSigned ? 'Ficha assinada com sucesso!' : 'Ficha salva como pendente');
    navigate(`/ficha/${ficha.id}`);
  };

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Nova Ficha de EPI</h1>
        </div>

        {/* Employee Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Colaborador</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome do Colaborador *</Label>
              <Input id="nome" value={form.nomeColaborador} onChange={e => updateField('nomeColaborador', e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={form.cpf} onChange={e => updateField('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label htmlFor="matricula">Matrícula</Label>
              <Input id="matricula" value={form.matricula} onChange={e => updateField('matricula', e.target.value)} placeholder="Nº matrícula" />
            </div>
            <div>
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" value={form.cargo} onChange={e => updateField('cargo', e.target.value)} placeholder="Cargo" />
            </div>
            <div>
              <Label htmlFor="setor">Setor</Label>
              <Input id="setor" value={form.setor} onChange={e => updateField('setor', e.target.value)} placeholder="Setor" />
            </div>
            <div>
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" value={form.empresa} onChange={e => updateField('empresa', e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div>
              <Label htmlFor="data">Data de Entrega *</Label>
              <Input id="data" type="date" value={form.dataEntrega} onChange={e => updateField('dataEntrega', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* EPI Items */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Itens de EPI</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <Checkbox
                  checked={item.recebido}
                  onCheckedChange={(v) => updateItem(item.id, 'recebido', !!v)}
                  className="mt-2"
                />
                <div className="flex-1 grid gap-2 sm:grid-cols-4">
                  <Input
                    placeholder="Nome do EPI"
                    value={item.nome}
                    onChange={e => updateItem(item.id, 'nome', e.target.value)}
                    className="sm:col-span-2"
                  />
                  <Input
                    placeholder="C.A."
                    value={item.ca}
                    onChange={e => updateItem(item.id, 'ca', e.target.value)}
                  />
                  <Input
                    placeholder="Qtd"
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={e => updateItem(item.id, 'quantidade', parseInt(e.target.value) || 1)}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {itens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado. Clique em "Adicionar" acima.</p>
            )}
          </CardContent>
        </Card>

        {/* Signatures */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <SignaturePad
              label="Assinatura do Colaborador"
              onSave={setAssinaturaColaborador}
            />
            <SignaturePad
              label="Assinatura do Responsável pela Entrega"
              onSave={setAssinaturaResponsavel}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="flex-1" onClick={() => handleSave(false)}>
            <Save className="h-4 w-4 mr-2" /> Salvar como Pendente
          </Button>
          <Button className="flex-1" onClick={() => handleSave(true)}>
            <ShieldCheck className="h-4 w-4 mr-2" /> Assinar e Finalizar
          </Button>
        </div>
      </div>
    </div>
  );
}

import { ShieldCheck } from 'lucide-react';
