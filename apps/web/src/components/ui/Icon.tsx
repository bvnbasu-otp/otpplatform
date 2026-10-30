import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * Standard Google Material Symbols Outlined (Apache 2.0 licensed).
 * Native font on Android, official standard across Google web & mobile applications.
 */
export type MaterialIconName =
  | 'home'
  | 'receipt_long'
  | 'person'
  | 'request_quote'
  | 'search'
  | 'mic'
  | 'notifications'
  | 'build'
  | 'electrical_services'
  | 'water_drop'
  | 'cleaning_services'
  | 'chair'
  | 'inventory_2'
  | 'call'
  | 'chat'
  | 'verified'
  | 'help'
  | 'settings'
  | 'location_on'
  | 'arrow_forward'
  | 'arrow_back'
  | 'check_circle'
  | 'close'
  | 'expand_more'
  | 'expand_less'
  | 'add'
  | 'remove'
  | 'photo_camera'
  | 'upload_file'
  | 'description'
  | 'thumb_up'
  | 'tune'
  | 'schedule'
  | 'refresh'
  | 'history'
  | 'shield'
  | 'share'
  | 'filter_list'
  | 'local_shipping'
  | 'handyman'
  | 'groups'
  | 'payments'
  | 'mail'
  | 'phone_android';

export interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  name: MaterialIconName | string;
  filled?: boolean;
  size?: number;
  weight?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  filled = false,
  size = 24,
  weight = 500,
  className = '',
  style,
  ...props
}: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none inline-flex items-center justify-center leading-none ${className}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
      aria-hidden="true"
      data-icon={name}
      {...props}
    >
      {name}
    </span>
  );
}
