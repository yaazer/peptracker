"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { UserProfile } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ntfyTopic, setNtfyTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error: string | null } | null>(null);

  useEffect(() => {
    apiFetch("/api/profile")
      .then((r) => r.json())
      .then((p: UserProfile) => {
        setProfile(p);
        setNtfyTopic(p.ntfy_topic ?? "");
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ ntfy_topic: ntfyTopic || null }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) {
        const updated: UserProfile = await res.json();
        setProfile(updated);
        setTimeout(() => setSaveStatus("idle"), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/profile/test-notification", { method: "POST" });
      setTestResult(await res.json());
    } finally {
      setTesting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Profile</h1>

      {profile && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="font-semibold text-gray-900 dark:text-white">{profile.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            ntfy topic URL
          </label>
          <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
            Create a topic at{" "}
            <span className="font-mono text-blue-600">ntfy.sh</span> and paste the URL or topic name here.
            Reminders will be pushed to this topic.
          </p>
          <input
            type="text"
            value={ntfyTopic}
            onChange={(e) => setNtfyTopic(e.target.value)}
            className={inputCls}
            placeholder="https://ntfy.sh/your-secret-topic"
            spellCheck={false}
          />
        </div>

        {saveStatus === "saved" && (
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Saved!</p>
        )}
        {saveStatus === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">Failed to save.</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !ntfyTopic.trim()}
            className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            {testing ? "Sending…" : "Test notification"}
          </button>
        </div>

        {testResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            testResult.ok
              ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {testResult.ok
              ? "Test notification sent — check your ntfy app!"
              : `Delivery failed: ${testResult.error}`}
          </div>
        )}
      </form>
    </div>
  );
}
