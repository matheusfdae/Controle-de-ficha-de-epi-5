import { CSSProperties, forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { BadgeEmployeeData, getFieldValue } from '@/modules/crachas/lib/badgeFieldMap';
import { BADGE_DESIGN } from '@/modules/crachas/lib/defaultTemplates';
import { createQrCodeDataUrl } from '@/modules/crachas/lib/badgeAssets';
import { adjustmentToCssStyle, PhotoAdjustment } from '@/modules/crachas/lib/photoAdjustments';

export interface TemplateElement {
  id: string;
  element_type: string;
  field_binding: string | null;
  name_display_mode?: string | null;
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
  show_label?: boolean | null;
  object_fit?: string | null;
  side: string;
  z_index: number;
}

export interface BadgeTemplate {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  has_back_side?: boolean | null;
  background_color: string | null;
  background_image_url: string | null;
  back_background_image_url?: string | null;
  elements: TemplateElement[];
}

interface BadgeRendererProps {
  data: BadgeEmployeeData;
  template: BadgeTemplate;
  scale?: number;
  side?: 'front' | 'back';
  className?: string;
  renderMode?: 'preview' | 'export';
}

const MM_TO_PX = 3.78;

interface BadgeQrCodeProps {
  containerStyle: CSSProperties;
  scale: number;
  value: string;
  width: number;
  height: number;
}

function BadgeQrCode({ containerStyle, scale, value, width, height }: BadgeQrCodeProps) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!value.trim()) {
      setQrSrc(null);
      return undefined;
    }

    setQrSrc(null);

    createQrCodeDataUrl(value, Math.max(256, Math.ceil(Math.max(width, height)) * 4)).then((dataUrl) => {
      if (!cancelled) {
        setQrSrc(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [height, value, width]);

  return (
    <div
      className="absolute overflow-hidden flex items-center justify-center"
      data-badge-asset="qrcode"
      data-badge-asset-loading={value.trim() && !qrSrc ? 'true' : 'false'}
      style={containerStyle}
    >
      {qrSrc ? (
        <img src={qrSrc} alt="QR Code" className="w-full h-full object-contain" crossOrigin="anonymous" />
      ) : (
        <span style={{ fontSize: 8 * scale, fontFamily: BADGE_DESIGN.fontFamily }} className="text-muted-foreground">QR</span>
      )}
    </div>
  );
}

export const BadgeRenderer = forwardRef<HTMLDivElement, BadgeRendererProps>(
  ({ data, template, scale = 1, side = 'front', className, renderMode = 'preview' }, ref) => {
    const previewWidth = template.width_mm * MM_TO_PX * scale;
    const previewHeight = template.height_mm * MM_TO_PX * scale;
    const backgroundImageUrl = side === 'back'
      ? template.back_background_image_url || template.background_image_url
      : template.background_image_url;

    const sideElements = (template.elements || [])
      .filter(el => el.side === side)
      .sort((a, b) => a.z_index - b.z_index);

    return (
      <div
        ref={ref}
        className={cn('badge-renderer', className)}
        style={{
          width: previewWidth,
          height: previewHeight,
          position: 'relative',
          backgroundColor: template.background_color || '#ffffff',
          fontFamily: BADGE_DESIGN.fontFamily,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {backgroundImageUrl && (
          <img
            src={backgroundImageUrl}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: 0 }}
            crossOrigin="anonymous"
          />
        )}

        {sideElements.map((el) => {
          const elLeft = el.x_position * MM_TO_PX * scale;
          const elTop = el.y_position * MM_TO_PX * scale;
          const elWidth = (el.width ?? 20) * MM_TO_PX * scale;
          const elHeight = (el.height ?? 10) * MM_TO_PX * scale;

          if (el.element_type === 'image' || el.element_type === 'photo') {
            if (el.static_value && !el.field_binding) {
              return (
                <div
                  key={el.id}
                  className="absolute overflow-hidden"
                  style={{
                  left: elLeft, top: elTop, width: elWidth, height: elHeight,
                    zIndex: el.z_index,
                    borderRadius: (el.border_radius || 0) * MM_TO_PX * scale || 4 * scale,
                    backgroundColor: el.background_color || undefined,
                    borderColor: el.border_color || 'transparent',
                    borderWidth: el.border_width ? el.border_width * scale : 0,
                    borderStyle: el.border_width ? 'solid' : 'none',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <img src={el.static_value} alt="img" style={{ width: '100%', height: '100%', objectFit: (el.object_fit as any) || 'cover' }} crossOrigin="anonymous" />
                </div>
              );
            }

            const rawUrl = getFieldValue(data, el.field_binding) || data.photo_url;
            const photoUrl = getPhotoUrl(rawUrl);
            return (
              <div
                key={el.id}
                className="absolute overflow-hidden"
                style={{
                  left: elLeft, top: elTop, width: elWidth, height: elHeight,
                  zIndex: el.z_index,
                  backgroundColor: el.background_color || '#ffffff',
                  borderColor: el.border_color || 'transparent',
                  borderWidth: el.border_width ? el.border_width * scale : 0,
                  borderStyle: el.border_width ? 'solid' : 'none',
                  borderRadius: (el.border_radius || 0) * MM_TO_PX * scale || 4 * scale,
                }}
              >
                {photoUrl && photoUrl !== '/placeholder.svg' ? (
                  (() => {
                    const adj = (data as any).photo_adjustment as PhotoAdjustment | undefined;
                    const adjStyle = adjustmentToCssStyle(adj);
                    return (
                  <img
                    src={photoUrl}
                    alt="Foto"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: (el.object_fit as any) || 'cover',
                      objectPosition: adjStyle.objectPosition,
                      transform: adjStyle.transform,
                      transformOrigin: adjStyle.transformOrigin,
                    }}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      const driveMatch = rawUrl?.match(/drive\.google\.com\/.*?([a-zA-Z0-9_-]{20,})/);
                      if (driveMatch && !img.dataset.triedLh3) {
                        img.dataset.triedLh3 = 'true';
                        img.src = `https://lh3.googleusercontent.com/d/${driveMatch[1]}=s400`;
                        return;
                      }
                      if (driveMatch && !img.dataset.triedUc) {
                        img.dataset.triedUc = 'true';
                        img.src = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
                        return;
                      }
                      img.style.display = 'none';
                      const parent = img.parentElement;
                      if (parent) {
                        parent.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${20 * scale}px;color:#999;font-family:${BADGE_DESIGN.fontFamily}">${data.full_name.charAt(0)}</div>`;
                      }
                    }}
                  />
                    );
                  })()
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 20 * scale, color: BADGE_DESIGN.corPrimaria, fontFamily: BADGE_DESIGN.fontFamily }}>
                    {data.full_name.charAt(0)}
                  </div>
                )}
              </div>
            );
          }

          if (el.element_type === 'qrcode') {
            const qrValue = (getFieldValue(data, el.field_binding) || el.static_value || '').trim();
            return (
              <BadgeQrCode
                key={el.id}
                value={qrValue}
                width={elWidth}
                height={elHeight}
                scale={scale}
                containerStyle={{
                  left: elLeft, top: elTop, width: elWidth, height: elHeight,
                  zIndex: el.z_index,
                  backgroundColor: el.background_color || 'rgba(240,240,240,0.3)',
                  borderColor: el.border_color || 'transparent',
                  borderWidth: el.border_width ? el.border_width * scale : 0,
                  borderStyle: el.border_width ? 'solid' : 'none',
                  borderRadius: 4 * scale,
                }}
              />
            );
          }

          if (el.element_type === 'rectangle') {
            return (
              <div
                key={el.id}
                className="absolute"
                style={{
                  left: elLeft, top: elTop, width: elWidth, height: elHeight,
                  zIndex: el.z_index,
                  backgroundColor: el.background_color || 'rgba(59,130,246,0.1)',
                  borderColor: el.border_color || 'transparent',
                  borderWidth: el.border_width || 0,
                  borderStyle: el.border_width ? 'solid' : 'none',
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
                  left: elLeft, top: elTop, width: elWidth, height: elHeight,
                  zIndex: el.z_index,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: Math.max(1, (el.border_width || 1) * scale),
                    backgroundColor: el.border_color || BADGE_DESIGN.corPrimaria,
                  }}
                />
              </div>
            );
          }

          const nameMode = el.name_display_mode || 'short';
          const dynamicVal = getFieldValue(data, el.field_binding, el.field_binding === 'full_name' ? nameMode : undefined);
          const showLabel = el.show_label !== false;
          const fullValue = el.static_value && el.field_binding
            ? (showLabel ? `${el.static_value}${dynamicVal}` : dynamicVal)
            : el.static_value || dynamicVal;

          if (!fullValue) return null;

          const displayValue = fullValue;

          const effectiveBgColor = el.background_color || 'transparent';
          const effectiveBorderColor = el.border_color || 'transparent';
          const effectiveBorderWidth = el.border_width ?? 0;
          const effectiveBorderRadius = el.border_radius ?? 0;
          const borderRadiusPx = effectiveBorderRadius * MM_TO_PX * scale;
          const align = el.text_align || 'center';
          const fontSize = (el.font_size || 10) * MM_TO_PX * 0.35 * scale;
          const isSingleLine = el.field_binding !== 'request_reason';
          const hasBlueBg = el.background_color === BADGE_DESIGN.corPrimaria || el.background_color === '#1c274c';
          const textColor = el.font_color || (hasBlueBg ? BADGE_DESIGN.corTextoNome : BADGE_DESIGN.corTextoPadrao);
          const textPadding = renderMode === 'export' ? Math.max(1 * scale, BADGE_DESIGN.paddingHorizontal * scale * 0.55) : BADGE_DESIGN.paddingHorizontal * scale;

          return (
            <div
              key={el.id}
              className="absolute flex items-center"
              title={el.field_binding === 'full_name' && (el.name_display_mode || 'short') === 'short' ? data.full_name : undefined}
              style={{
                left: elLeft,
                top: elTop,
                width: elWidth,
                height: elHeight,
                minHeight: 0,
                fontSize,
                lineHeight: renderMode === 'export' ? '1.05' : '1.2',
                fontFamily: el.font_family || BADGE_DESIGN.fontFamily,
                color: textColor,
                fontWeight: (el.font_weight as any) || 'normal',
                textAlign: align as any,
                backgroundColor: effectiveBgColor,
                borderColor: effectiveBorderColor,
                borderWidth: effectiveBorderWidth > 0 ? effectiveBorderWidth * scale : 0,
                borderStyle: effectiveBorderWidth > 0 ? 'solid' : 'none',
                borderRadius: borderRadiusPx,
                zIndex: el.z_index,
                boxSizing: 'border-box',
                whiteSpace: isSingleLine ? 'nowrap' : 'normal',
                overflow: 'hidden',
                textOverflow: isSingleLine ? 'ellipsis' : 'clip',
                paddingLeft: textPadding,
                paddingRight: textPadding,
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                letterSpacing: renderMode === 'export' ? '0' : '0.01em',
              }}
            >
              <span
                style={{
                  width: '100%',
                  textAlign: align as any,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: isSingleLine ? 'ellipsis' : 'clip',
                  whiteSpace: isSingleLine ? 'nowrap' : 'normal',
                  lineHeight: renderMode === 'export' ? '1.05' : '1.2',
                  wordBreak: isSingleLine ? 'normal' : 'break-word',
                  transform: renderMode === 'export' ? 'translateY(0.15px)' : 'none',
                  transformOrigin: 'center center',
                }}
              >
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
);

BadgeRenderer.displayName = 'BadgeRenderer';
