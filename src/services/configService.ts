import { supabase } from '@/integrations/supabase/client';

const KEY = 'epi_config';
const REMOTE_KEY = 'global';

export interface AppConfig {
  empresaNome: string;
  empresaSubtitulo: string;
  empresaCNPJ: string;
  empresaEndereco: string;
  responsavelNome: string;
  responsavelCargo: string;
  logoDataUrl: string; // base64 image
  assinaturaEmpresa: string; // base64 PNG da assinatura padrão
  diasAlertaVencimento: number;
  diasValidadeEpi: number;
  carimboEmpresa: string; // base64 PNG do carimbo
}

const DEFAULTS: AppConfig = {
  empresaNome: 'GRUPO 5 ESTRELAS',
  empresaSubtitulo: 'SEGURANÇA E SERVIÇOS',
  empresaCNPJ: '',
  empresaEndereco: '',
  responsavelNome: '',
  responsavelCargo: 'Técnico de Segurança do Trabalho',
  logoDataUrl: '',
  assinaturaEmpresa: '',
  diasAlertaVencimento: 30,
  diasValidadeEpi: 180,
  carimboEmpresa: '',
};

export function getConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persistLocal(config: AppConfig) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const { data, error } = await (supabase.from as any)('app_config')
      .select('value')
      .eq('key', REMOTE_KEY)
      .maybeSingle();
    if (error) throw error;
    if (data?.value && typeof data.value === 'object') {
      const merged = { ...DEFAULTS, ...(data.value as Partial<AppConfig>) };
      persistLocal(merged);
      return merged;
    }
  } catch (error) {
    console.warn('Falha ao carregar configurações do backend', error);
  }
  return getConfig();
}

export async function saveConfig(config: Partial<AppConfig>): Promise<AppConfig> {
  const merged = { ...getConfig(), ...config };
  persistLocal(merged);

  const { error } = await (supabase.from as any)('app_config').upsert({
    key: REMOTE_KEY,
    value: merged,
  });
  if (error) throw error;

  return merged;
}

export function resetConfig() {
  localStorage.removeItem(KEY);
}
