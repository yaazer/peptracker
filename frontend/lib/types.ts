export interface CompoundRead {
  id: number;
  user_id: number;
  name: string;
  concentration_mg_per_ml: number | null;
  vial_size_mg: number | null;
  bac_water_ml: number | null;
  notes: string | null;
  created_at: string;
  archived: boolean;
}

export interface InjectionRead {
  id: number;
  user_id: number;
  compound_id: number;
  dose_mcg: number;
  injection_site: string;
  injected_at: string;
  notes: string | null;
  created_at: string;
}

export const INJECTION_SITES = [
  { value: "left_abdomen", label: "Left Abdomen" },
  { value: "right_abdomen", label: "Right Abdomen" },
  { value: "left_thigh", label: "Left Thigh" },
  { value: "right_thigh", label: "Right Thigh" },
  { value: "left_shoulder", label: "Left Shoulder" },
  { value: "right_shoulder", label: "Right Shoulder" },
  { value: "other", label: "Other" },
] as const;

export function siteLabel(value: string): string {
  return INJECTION_SITES.find((s) => s.value === value)?.label ?? value;
}

export function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
