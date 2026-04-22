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
  preset_vial_sizes: number[] | null;
  default_syringe_type: string | null;
  default_syringe_ml: number | null;
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

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `in ${days}d`;
}

// ---------------------------------------------------------------------------
// Protocol + Reminder types
// ---------------------------------------------------------------------------

export interface ProtocolRead {
  id: number;
  user_id: number;
  compound_id: number;
  compound_name: string;
  dose_mcg: number;
  schedule_cron: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  last_fired_at: string | null;
  next_fire_at: string | null;
}

export interface ReminderLogRead {
  id: number;
  protocol_id: number;
  compound_name: string;
  protocol_dose_mcg: number;
  fired_at: string;
  delivered: boolean;
  error: string | null;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  ntfy_topic: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Dashboard API types
// ---------------------------------------------------------------------------

export interface NextDoseItem {
  protocol_id: number;
  compound_name: string;
  dose_mcg: number;
  next_fire_at: string;
  schedule_cron: string;
}

export interface LastByCompoundItem {
  compound_id: number;
  compound_name: string;
  dose_mcg: number;
  injection_site: string;
  injected_at: string;
}

export interface WeekCompoundSummary {
  compound_name: string;
  count: number;
  total_mcg: number;
}

export interface TimelinePoint {
  date: string;
  compound_id: number;
  compound_name: string;
  total_mcg: number;
  count: number;
}

export interface DashboardData {
  next_doses: NextDoseItem[];
  last_by_compound: LastByCompoundItem[];
  week_summary: {
    total_injections: number;
    by_compound: WeekCompoundSummary[];
  };
  recent: InjectionRead[];
  timeline: TimelinePoint[];
}
