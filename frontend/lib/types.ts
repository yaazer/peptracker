export interface HouseholdUser {
  id: number;
  name: string;
  role: string;
}

export interface BlendComponent {
  id?: number;
  name: string;
  linked_compound_id: number | null;
  amount_mg: number;
  is_anchor: boolean;
  position: number;
}

export interface ComponentSnapshot {
  name: string;
  amount_mg: number;
  dose_mcg: number;
  linked_compound_id: number | null;
}

export const MEDICATION_TYPES = [
  "injection", "tablet", "capsule", "liquid", "topical", "sublingual", "inhaled", "other",
] as const;
export type MedicationType = typeof MEDICATION_TYPES[number];

export interface CompoundRead {
  id: number;
  created_by_user_id: number;
  name: string;
  medication_type: MedicationType;
  dose_unit: string;
  strength_amount: number | null;
  strength_unit: string | null;
  route: string | null;
  form_notes: string | null;
  concentration_mg_per_ml: number | null;
  vial_size_mg: number | null;
  bac_water_ml: number | null;
  notes: string | null;
  created_at: string;
  archived: boolean;
  preset_vial_sizes: number[] | null;
  default_syringe_type: string | null;
  default_syringe_ml: number | null;
  is_blend: boolean;
  blend_components: BlendComponent[];
  aliases: string | null;
  reference_url: string | null;
  reference_notes: string | null;
  molecular_weight: number | null;
  half_life_hours: number | null;
  typical_dose_mcg_min: number | null;
  typical_dose_mcg_max: number | null;
}

export interface InjectionRead {
  id: number;
  logged_by_user_id: number;
  injected_by_user_id: number;
  compound_id: number;
  dose_mcg: number | null;
  injection_site: string | null;
  injected_at: string;
  notes: string | null;
  created_at: string;
  draw_volume_ml: number | null;
  dose_mode: string;
  component_snapshot: ComponentSnapshot[] | null;
  quantity: number | null;
  status: string;
  skip_reason: string | null;
  logger_name: string;
  injector_name: string;
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

export const SKIP_REASON_LABELS: Record<string, string> = {
  forgot: "Forgot",
  side_effects: "Side effects",
  out_of_stock: "Out of stock",
  travelling: "Travelling",
  feeling_unwell: "Feeling unwell",
  other: "Other",
};

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
  assignee_user_id: number;
  assignee_name: string;
  created_by_user_id: number;
  compound_id: number;
  compound_name: string;
  dose_mcg: number | null;
  schedule_cron: string;
  schedule_type: string;
  schedule_times: string[] | null;
  schedule_days: number[] | null;
  schedule_interval_value: number | null;
  schedule_interval_unit: string | null;
  schedule_start_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  last_fired_at: string | null;
  next_fire_at: string | null;
  dose_mode: string;
  anchor_component_id: number | null;
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
  role: string;
  force_password_change: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard API types
// ---------------------------------------------------------------------------

export interface UserDoseSummary {
  user_id: number;
  user_name: string;
  count: number;
  total_mcg: number;
}

export interface NextDoseItem {
  protocol_id: number;
  compound_id: number;
  compound_name: string;
  dose_mcg: number | null;
  next_fire_at: string;
  schedule_cron: string;
  schedule_type: string;
  schedule_times: string[] | null;
  assignee_user_id: number;
  assignee_name: string;
}

export interface LastByCompoundItem {
  compound_id: number;
  compound_name: string;
  dose_mcg: number | null;
  quantity: number | null;
  injection_site: string | null;
  injected_at: string;
  injected_by_user_id: number;
  injector_name: string;
  logged_by_user_id: number;
  logger_name: string;
}

export interface WeekCompoundSummary {
  compound_name: string;
  count: number;
  total_mcg: number;
  by_user: UserDoseSummary[];
}

export interface WeekSummary {
  total_injections: number;
  by_compound: WeekCompoundSummary[];
}

export interface TimelinePoint {
  date: string;
  compound_id: number;
  compound_name: string;
  user_id: number;
  user_name: string;
  total_mcg: number;
  count: number;
}

export interface DashboardData {
  next_doses: NextDoseItem[];
  last_by_compound: LastByCompoundItem[];
  week_summary: WeekSummary;
  my_week_summary: WeekSummary;
  recent: InjectionRead[];
  timeline: TimelinePoint[];
}

export interface ReferenceResult {
  source: "rxnorm" | "local";
  rxcui: string | null;
  name: string;
  display_name: string;
  medication_type: string;
  strength_amount: number | null;
  strength_unit: string | null;
  dose_unit: string;
  route: string;
  aliases: string[];
}
