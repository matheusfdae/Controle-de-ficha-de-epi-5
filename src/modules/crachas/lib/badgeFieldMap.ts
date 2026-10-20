/**
 * Unified field mapping: maps template field bindings to employee DB row values.
 * Used by both BadgeRenderer (preview) and pdfGenerator (final output).
 */

export interface BadgeEmployeeData {
  id: string;
  full_name: string;
  employee_id: string;
  cnv: string;
  role: string;
  company: string;
  photo_url: string;
  valid_until: string;
  rg: string;
  cpf: string;
  blood_type: string;
  request_reason: string;
  access_level: string;
  qr_value: string;
  issue_date: string;
  phone: string;
  address: string;
}

export const BADGE_FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome Completo',
  employee_id: 'Matrícula',
  cnv: 'CNV',
  role: 'Cargo',
  company: 'Empresa',
  photo_url: 'Foto',
  valid_until: 'Validade',
  rg: 'RG',
  cpf: 'CPF',
  blood_type: 'Tipo Sanguíneo',
  qr_value: 'QR Code',
  issue_date: 'Data de Emissão',
  phone: 'Telefone',
  address: 'Local de Trabalho',
};

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D+/g, '');
}

/**
 * Convert a DB employee row into a flat BadgeEmployeeData for rendering.
 */
export function mapEmployeeToBadgeData(emp: Record<string, any>): BadgeEmployeeData {
  return {
    id: emp.id || '',
    full_name: emp.full_name || '',
    employee_id: emp.employee_id || '',
    cnv: digitsOnly(emp.cnv),
    role: emp.role || '',
    company: emp.company || '',
    photo_url: emp.photo_url || '',
    valid_until: (() => {
      const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
      if (emp.valid_until) return new Date(emp.valid_until).toLocaleDateString('pt-BR', dateOpts);
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      return oneYearFromNow.toLocaleDateString('pt-BR', dateOpts);
    })(),
    rg: emp.rg || '',
    cpf: emp.cpf || '',
    blood_type: emp.blood_type || '',
    request_reason: emp.request_reason || '',
    access_level: emp.access_level || '',
    qr_value: emp.qr_value || emp.employee_id || '',
    issue_date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    phone: emp.phone || '',
    address: emp.address || '',
  };
}

/**
 * Get the value for a given field binding from badge data.
 */
export function getFieldValue(data: BadgeEmployeeData, fieldBinding: string | null, nameDisplayMode?: string): string {
  if (!fieldBinding) return '';
  const value = (data as any)[fieldBinding] ?? '';
  if (fieldBinding === 'full_name' && value) {
    const mode = nameDisplayMode || 'short';
    if (mode === 'none') return '';
    if (mode === 'full') return value;
    const parts = value.split(/\s+/).filter(Boolean);
    if (mode === 'short') return parts.slice(0, 2).join(' ');
    if (mode.startsWith('parts:')) {
      const indexes = mode.slice(6).split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      return indexes.map(i => parts[i]).filter(Boolean).join(' ');
    }
  }
  return value;
}

export function getBadgeFieldLabel(fieldBinding: string): string {
  return BADGE_FIELD_LABELS[fieldBinding] || fieldBinding;
}

export function getUnsupportedBadgeBindings(requiredBindings: string[]): string[] {
  return [...new Set(requiredBindings.filter((binding) => !(binding in BADGE_FIELD_LABELS)))];
}

/**
 * Validate that all required field bindings have values.
 * Returns an array of missing field labels.
 */
export function validateBadgeData(
  data: BadgeEmployeeData,
  requiredBindings: string[],
): string[] {
  return requiredBindings
    .filter((binding) => !getFieldValue(data, binding))
    .map(getBadgeFieldLabel);
}
