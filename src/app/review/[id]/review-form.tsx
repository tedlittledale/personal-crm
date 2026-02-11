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

type FuzzyMatch = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  similarity: number;
};

type ExistingPerson = ReviewData & { id: string };

/**
 * Merge extracted data into existing person data.
 * - For text fields (personalDetails, notes, children): append new info if existing is present
 * - For other fields: use new value if existing is empty/null, otherwise keep existing
 */
function mergeData(existing: ExistingPerson, extracted: ReviewData): ExistingPerson {
  const appendField = (
    existingVal: string | null,
    newVal: string | null
  ): string | null => {
    if (!newVal) return existingVal;
    if (!existingVal) return newVal;
    // Don't duplicate if already contains the new info
    if (existingVal.includes(newVal)) return existingVal;
    return `${existingVal}\n${newVal}`;
  };

  return {
    id: existing.id,
    name: existing.name, // Keep the existing (correct) name
    company: existing.company || extracted.company,
    role: existing.role || extracted.role,
    email: existing.email || extracted.email,
    phone: existing.phone || extracted.phone,
    source: existing.source || extracted.source,
    birthdayMonth: existing.birthdayMonth ?? extracted.birthdayMonth,
    birthdayDay: existing.birthdayDay ?? extracted.birthdayDay,
    personalDetails: appendField(existing.personalDetails, extracted.personalDetails),
    notes: appendField(existing.notes, extracted.notes),
    children: appendField(existing.children, extracted.children),
  };
}

export function ReviewForm({
  reviewId,
  initialData,
  fuzzyMatches,
}: {
  reviewId: string;
  initialData: ReviewData;
  fuzzyMatches: FuzzyMatch[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Disambiguation state
  const hasMatches = fuzzyMatches.length > 0;
  const [mode, setMode] = useState<"choosing" | "edit-existing" | "add-new">(
    hasMatches ? "choosing" : "add-new"
  );
  const [selectedPerson, setSelectedPerson] = useState<ExistingPerson | null>(null);

  // The data that populates the form
  const formData = selectedPerson
    ? mergeData(selectedPerson, initialData)
    : initialData;

  async function handleSelectExisting(matchId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${matchId}`);
      if (!res.ok) throw new Error("Failed to load person details");
      const person = await res.json();
      setSelectedPerson({
        id: person.id,
        name: person.name,
        company: person.company,
        role: person.role,
        email: person.email,
        phone: person.phone,
        personalDetails: person.personalDetails,
        notes: person.notes,
        source: person.source,
        birthdayMonth: person.birthdayMonth,
        birthdayDay: person.birthdayDay,
        children: person.children,
      });
      setMode("edit-existing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load person");
    } finally {
      setLoading(false);
    }
  }

  function handleAddNew() {
    setSelectedPerson(null);
    setMode("add-new");
  }

  function handleBackToChoosing() {
    setSelectedPerson(null);
    setMode("choosing");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const birthdayMonthRaw = fd.get("birthdayMonth") as string;
    const birthdayDayRaw = fd.get("birthdayDay") as string;
    const body = {
      name: fd.get("name") as string,
      company: fd.get("company") as string,
      role: fd.get("role") as string,
      email: fd.get("email") as string,
      phone: fd.get("phone") as string,
      personalDetails: fd.get("personalDetails") as string,
      notes: fd.get("notes") as string,
      source: fd.get("source") as string,
      birthdayMonth: birthdayMonthRaw ? parseInt(birthdayMonthRaw, 10) : null,
      birthdayDay: birthdayDayRaw ? parseInt(birthdayDayRaw, 10) : null,
      children: fd.get("children") as string,
    };

    try {
      let personId: string;

      if (mode === "edit-existing" && selectedPerson) {
        // Update existing person
        const res = await fetch(`/api/people/${selectedPerson.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Something went wrong");
        }
        const person = await res.json();
        personId = person.id;
      } else {
        // Create new person
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
        personId = person.id;
      }

      // Delete the pending review (best-effort)
      fetch(`/api/review/${reviewId}`, { method: "DELETE" }).catch(() => {});

      router.push(`/person/${personId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  // Disambiguation banner - shown when matches exist and user hasn't chosen yet
  if (mode === "choosing") {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 text-lg leading-none mt-0.5">!</span>
            <div>
              <p className="text-sm font-medium">
                It looks like this person might already exist
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                We found existing contacts that match &ldquo;{initialData.name}&rdquo;.
                Would you like to update an existing person or add a new one?
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {fuzzyMatches.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => handleSelectExisting(match.id)}
                disabled={loading}
                className="w-full text-left rounded-lg border border-border bg-background p-3 hover:bg-muted transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{match.name}</span>
                    {(match.role || match.company) && (
                      <span className="text-sm text-muted-foreground ml-2">
                        {[match.role, match.company].filter(Boolean).join(" at ")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(match.similarity * 100)}% match
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Click to edit this person with the new information
                </p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddNew}
            className="w-full rounded-lg border border-border bg-background p-3 text-left hover:bg-muted transition-colors"
          >
            <span className="text-sm font-medium">Add as new person</span>
            <p className="text-xs text-muted-foreground mt-1">
              Create a new contact for &ldquo;{initialData.name}&rdquo;
            </p>
          </button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground text-center">
            Loading person details...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show mode indicator when matches existed */}
      {hasMatches && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-2">
          <p className="text-sm">
            {mode === "edit-existing" && selectedPerson
              ? <>Editing <span className="font-medium">{selectedPerson.name}</span> with new information</>
              : <>Adding <span className="font-medium">{initialData.name}</span> as a new person</>}
          </p>
          <button
            type="button"
            onClick={handleBackToChoosing}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Change
          </button>
        </div>
      )}

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
            key={`name-${selectedPerson?.id ?? "new"}`}
            defaultValue={formData.name}
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
              key={`company-${selectedPerson?.id ?? "new"}`}
              defaultValue={formData.company ?? ""}
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
              key={`role-${selectedPerson?.id ?? "new"}`}
              defaultValue={formData.role ?? ""}
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
            key={`source-${selectedPerson?.id ?? "new"}`}
            defaultValue={formData.source ?? ""}
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
              key={`email-${selectedPerson?.id ?? "new"}`}
              defaultValue={formData.email ?? ""}
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
              key={`phone-${selectedPerson?.id ?? "new"}`}
              defaultValue={formData.phone ?? ""}
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
                key={`bmonth-${selectedPerson?.id ?? "new"}`}
                defaultValue={formData.birthdayMonth?.toString() ?? ""}
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
                key={`bday-${selectedPerson?.id ?? "new"}`}
                defaultValue={formData.birthdayDay?.toString() ?? ""}
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
              key={`children-${selectedPerson?.id ?? "new"}`}
              defaultValue={formData.children ?? ""}
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
            key={`pd-${selectedPerson?.id ?? "new"}`}
            defaultValue={formData.personalDetails ?? ""}
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
            key={`notes-${selectedPerson?.id ?? "new"}`}
            defaultValue={formData.notes ?? ""}
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
            {saving
              ? "Saving..."
              : mode === "edit-existing"
                ? "Update & Save"
                : "Confirm & Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
