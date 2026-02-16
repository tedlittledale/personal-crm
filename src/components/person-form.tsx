"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PersonData = {
  id?: string;
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

export function PersonForm({
  initialData,
  mode,
}: {
  initialData?: PersonData;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveCompleteTimer.current) clearTimeout(saveCompleteTimer.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saveCompleteTimer.current) clearTimeout(saveCompleteTimer.current);
    setSaveComplete(false);
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
      const url =
        mode === "edit" ? `/api/people/${initialData!.id}` : "/api/people";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      const person = await res.json();

      if (mode === "edit") {
        setSaving(false);
        setSaveComplete(true);
        router.refresh();
        saveCompleteTimer.current = setTimeout(() => {
          setSaveComplete(false);
        }, 2000);
      } else {
        router.push(`/person/${person.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData?.id) return;
    if (!confirm("Are you sure you want to delete this person?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/people/${initialData.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/");
      router.refresh();
    } catch {
      setError("Failed to delete");
    } finally {
      setDeleting(false);
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
          defaultValue={initialData?.name ?? ""}
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
            defaultValue={initialData?.company ?? ""}
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
            defaultValue={initialData?.role ?? ""}
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
          defaultValue={initialData?.source ?? ""}
          placeholder="e.g. Tech conference in London, introduced by Sarah"
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
            defaultValue={initialData?.email ?? ""}
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
            defaultValue={initialData?.phone ?? ""}
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
              defaultValue={initialData?.birthdayMonth?.toString() ?? ""}
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
              defaultValue={initialData?.birthdayDay?.toString() ?? ""}
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
            defaultValue={initialData?.children ?? ""}
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
          defaultValue={initialData?.personalDetails ?? ""}
          placeholder="Family, interests, hobbies, preferences..."
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
          defaultValue={initialData?.notes ?? ""}
          placeholder="Anything else worth remembering..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          {mode === "edit" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm text-destructive hover:underline disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete person"}
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-500",
              saveComplete
                ? "bg-green-600 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50",
            ].join(" ")}
          >
            {saving
              ? "Saving..."
              : saveComplete
                ? "Save complete"
                : mode === "edit"
                  ? "Save changes"
                  : "Add person"}
          </button>
        </div>
      </div>
    </form>
  );
}
