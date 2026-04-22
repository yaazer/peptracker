"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CompoundRead } from "@/lib/types";
import LogInjectionForm from "@/components/LogInjectionForm";

export default function LogPage() {
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);

  useEffect(() => {
    apiFetch("/api/compounds").then((r) => r.json()).then(setCompounds);
  }, []);

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Log Injection</h1>
      <LogInjectionForm compounds={compounds} />
    </div>
  );
}
