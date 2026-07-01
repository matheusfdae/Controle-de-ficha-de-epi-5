const KEY = 'epi_config';

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

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const merged = { ...getConfig(), ...config };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export function resetConfig() {
  localStorage.removeItem(KEY);
}
