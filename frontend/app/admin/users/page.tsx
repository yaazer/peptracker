"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { UserProfile } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

interface AdminUser extends UserProfile {
  last_login_at: string | null;
  deleted_at: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";
const labelCls = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    const res = await apiFetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRoleToggle = async (u: AdminUser) => {
    setActionError(null);
    const newRole = u.role === "admin" ? "member" : "admin";
    const res = await apiFetch(`/api/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x));
    } else {
      const err = await res.json();
      setActionError(err.detail ?? "Failed to update role");
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`Remove ${u.name} from the household? This cannot be undone.`)) return;
    setActionError(null);
    const res = await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } else {
      const err = await res.json();
      setActionError(err.detail ?? "Failed to remove user");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      const res = await apiFetch("/api/users/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          temporary_password: invitePassword,
        }),
      });
      if (res.ok) {
        setInviteOpen(false);
        setInviteName("");
        setInviteEmail("");
        setInvitePassword("");
        await load();
      } else {
        const err = await res.json();
        setInviteError(err.detail ?? "Failed to invite user");
      }
    } finally {
      setInviting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    setResetting(true);
    try {
      const res = await apiFetch(`/api/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ temporary_password: resetPassword }),
      });
      if (res.ok) {
        setResetTarget(null);
        setResetPassword("");
      } else {
        const err = await res.json();
        setResetError(err.detail ?? "Failed to reset password");
      }
    } finally {
      setResetting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Manage users</h1>
        <button
          onClick={() => setInviteOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Invite user
        </button>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
          {actionError}
        </div>
      )}

      <div className="space-y-3">
        {users.map((u) => {
          const isSelf = u.id === currentUser?.id;
          return (
            <div
              key={u.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{u.name}</span>
                    {isSelf && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        you
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.role === "admin"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {u.role}
                    </span>
                    {u.force_password_change && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        must change password
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{u.email}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>ntfy: {u.ntfy_topic ? "configured" : "not set"}</span>
                    <span>last login: {formatDate(u.last_login_at)}</span>
                  </div>
                </div>

                {!isSelf && (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => handleRoleToggle(u)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
                    >
                      {u.role === "admin" ? "Demote" : "Make admin"}
                    </button>
                    <button
                      onClick={() => { setResetTarget(u); setResetPassword(""); setResetError(null); }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
                    >
                      Reset password
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-800 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setInviteOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 pt-5 pb-8 sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Invite user</h2>
              <button
                onClick={() => setInviteOpen(false)}
                className="text-2xl leading-none text-gray-400 dark:text-gray-500"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className={labelCls}>Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className={labelCls}>Temporary password</label>
                <input
                  type="text"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Share this with them"
                />
              </div>
              {inviteError && (
                <p className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>
              )}
              <button
                type="submit"
                disabled={inviting}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {inviting ? "Inviting…" : "Create account"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setResetTarget(null)}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 pt-5 pb-8 sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Reset password — {resetTarget.name}
              </h2>
              <button
                onClick={() => setResetTarget(null)}
                className="text-2xl leading-none text-gray-400 dark:text-gray-500"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className={labelCls}>New temporary password</label>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Share this with them securely"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                The user will be required to change their password on next login.
              </p>
              {resetError && (
                <p className="text-sm text-red-600 dark:text-red-400">{resetError}</p>
              )}
              <button
                type="submit"
                disabled={resetting}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
