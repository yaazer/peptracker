"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CompoundRead, HouseholdUser } from "@/lib/types";
import LogInjectionForm from "@/components/LogInjectionForm";

export default function LogPage() {
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/compounds").then((r) => r.json()),
      apiFetch("/api/users/household").then((r) => (r.ok ? r.json() : [])),
    ]).then(([cs, us]) => {
      setCompounds(cs);
      setHouseholdUsers(us);
    });
  }, []);

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Log Injection</h1>
      <LogInjectionForm compounds={compounds} householdUsers={householdUsers} />
    </div>
  );
}
