"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";

interface Props {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [values, setValues] = useState({ name: "", email: "", password: "", inviteCode: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});

    try {
      const payload = isSignup
        ? {
            name: values.name,
            email: values.email,
            password: values.password,
            inviteCode: values.inviteCode || undefined,
          }
        : { email: values.email, password: values.password };

      const result = await api.post<{ needsOnboarding: boolean }>(
        isSignup ? "/api/auth/signup" : "/api/auth/login",
        payload,
      );

      // A full navigation, not a client push: the server layouts need to see
      // the new session cookie.
      window.location.href = result.needsOnboarding ? "/onboarding" : "/";
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError("Could not reach the server. Check your connection.");
      }
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
          {isSignup
            ? "Your training, food and body data stay private to you."
            : "Sign in to pick up where you left off."}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {isSignup && (
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input
              id="name"
              className="field"
              value={values.name}
              onChange={set("name")}
              autoComplete="name"
              required
            />
            <FieldError message={fields.name} />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            className="field"
            value={values.email}
            onChange={set("email")}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
          <FieldError message={fields.email} />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="field"
            value={values.password}
            onChange={set("password")}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
          />
          <FieldError message={fields.password} />
          {isSignup && !fields.password && (
            <p className="hint mt-1">At least 10 characters. A short sentence works well.</p>
          )}
        </div>

        {isSignup && (
          <div>
            <label className="label" htmlFor="inviteCode">Invite code</label>
            <input
              id="inviteCode"
              className="field"
              value={values.inviteCode}
              onChange={set("inviteCode")}
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <FieldError message={fields.inviteCode} />
            {!fields.inviteCode && (
              <p className="hint mt-1">
                Leave blank only if you are setting up this tracker for the first time.
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "color-mix(in srgb, var(--status-critical) 12%, transparent)",
              color: "var(--status-critical)",
            }}
          >
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary mt-1" disabled={busy}>
          {busy ? "Just a moment…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        {isSignup ? "Already have an account? " : "Need an account? "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-semibold" style={{ color: "var(--accent)" }}>
          {isSignup ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs" style={{ color: "var(--status-critical)" }}>
      {message}
    </p>
  );
}
