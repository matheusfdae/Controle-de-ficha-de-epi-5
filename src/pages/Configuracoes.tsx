import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, PenTool, Image as ImageIcon, Save, Trash2, Upload, Bell, Plus, Pencil, Building, Stamp } from 'lucide-react';
import { AppConfig, getConfig, saveConfig } from '@/services/configService';
import { Empresa, listEmpresas, saveEmpresa, deleteEmpresa } from '@/services/empresasService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/SignaturePad';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';

export default function Configuracoes() {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [novaAssinatura, setNovaAssinatura] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const carimboRef = useRef<HTMLInputElement>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaDialog, setEmpresaDialog] = useState(false);
  const [empresaEdit, setEmpresaEdit] = useState<Partial<Empresa>>({});

  const reloadEmpresas = () => setEmpresas(listEmpresas());

  useEffect(() => {
    setConfig(getConfig());
    reloadEmpresas();
  }, []);

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const openNewEmpresa = () => { setEmpresaEdit({}); setEmpresaDialog(true); };
  const openEditEmpresa = (e: Empresa) => { setEmpresaEdit(e); setEmpresaDialog(true); };
  const handleSaveEmpresa = () => {
    if (!empresaEdit.nome?.trim()) { toast.error('Informe o nome da empresa'); return; }
    saveEmpresa(empresaEdit as any);
    reloadEmpresas();
    setEmpresaDialog(false);
    toast.success('Empresa salva');
  };
  const handleDeleteEmpresa = (id: string) => {
    if (!confirm('Excluir esta empresa?')) return;
    deleteEmpresa(id);
    reloadEmpresas();
    toast.success('Empresa removida');
  };

  const handleSave = () => {
    saveConfig(config);
    toast.success('Configurações salvas!');
  };

  const handleSaveAssinatura = () => {
    if (!novaAssinatura) {
      toast.error('Desenhe a nova assinatura primeiro');
      return;
    }
    const updated = saveConfig({ assinaturaEmpresa: novaAssinatura });
    setConfig(updated);
    setNovaAssinatura('');
    toast.success('Assinatura da empresa atualizada!');
  };

  const handleRemoveAssinatura = () => {
    const updated = saveConfig({ assinaturaEmpresa: '' });
    setConfig(updated);
    toast.success('Assinatura removida');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('Imagem muito grande (máx 1MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const updated = saveConfig({ logoDataUrl: dataUrl });
      setConfig(updated);
      toast.success('Logo atualizada!');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    const updated = saveConfig({ logoDataUrl: '' });
    setConfig(updated);
    toast.success('Logo removida');
  };

  const handleCarimboUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem muito grande (máx 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const updated = saveConfig({ carimboEmpresa: reader.result as string });
      setConfig(updated);
      toast.success('Carimbo atualizado!');
    };
    reader.readAsDataURL(file);
  };
  const handleRemoveCarimbo = () => {
    const updated = saveConfig({ carimboEmpresa: '' });
    setConfig(updated);
    toast.success('Carimbo removido');
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <BackButton />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h2>
          <p className="text-sm text-muted-foreground">Personalize os dados da empresa, logo e assinatura padrão.</p>
        </div>

        <Tabs defaultValue="empresa" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="empresa"><Building2 className="h-4 w-4 mr-1.5" />Empresa</TabsTrigger>
            <TabsTrigger value="empresas"><Building className="h-4 w-4 mr-1.5" />Empresas</TabsTrigger>
            <TabsTrigger value="logo"><ImageIcon className="h-4 w-4 mr-1.5" />Logo</TabsTrigger>
            <TabsTrigger value="assinatura"><PenTool className="h-4 w-4 mr-1.5" />Assinatura</TabsTrigger>
            <TabsTrigger value="carimbo"><Stamp className="h-4 w-4 mr-1.5" />Carimbo</TabsTrigger>
            <TabsTrigger value="alertas"><Bell className="h-4 w-4 mr-1.5" />Alertas</TabsTrigger>
          </TabsList>

          {/* EMPRESA */}
          <TabsContent value="empresa">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados da Empresa</CardTitle>
                <CardDescription>Aparecem no cabeçalho da ficha e no PDF gerado.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nome da Empresa</Label>
                  <Input value={config.empresaNome} onChange={e => update('empresaNome', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Subtítulo / Segmento</Label>
                  <Input value={config.empresaSubtitulo} onChange={e => update('empresaSubtitulo', e.target.value)} placeholder="Ex: Segurança e Serviços" />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input value={config.empresaCNPJ} onChange={e => update('empresaCNPJ', e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label>Responsável (Nome)</Label>
                  <Input value={config.responsavelNome} onChange={e => update('responsavelNome', e.target.value)} placeholder="Nome do responsável" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={config.empresaEndereco} onChange={e => update('empresaEndereco', e.target.value)} placeholder="Endereço completo" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Cargo do Responsável</Label>
                  <Input value={config.responsavelCargo} onChange={e => update('responsavelCargo', e.target.value)} />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" /> Salvar Alterações</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EMPRESAS (múltiplas) */}
          <TabsContent value="empresas">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Empresas Cadastradas</CardTitle>
                  <CardDescription>Cadastre várias empresas para escolher ao criar uma ficha.</CardDescription>
                </div>
                <Button size="sm" onClick={openNewEmpresa}>
                  <Plus className="h-4 w-4 mr-1.5" /> Nova Empresa
                </Button>
              </CardHeader>
              <CardContent>
                {empresas.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Building className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma empresa cadastrada ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {empresas.map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{e.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[e.cnpj, e.subtitulo, e.responsavelNome].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEditEmpresa(e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteEmpresa(e.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={empresaDialog} onOpenChange={setEmpresaDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{empresaEdit.id ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Nome *</Label>
                    <Input value={empresaEdit.nome || ''} onChange={e => setEmpresaEdit(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Subtítulo / Segmento</Label>
                    <Input value={empresaEdit.subtitulo || ''} onChange={e => setEmpresaEdit(p => ({ ...p, subtitulo: e.target.value }))} />
                  </div>
                  <div>
                    <Label>CNPJ</Label>
                    <Input value={empresaEdit.cnpj || ''} onChange={e => setEmpresaEdit(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Input value={empresaEdit.responsavelNome || ''} onChange={e => setEmpresaEdit(p => ({ ...p, responsavelNome: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Endereço</Label>
                    <Input value={empresaEdit.endereco || ''} onChange={e => setEmpresaEdit(p => ({ ...p, endereco: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Cargo do Responsável</Label>
                    <Input value={empresaEdit.responsavelCargo || ''} onChange={e => setEmpresaEdit(p => ({ ...p, responsavelCargo: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEmpresaDialog(false)}>Cancelar</Button>
                  <Button onClick={handleSaveEmpresa}><Save className="h-4 w-4 mr-2" />Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="logo">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logo da Empresa</CardTitle>
                <CardDescription>Recomendado PNG transparente, no máximo 1MB.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center min-h-[140px] border-2 border-dashed rounded-lg bg-muted/30">
                  {config.logoDataUrl ? (
                    <img src={config.logoDataUrl} alt="Logo" className="max-h-32 object-contain" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhuma logo carregada</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <div className="flex gap-2 justify-end">
                  {config.logoDataUrl && (
                    <Button variant="outline" onClick={handleRemoveLogo}>
                      <Trash2 className="h-4 w-4 mr-2" /> Remover
                    </Button>
                  )}
                  <Button onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Enviar Imagem
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ASSINATURA */}
          <TabsContent value="assinatura">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assinatura Padrão da Empresa</CardTitle>
                <CardDescription>
                  Esta assinatura será preenchida automaticamente como "responsável pela entrega" em novas fichas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {config.assinaturaEmpresa && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Assinatura atual</Label>
                    <div className="border rounded-lg p-4 bg-white flex items-center justify-center">
                      <img src={config.assinaturaEmpresa} alt="Assinatura" className="max-h-24 object-contain" />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={handleRemoveAssinatura}>
                        <Trash2 className="h-4 w-4 mr-2" /> Remover assinatura
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {config.assinaturaEmpresa ? 'Substituir por nova assinatura' : 'Desenhar nova assinatura'}
                  </Label>
                  <SignaturePad label="" onSave={setNovaAssinatura} />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveAssinatura} disabled={!novaAssinatura}>
                    <Save className="h-4 w-4 mr-2" /> Salvar Assinatura
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CARIMBO */}
          <TabsContent value="carimbo">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Carimbo da Empresa</CardTitle>
                <CardDescription>
                  Envie uma imagem (PNG/JPG). Ela será aplicada como carimbo sobre a assinatura da empresa, com efeito de tinta e leve rotação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center min-h-[180px] border-2 border-dashed rounded-lg bg-muted/30 relative overflow-hidden">
                  {config.carimboEmpresa ? (
                    <img
                      src={config.carimboEmpresa}
                      alt="Carimbo"
                      className="max-h-40 object-contain"
                      style={{
                        transform: 'rotate(-8deg)',
                        opacity: 0.78,
                        filter: 'contrast(1.4) saturate(0) brightness(0.9) sepia(1) hue-rotate(-40deg) saturate(6)',
                        mixBlendMode: 'multiply',
                      }}
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Stamp className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum carimbo carregado</p>
                    </div>
                  )}
                </div>
                <input ref={carimboRef} type="file" accept="image/*" className="hidden" onChange={handleCarimboUpload} />
                <div className="flex gap-2 justify-end">
                  {config.carimboEmpresa && (
                    <Button variant="outline" onClick={handleRemoveCarimbo}>
                      <Trash2 className="h-4 w-4 mr-2" /> Remover
                    </Button>
                  )}
                  <Button onClick={() => carimboRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Enviar Imagem
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          {/* ALERTAS */}
          <TabsContent value="alertas">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alertas de Vencimento</CardTitle>
                <CardDescription>Defina quantos dias antes do vencimento um EPI deve ser sinalizado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-xs">
                  <Label>Dias de antecedência para alerta</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={config.diasAlertaVencimento}
                    onChange={e => update('diasAlertaVencimento', parseInt(e.target.value) || 30)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Quantos dias antes do vencimento o EPI deve ser sinalizado.
                  </p>
                </div>
                <div className="max-w-xs">
                  <Label>Validade do EPI (em dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={config.diasValidadeEpi}
                    onChange={e => update('diasValidadeEpi', parseInt(e.target.value) || 180)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Quantos dias após a assinatura da ficha o EPI será considerado vencido. Ex.: 180 = 6 meses.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" /> Salvar</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
