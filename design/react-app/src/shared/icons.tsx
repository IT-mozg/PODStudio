/* Icon library — one file, many small single-purpose components.
   Each icon takes the same prop shape (ISP: consumers only depend on
   {size}, never on internals). Adding an icon means adding a function
   here, not touching any component that renders icons (OCP). */

export interface IconProps {
  size?: number;
}

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function GridSquaresIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function DashboardIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function ShopBagIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export function ListingsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function TrendUpIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function CalculatorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}

export function DesignsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  );
}

export function AssetsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.8" />
      <path d="m21 15-5-5-9 9" />
    </svg>
  );
}

export function MockupsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

export function QueueIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 12h18M3 6h18M3 18h12" />
    </svg>
  );
}

export function TemplatesIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="18" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function SettingsGearIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function BellIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function StarIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="m12 2 3 6.5 7 1-5 5 1.3 7L12 18l-6.3 3.5 1.3-7-5-5 7-1Z" />
    </svg>
  );
}

export function GrowthArrowIcon({ size = 12 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" width={size} height={size}>
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

export function CheckShieldIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function ImageIcon({ size = 26 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5-9 9" />
    </svg>
  );
}

export function MonitorIcon({ size = 26 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

export function AlertCircleIcon({ size = 26 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function LightningIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
