"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${apiUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">peptracker</h1>
        <p className="mb-2 text-sm text-gray-500">Backend health check</p>
        {error ? (
          <p className="text-red-500">{error}</p>
        ) : health ? (
          <pre className="rounded bg-gray-100 px-3 py-2 text-sm text-green-700">
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : (
          <p className="text-gray-400">Loading…</p>
        )}
      </div>
    </main>
  );
}
