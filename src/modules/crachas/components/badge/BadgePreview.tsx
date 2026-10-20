import { forwardRef } from 'react';
import { Employee } from '@/modules/crachas/types/badge';
import { cn } from '@/lib/utils';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { BADGE_DESIGN } from '@/modules/crachas/lib/defaultTemplates';

interface TemplateElement {
  id: string;
  element_type: string;
  field_binding: string | null;
  static_value: string | null;
  x_position: number;
  y_position: number;
  width: number | null;
  height: number | null;
  font_size: number | null;
  font_family: string | null;
  font_color: string | null;
  font_weight: string | null;
  text_align: string | null;
  background_color: string | null;
  border_color: string | null;
  border_width: number | null;
  border_radius: number | null;
  side: string;
  z_index: number;
}

interface DBTemplate {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  background_color: string | null;
  background_image_url: string | null;
  elements: TemplateElement[];
}

interface BadgePreviewProps {
  employee: Employee;
  className?: string;
  scale?: number;
  template?: DBTemplate | null;
}

// MM_TO_PX matches the editor's conversion factor
const MM_TO_PX = 3.78;

function getFieldValue(employee: Employee, fieldBinding: string | null): string {
  if (!fieldBinding) return '';
  const map: Record<string, string> = {
    full_name: employee.nomeCompleto,
    employee_id: employee.matricula,
    role: employee.cargo,
    company: employee.empresa,
    unit: employee.unidade,
    valid_until: employee.dataValidade ? new Date(employee.dataValidade).toLocaleDateString('pt-BR') : (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d.toLocaleDateString('pt-BR');
    })(),
    issue_date: new Date().toLocaleDateString('pt-BR'),
    photo_url: employee.fotoUrl || '',
    photo: employee.fotoUrl || '',
    badge_type: employee.tipoCracha || 'Funcionário',
    rg: (employee as any).rg || '',
    cpf: (employee as any).cpf || '',
    blood_type: (employee as any).bloodType || '',
    qr_value: employee.matricula || '',
    request_reason: (employee as any).requestReason || '',
    access_level: (employee as any).accessLevel || '',
  };
  return map[fieldBinding] || '';
}

export const BadgePreview = forwardRef<HTMLDivElement, BadgePreviewProps>(
  ({ employee, className, scale = 1, template }, ref) => {
    const hasElements = template?.elements && template.elements.filter(el => el.side === 'front').length > 0;

    // If we have a DB template with configured elements, render them
    if (template && hasElements) {
      // Total preview size: mm * MM_TO_PX * scale
      const previewWidth = template.width_mm * MM_TO_PX * scale;
      const previewHeight = template.height_mm * MM_TO_PX * scale;

      return (
        <div
          ref={ref}
          className={cn('badge-preview rounded-xl overflow-hidden shadow-lg', className)}
          style={{
            width: previewWidth,
            height: previewHeight,
            position: 'relative',
            backgroundColor: template.background_color || '#ffffff',
          }}
        >
          {template.background_image_url && (
            <img
              src={template.background_image_url}
              alt="Background"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 0 }}
            />
          )}
          {template.elements
            .filter(el => el.side === 'front')
            .sort((a, b) => a.z_index - b.z_index)
            .map((el) => {
              // Positions are in mm from the editor
              const elLeft = el.x_position * MM_TO_PX * scale;
              const elTop = el.y_position * MM_TO_PX * scale;
              const elWidth = (el.width || 20) * MM_TO_PX * scale;
              const elHeight = (el.height || 10) * MM_TO_PX * scale;

              // Image element (editor saves as 'image')
              if (el.element_type === 'image' || el.element_type === 'photo') {
                // If it has a static_value (uploaded logo/image), show that
                if (el.static_value && !el.field_binding) {
                  return (
                    <div
                      key={el.id}
                      className="absolute overflow-hidden"
                      style={{
                        left: elLeft,
                        top: elTop,
                        width: elWidth,
                        height: elHeight,
                        zIndex: el.z_index,
                        borderRadius: 4 * scale,
                      }}
                    >
                      <img src={el.static_value} alt="img" className="w-full h-full object-cover" />
                    </div>
                  );
                }

                // Dynamic photo from employee data
                const photoUrl = getPhotoUrl(getFieldValue(employee, el.field_binding) || employee.fotoUrl);
                return (
                  <div
                    key={el.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: elLeft,
                      top: elTop,
                      width: elWidth,
                      height: elHeight,
                      zIndex: el.z_index,
                      backgroundColor: el.background_color || '#f0f0f0',
                      borderColor: el.border_color || 'transparent',
                      borderWidth: el.border_width || 0,
                      borderStyle: 'solid',
                      borderRadius: 4 * scale,
                    }}
                  >
                    {photoUrl && photoUrl !== '/placeholder.svg' ? (
                      <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground" style={{ fontSize: 20 * scale }}>
                        {employee.nomeCompleto.charAt(0)}
                      </div>
                    )}
                  </div>
                );
              }

              if (el.element_type === 'qrcode') {
                return (
                  <div
                    key={el.id}
                    className="absolute flex items-center justify-center bg-muted/30"
                    style={{
                      left: elLeft,
                      top: elTop,
                      width: elWidth,
                      height: elHeight,
                      zIndex: el.z_index,
                      borderRadius: 4 * scale,
                    }}
                  >
                    <span style={{ fontSize: 8 * scale }} className="text-muted-foreground">QR</span>
                  </div>
                );
              }

              if (el.element_type === 'rectangle') {
                return (
                  <div
                    key={el.id}
                    className="absolute"
                    style={{
                      left: elLeft,
                      top: elTop,
                      width: elWidth,
                      height: elHeight,
                      zIndex: el.z_index,
                      backgroundColor: el.background_color || 'rgba(59,130,246,0.1)',
                      borderColor: el.border_color || 'transparent',
                      borderWidth: el.border_width || 0,
                      borderStyle: 'solid',
                      borderRadius: el.border_radius ? el.border_radius * MM_TO_PX * scale : 0,
                    }}
                  />
                );
              }

              if (el.element_type === 'line') {
                return (
                  <div
                    key={el.id}
                    className="absolute flex items-center"
                    style={{
                      left: elLeft,
                      top: elTop,
                      width: elWidth,
                      height: elHeight,
                      zIndex: el.z_index,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: Math.max(1, (el.border_width || 1) * scale),
                        backgroundColor: el.border_color || '#1e3a5f',
                      }}
                    />
                  </div>
                );
              }

              // Text element — concatenate static prefix + dynamic value when both exist
              const dynamicVal = getFieldValue(employee, el.field_binding);
              const value = el.static_value && el.field_binding
                ? `${el.static_value}${dynamicVal}`
                : el.static_value || dynamicVal;
              const borderRadiusPx = el.border_radius ? el.border_radius * MM_TO_PX * scale : 0;
              const hasBlueBg = el.background_color === BADGE_DESIGN.corPrimaria || el.background_color === '#1c274c';
              const textColor = el.font_color || (hasBlueBg ? BADGE_DESIGN.corTextoNome : BADGE_DESIGN.corTextoPadrao);
              const align = el.text_align || 'center';
              return (
                <div
                  key={el.id}
                  className="absolute flex items-center"
                  style={{
                    left: elLeft,
                    top: elTop,
                    width: elWidth,
                    height: elHeight,
                    fontSize: (el.font_size || 10) * MM_TO_PX * 0.35 * scale,
                    lineHeight: '1.2',
                    fontFamily: el.font_family || BADGE_DESIGN.fontFamily,
                    color: textColor,
                    fontWeight: (el.font_weight as any) || 'normal',
                    textAlign: align as any,
                    backgroundColor: el.background_color || 'transparent',
                    borderColor: el.border_color || 'transparent',
                    borderWidth: el.border_width ? el.border_width * scale : 0,
                    borderStyle: el.border_width ? 'solid' : 'none',
                    borderRadius: borderRadiusPx,
                    zIndex: el.z_index,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    paddingLeft: BADGE_DESIGN.paddingHorizontal * scale,
                    paddingRight: BADGE_DESIGN.paddingHorizontal * scale,
                    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                    letterSpacing: '0.01em',
                  }}
                >
                  <span className="truncate" style={{ 
                    width: '100%',
                    textAlign: align as any, 
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: '1.2',
                  }}>
                    {value}
                  </span>
                </div>
              );
            })}
        </div>
      );
    }

    // Template with background but NO elements — overlay employee data automatically
    if (template) {
      const w = template.width_mm * MM_TO_PX * scale;
      const h = template.height_mm * MM_TO_PX * scale;
      const photoUrl = getPhotoUrl(employee.fotoUrl);
      const hasPhoto = photoUrl && photoUrl !== '/placeholder.svg';

      return (
        <div
          ref={ref}
          className={cn('badge-preview rounded-xl overflow-hidden shadow-lg', className)}
          style={{ width: w, height: h, position: 'relative', backgroundColor: template.background_color || '#ffffff' }}
        >
          {template.background_image_url && (
            <img
              src={template.background_image_url}
              alt="Background"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 0 }}
            />
          )}
          {/* Auto-overlay: Photo */}
          <div
            className="absolute overflow-hidden rounded"
            style={{
              left: 8 * scale,
              top: 30 * scale,
              width: 72 * scale,
              height: 90 * scale,
              zIndex: 2,
              border: `${1 * scale}px solid rgba(255,255,255,0.6)`,
            }}
          >
            {hasPhoto ? (
              <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/80" style={{ fontSize: 22 * scale }}>
                {employee.nomeCompleto.charAt(0)}
              </div>
            )}
          </div>
          {/* Auto-overlay: Text data */}
          <div className="absolute" style={{ left: 88 * scale, top: 28 * scale, right: 8 * scale, zIndex: 2 }}>
            <p style={{ fontSize: 10 * scale, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2, marginBottom: 2 * scale }} className="truncate">
              {employee.nomeCompleto}
            </p>
            <p style={{ fontSize: 8 * scale, color: '#3b82f6', fontWeight: 600, marginBottom: 4 * scale }} className="truncate">
              {employee.cargo}
            </p>
            <div style={{ fontSize: 7 * scale, color: '#4a4a5a', lineHeight: 1.6 }}>
              {employee.matricula && <p><span style={{ fontWeight: 600 }}>Matrícula:</span> {employee.matricula}</p>}
              {employee.empresa && <p><span style={{ fontWeight: 600 }}>Empresa:</span> {employee.empresa}</p>}
              {(employee as any).rg && <p><span style={{ fontWeight: 600 }}>RG:</span> {(employee as any).rg}</p>}
              {(employee as any).cpf && <p><span style={{ fontWeight: 600 }}>CPF:</span> {(employee as any).cpf}</p>}
              {(employee as any).bloodType && <p><span style={{ fontWeight: 600 }}>Tipo Sang.:</span> {(employee as any).bloodType}</p>}
              {employee.dataValidade && (
                <p><span style={{ fontWeight: 600 }}>Validade:</span> {new Date(employee.dataValidade).toLocaleDateString('pt-BR')}</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Fallback: generic template
    const baseWidth = 340;
    const baseHeight = 216;

    return (
      <div
        ref={ref}
        className={cn(
          'badge-preview rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent',
          className
        )}
        style={{
          width: baseWidth * scale,
          height: baseHeight * scale,
        }}
      >
        <div className="h-full w-full bg-card/95 backdrop-blur-sm m-[2px] rounded-[10px] p-4 flex gap-4">
          <div className="flex-shrink-0">
            <div className="w-20 h-24 rounded-lg overflow-hidden border-2 border-border bg-muted">
              {employee.fotoUrl && employee.fotoUrl !== '/placeholder.svg' ? (
                <img src={getPhotoUrl(employee.fotoUrl)} alt={employee.nomeCompleto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl font-semibold">
                  {employee.nomeCompleto.charAt(0)}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <h3 className="text-base font-bold text-foreground truncate">{employee.nomeCompleto}</h3>
            <p className="text-sm text-primary font-medium mt-1 truncate">{employee.cargo}</p>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground"><span className="font-medium">Matrícula:</span> {employee.matricula}</p>
              <p className="text-xs text-muted-foreground truncate"><span className="font-medium">Unidade:</span> {employee.unidade}</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium">Validade:</span> {new Date(employee.dataValidade).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end justify-between">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">LOGO</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{employee.empresa}</p>
          </div>
        </div>
      </div>
    );
  }
);

BadgePreview.displayName = 'BadgePreview';
