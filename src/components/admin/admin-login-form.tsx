"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setErrorMessage(body?.message ?? "Login gagal.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Admin Login</h1>
      <p className="mt-1 text-xs text-slate-600">
        Masukkan password admin untuk mengakses editor katalog.
      </p>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-teal-600"
            placeholder="********"
            autoComplete="current-password"
          />
        </label>

        {errorMessage ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Memproses..." : "Masuk Admin"}
        </button>
      </form>
    </div>
  );
}
