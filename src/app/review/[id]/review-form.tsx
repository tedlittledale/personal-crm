"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReviewData = {
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  personalDetails: string | null;
  notes: string | null;
  source: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  children: string | null;
};

export function ReviewForm({
  reviewId,
  initialData,
}: {
  reviewId: string;
  initialData: ReviewData;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const birthdayMonthRaw = formData.get("birthdayMonth") as string;
    const birthdayDayRaw = formData.get("birthdayDay") as string;
    const body = {
      name: formData.get("name") as string,
      company: formData.get("company") as string,
      role: formData.get("role") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      personalDetails: formData.get("personalDetails") as string,
      notes: formData.get("notes") as string,
      source: formData.get("source") as string,
      birthdayMonth: birthdayMonthRaw ? parseInt(birthdayMonthRaw, 10) : null,
      birthdayDay: birthdayDayRaw ? parseInt(birthdayDayRaw, 10) : null,
      children: formData.get("children") as string,
    };

    try {
      // Create the person record
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      const person = await res.json();

      // Delete the pending review (best-effort)
      fetch(`/api/review/${reviewId}`, { method: "DELETE" }).catch(() => {});

      router.push(`/person/${person.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Name *
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initialData.name}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="company" className="block text-sm font-medium mb-1">
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            defaultValue={initialData.company ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium mb-1">
            Role
          </label>
          <input
            id="role"
            name="role"
            type="text"
            defaultValue={initialData.role ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      <div>
        <label htmlFor="source" className="block text-sm font-medium mb-1">
          How you met
        </label>
        <input
          id="source"
          name="source"
          type="text"
          defaultValue={initialData.source ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initialData.email ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialData.phone ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Birthday</label>
          <div className="flex gap-2">
            <select
              name="birthdayMonth"
              defaultValue={initialData.birthdayMonth?.toString() ?? ""}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">Month</option>
              {[
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
              ].map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              name="birthdayDay"
              defaultValue={initialData.birthdayDay?.toString() ?? ""}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="children" className="block text-sm font-medium mb-1">
            Children
          </label>
          <input
            id="children"
            name="children"
            type="text"
            defaultValue={initialData.children ?? ""}
            placeholder="e.g. Emma (8), Jack (5)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="personalDetails"
          className="block text-sm font-medium mb-1"
        >
          Personal details
        </label>
        <textarea
          id="personalDetails"
          name="personalDetails"
          rows={3}
          defaultValue={initialData.personalDetails ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initialData.notes ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm & Save"}
        </button>
      </div>
    </form>
  );
}
