import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { EPIFicha, EPIItem, MotivoEntrega, Turno } from '@/types/epi';
import { generateId, saveFicha } from '@/services/fichaService';
import SignaturePad from '@/components/SignaturePad';

export default function NovaFicha() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    nomeFuncionario: '',
    funcao: '',
    telefone: '',
    cpf: '',
    matricula: '',
    motivo: 'admissao' as MotivoEntrega,
    turno: 'diurno' as Turno,
    setor: '',
    empresa: '',
    dataEntrega: today,
    observacoes: '',
  });

  const [itens, setItens] = useState<EPIItem[]>([
    { id: generateId(), descricao: 'Gandola em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Calça em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Sapato Antiderrapante Spider Pro', ca: '48583', quantidade: 1, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
  ]);

  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState('');

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    setItens(prev => [...prev, {
      id: generateId(),
      descricao: '',
      ca: '',
      quantidade: 1,
      tamanho: '',
      dataEntrega: today,
      postoServico: '',
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
    if (!form.nomeFuncionario.trim()) {
      toast.error('Informe o nome do funcionário');
      return;
    }
    if (!form.dataEntrega) {
      toast.error('Informe a data de entrega');
      return;
    }
    const checkedItems = itens.filter(i => i.recebido);
    if (asSigned && checkedItems.length === 0) {
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

  const motivoLabels: Record<MotivoEntrega, string> = {
    admissao: 'Admissão',
    substituicao: 'Substituição',
    perda_extravio: 'Perda/Extravio',
    demissao: 'Demissão',
    complemento: 'Complemento',
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
            <CardTitle className="text-base">Dados do Funcionário</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome do Funcionário *</Label>
              <Input id="nome" value={form.nomeFuncionario} onChange={e => updateField('nomeFuncionario', e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label htmlFor="funcao">Função</Label>
              <Input id="funcao" value={form.funcao} onChange={e => updateField('funcao', e.target.value)} placeholder="Ex: ASG, Líder ASG" />
            </div>
            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" value={form.telefone} onChange={e => updateField('telefone', e.target.value)} placeholder="(61) 9xxxx-xxxx" />
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
              <Label>Motivo</Label>
              <Select value={form.motivo} onValueChange={v => updateField('motivo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(motivoLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Turno</Label>
              <Select value={form.turno} onValueChange={v => updateField('turno', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diurno">Diurno</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
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
            <CardTitle className="text-base">Itens de Uniforme/EPI</CardTitle>
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
                <div className="flex-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    placeholder="Descrição do item"
                    value={item.descricao}
                    onChange={e => updateItem(item.id, 'descricao', e.target.value)}
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
                  <Input
                    placeholder="Tam. / Nº"
                    value={item.tamanho}
                    onChange={e => updateItem(item.id, 'tamanho', e.target.value)}
                  />
                  <Input
                    placeholder="Posto de Serviço"
                    value={item.postoServico}
                    onChange={e => updateItem(item.id, 'postoServico', e.target.value)}
                  />
                  <div>
                    <Input
                      type="date"
                      value={item.dataValidade || ''}
                      onChange={e => updateItem(item.id, 'dataValidade', e.target.value)}
                      title="Data de validade"
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">Validade</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {itens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado.</p>
            )}
          </CardContent>
        </Card>

        {/* Observations */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={form.observacoes}
              onChange={e => updateField('observacoes', e.target.value)}
              placeholder="Observações adicionais..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Signatures */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <SignaturePad label="Assinatura do Funcionário" onSave={setAssinaturaColaborador} />
            <SignaturePad label="Assinatura do Responsável pela Entrega" onSave={setAssinaturaResponsavel} />
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
