import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  DEFAULT_WHEELCHAIR_WIDTH_METRES,
  DEFAULT_CLEARANCE_MARGIN_METRES,
  type WheelchairProfile,
} from '@accesspath/shared';

export interface WheelchairPreset {
  id: string;
  name: string;
  widthMetres: number;
  clearanceMarginMetres: number;
  description: string;
}

export const WHEELCHAIR_PRESETS: WheelchairPreset[] = [
  {
    id: 'manual',
    name: 'Manual Chair (Slim)',
    widthMetres: 0.75,
    clearanceMarginMetres: 0.15,
    description: 'Compact manual wheelchair suited for tight urban passages.',
  },
  {
    id: 'standard-electric',
    name: 'Standard Electric / Power (Default)',
    widthMetres: 0.9,
    clearanceMarginMetres: 0.15,
    description: 'Standard electric wheelchair requiring 1.20 m total clear width.',
  },
  {
    id: 'bariatric-sports',
    name: 'Bariatric / Sports Chair',
    widthMetres: 1.05,
    clearanceMarginMetres: 0.2,
    description: 'Wide base wheelchair requiring at least 1.45 m clear passage.',
  },
];

interface WheelchairProfileContextValue {
  profile: WheelchairProfile;
  totalClearanceRequired: number;
  selectedPresetId: string | null;
  setWidthMetres: (width: number) => void;
  setClearanceMarginMetres: (margin: number) => void;
  applyPreset: (preset: WheelchairPreset) => void;
  checkPassageFeasible: (availableWidthMetres: number) => {
    isFeasible: boolean;
    deficitMetres: number;
  };
}

const WheelchairProfileContext = createContext<WheelchairProfileContextValue>({
  profile: {
    widthMetres: DEFAULT_WHEELCHAIR_WIDTH_METRES,
    clearanceMarginMetres: DEFAULT_CLEARANCE_MARGIN_METRES,
  },
  totalClearanceRequired: DEFAULT_WHEELCHAIR_WIDTH_METRES + 2 * DEFAULT_CLEARANCE_MARGIN_METRES,
  selectedPresetId: 'standard-electric',
  setWidthMetres: () => {},
  setClearanceMarginMetres: () => {},
  applyPreset: () => {},
  checkPassageFeasible: () => ({ isFeasible: true, deficitMetres: 0 }),
});

export const WheelchairProfileProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [profile, setProfile] = useState<WheelchairProfile>({
    widthMetres: DEFAULT_WHEELCHAIR_WIDTH_METRES,
    clearanceMarginMetres: DEFAULT_CLEARANCE_MARGIN_METRES,
  });

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('standard-electric');

  const setWidthMetres = (width: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(width * 100) / 100));
    setProfile((prev) => ({ ...prev, widthMetres: clamped }));
    const match = WHEELCHAIR_PRESETS.find((p) => Math.abs(p.widthMetres - clamped) < 0.01);
    setSelectedPresetId(match ? match.id : null);
  };

  const setClearanceMarginMetres = (margin: number) => {
    const clamped = Math.max(0.05, Math.min(0.5, Math.round(margin * 100) / 100));
    setProfile((prev) => ({ ...prev, clearanceMarginMetres: clamped }));
  };

  const applyPreset = (preset: WheelchairPreset) => {
    setSelectedPresetId(preset.id);
    setProfile({
      widthMetres: preset.widthMetres,
      clearanceMarginMetres: preset.clearanceMarginMetres,
    });
  };

  const totalClearanceRequired = useMemo(() => {
    return Math.round((profile.widthMetres + 2 * profile.clearanceMarginMetres) * 100) / 100;
  }, [profile.widthMetres, profile.clearanceMarginMetres]);

  const checkPassageFeasible = (availableWidthMetres: number) => {
    const deficit = totalClearanceRequired - availableWidthMetres;
    return {
      isFeasible: deficit <= 0,
      deficitMetres: deficit > 0 ? Math.round(deficit * 100) / 100 : 0,
    };
  };

  const value = useMemo(
    () => ({
      profile,
      totalClearanceRequired,
      selectedPresetId,
      setWidthMetres,
      setClearanceMarginMetres,
      applyPreset,
      checkPassageFeasible,
    }),
    [profile, totalClearanceRequired, selectedPresetId],
  );

  return (
    <WheelchairProfileContext.Provider value={value}>{children}</WheelchairProfileContext.Provider>
  );
};

export const useWheelchairProfile = () => useContext(WheelchairProfileContext);
