export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'qrcode' | 'rectangle' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  fieldBinding?: string;
  nameDisplayMode?: string; // 'full' | 'short' | 'none' | 'parts:0,2,4'
  staticValue?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  showLabel?: boolean;
  opacity?: number;
  rotation?: number;
  objectFit?: 'contain' | 'cover' | 'fill';
  zIndex: number;
  side: 'front' | 'back';
  locked?: boolean;
}

export interface EditorState {
  elements: CanvasElement[];
  selectedId: string | null;
  zoom: number;
  templateName: string;
  templateDescription: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundImageUrl?: string;
  backBackgroundImageUrl?: string;
  hasBackSide: boolean;
  activeSide: 'front' | 'back';
  backgroundColor: string;
  isDragging: boolean;
  isResizing: boolean;
  dragOffset: { x: number; y: number };
  resizeHandle: string | null;
}

export const FIELD_BINDINGS = [
  { value: 'full_name', label: 'Nome Completo' },
  { value: 'employee_id', label: 'Matrícula' },
  { value: 'role', label: 'Cargo / Função' },
  { value: 'company', label: 'Empresa' },
  { value: 'photo_url', label: 'Foto' },
  { value: 'valid_until', label: 'Data de Validade' },
  { value: 'issue_date', label: 'Data de Emissão' },
  { value: 'rg', label: 'RG' },
  { value: 'cpf', label: 'CPF' },
  { value: 'blood_type', label: 'Tipo Sanguíneo' },
  { value: 'access_level', label: 'Nível de Acesso' },
  { value: 'qr_value', label: 'QR Code' },
  { value: 'request_reason', label: 'Motivo da Solicitação' },
  { value: 'phone', label: 'Telefone' },
  { value: 'address', label: 'Endereço' },
];

export const ELEMENT_PRESETS = [
  { type: 'text' as const, label: 'Texto', icon: 'Type', defaultWidth: 40, defaultHeight: 6 },
  { type: 'image' as const, label: 'Imagem', icon: 'Image', defaultWidth: 20, defaultHeight: 25 },
  { type: 'qrcode' as const, label: 'QR Code', icon: 'QrCode', defaultWidth: 15, defaultHeight: 15 },
  { type: 'rectangle' as const, label: 'Retângulo', icon: 'Square', defaultWidth: 30, defaultHeight: 15 },
  { type: 'line' as const, label: 'Linha', icon: 'Minus', defaultWidth: 40, defaultHeight: 0.5 },
];
