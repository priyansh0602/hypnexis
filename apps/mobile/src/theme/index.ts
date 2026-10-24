import type { FootpathStatus, ObstacleCode } from '../types';

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  mapStyle: string;
  statusColors: Record<FootpathStatus, string>;
  statusLabels: Record<FootpathStatus, string>;
  statusDescriptions: Record<FootpathStatus, string>;
  overlay: string;
  shadow: string;
}

export const STATUS_COLORS: Record<FootpathStatus, string> = {
  green: '#10b981', // Emerald 500: Clear & rollable
  yellow: '#f59e0b', // Amber 500: Rough / uneven / narrow
  red: '#ef4444', // Red 500: Blocked / steps / impassable
  grey: '#94a3b8', // Slate 400: Unverified / no evidence
};

export const STATUS_LABELS: Record<FootpathStatus, string> = {
  green: 'Clear Path',
  yellow: 'Rough Surface',
  red: 'Blocked / Impassable',
  grey: 'Unverified Area',
};

export const STATUS_DESCRIPTIONS: Record<FootpathStatus, string> = {
  green: 'Audited and verified clear for wheelchair navigation.',
  yellow: 'Surface is rough, uneven, or has reduced clearance. Caution advised.',
  red: 'Physical barrier or steps present. Inaccessible for wheelchairs.',
  grey: 'No recent evidence. AccessPath does not invent accessibility; proceed with caution.',
};

export const OBSTACLE_METADATA: Record<
  ObstacleCode,
  {
    name: string;
    icon: string;
    severity: number;
    isPermanent: boolean;
    description: string;
  }
> = {
  missing_kerb_ramp: {
    name: 'Missing Kerb Ramp',
    icon: 'transit-detour',
    severity: 85,
    isPermanent: true,
    description: 'A kerb transition is absent or too steep for wheelchair entry.',
  },
  steps: {
    name: 'Steps / Stairs',
    icon: 'stairs',
    severity: 100,
    isPermanent: true,
    description: 'Stairs or sudden vertical elevation changes block rolling.',
  },
  broken_footpath: {
    name: 'Broken Footpath',
    icon: 'alert-decagram-outline',
    severity: 70,
    isPermanent: true,
    description: 'Pavement is cracked, missing slabs, or heavily uneven.',
  },
  pole_fixed_obstacle: {
    name: 'Fixed Pole / Utility',
    icon: 'power-socket',
    severity: 60,
    isPermanent: true,
    description: 'Utility pole, transformer box, or signpost narrows the footpath.',
  },
  parked_vehicle: {
    name: 'Parked Vehicle',
    icon: 'car-side',
    severity: 60,
    isPermanent: false,
    description: 'Car, auto, or motorcycle temporarily parked on the footpath.',
  },
  vendor_cart: {
    name: 'Vendor Cart / Stall',
    icon: 'storefront-outline',
    severity: 45,
    isPermanent: false,
    description: 'Street vendor, tea stall, or cart occupying clear path.',
  },
  rubble: {
    name: 'Rubble / Construction',
    icon: 'hard-hat',
    severity: 50,
    isPermanent: false,
    description: 'Loose gravel, bricks, or construction debris blocking access.',
  },
  garbage: {
    name: 'Garbage / Waste',
    icon: 'trash-can-outline',
    severity: 35,
    isPermanent: false,
    description: 'Waste pile reducing clear width.',
  },
  unknown: {
    name: 'Unknown Obstacle',
    icon: 'help-circle-outline',
    severity: 40,
    isPermanent: false,
    description: 'Width restriction flagged by computer vision awaiting human review.',
  },
};

export const darkTheme: ThemeColors = {
  isDark: true,
  background: '#090d16',
  surface: '#111827',
  surfaceSubtle: '#1f293d',
  surfaceElevated: '#1e293b',
  border: '#334155',
  borderStrong: '#475569',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  accent: '#38bdf8',
  accentContrast: '#0f172a',
  mapStyle: 'https://tiles.openfreemap.org/styles/dark',
  statusColors: STATUS_COLORS,
  statusLabels: STATUS_LABELS,
  statusDescriptions: STATUS_DESCRIPTIONS,
  overlay: 'rgba(0, 0, 0, 0.75)',
  shadow: '#000000',
};

export const lightTheme: ThemeColors = {
  isDark: false,
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  surfaceElevated: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  accent: '#0284c7',
  accentContrast: '#ffffff',
  mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  statusColors: STATUS_COLORS,
  statusLabels: STATUS_LABELS,
  statusDescriptions: STATUS_DESCRIPTIONS,
  overlay: 'rgba(15, 23, 42, 0.65)',
  shadow: 'rgba(0, 0, 0, 0.12)',
};
