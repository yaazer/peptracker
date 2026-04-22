"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { type CompoundRead } from "@/lib/types";
import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";

export default function CalculatorPage() {
  const searchParams = useSearchParams();
  const compoundIdParam = searchParams.get("compound_id");

  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [initialCompound, setInitialCompound] = useState<CompoundRead | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/compounds")
      .then((r) => (r.ok ? r.json() : []))
      .then((cs: CompoundRead[]) => {
        setCompounds(cs);
        if (compoundIdParam) {
          const match = cs.find((c) => String(c.id) === compoundIdParam);
          setInitialCompound(match);
        }
        setLoading(false);
      });
  }, [compoundIdParam]);

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-6 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
        Reconstitution Calculator
      </h1>
      <ReconstitutionCalculator
        initialCompound={initialCompound}
        compounds={compounds}
      />
    </div>
  );
}
