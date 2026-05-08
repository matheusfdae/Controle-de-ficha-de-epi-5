import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, PenTool, Image as ImageIcon, Save, Trash2, Upload, Bell, Plus, Pencil, Building } from 'lucide-react';
import { AppConfig, getConfig, saveConfig } from '@/services/configService';
import { Empresa, listEmpresas, saveEmpresa, deleteEmpresa } from '@/services/empresasService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/SignaturePad';
import { toast } from 'sonner';

export default function Configuracoes() {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [novaAssinatura, setNovaAssinatura] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
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

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h2>
          <p className="text-sm text-muted-foreground">Personalize os dados da empresa, logo e assinatura padrão.</p>
        </div>

        <Tabs defaultValue="empresa" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="empresa"><Building2 className="h-4 w-4 mr-1.5" />Empresa</TabsTrigger>
            <TabsTrigger value="logo"><ImageIcon className="h-4 w-4 mr-1.5" />Logo</TabsTrigger>
            <TabsTrigger value="assinatura"><PenTool className="h-4 w-4 mr-1.5" />Assinatura</TabsTrigger>
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

          {/* LOGO */}
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

          {/* ALERTAS */}
          <TabsContent value="alertas">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alertas de Vencimento</CardTitle>
                <CardDescription>Defina quantos dias antes do vencimento um EPI deve ser sinalizado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-xs">
                  <Label>Dias de antecedência</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={config.diasAlertaVencimento}
                    onChange={e => update('diasAlertaVencimento', parseInt(e.target.value) || 30)}
                  />
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
