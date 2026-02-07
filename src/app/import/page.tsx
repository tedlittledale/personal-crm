"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type ExtractedContact = {
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

type ContactRow = ExtractedContact & {
  included: boolean;
  editing: boolean;
};

type ImportState =
  | { step: "upload" }
  | { step: "analyzing"; fileName: string }
  | { step: "review"; fileName: string; contacts: ContactRow[] }
  | { step: "importing"; count: number }
  | { step: "done"; count: number }
  | { step: "error"; message: string };

const ACCEPTED_TYPES = ".csv,.tsv,.xlsx,.xls,.txt,.md,.json";

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "upload" });
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setState({ step: "analyzing", fileName: file.name });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setState({ step: "error", message: data.error || "Upload failed" });
        return;
      }

      const data = await res.json();

      if (data.contacts.length === 0) {
        setState({
          step: "error",
          message: "No contacts found in the file. Please check the file and try again.",
        });
        return;
      }

      const contacts: ContactRow[] = data.contacts.map(
        (c: ExtractedContact) => ({
          ...c,
          included: true,
          editing: false,
        })
      );

      setState({ step: "review", fileName: data.fileName, contacts });
    } catch {
      setState({
        step: "error",
        message: "Something went wrong. Please try again.",
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  function toggleInclude(index: number) {
    if (state.step !== "review") return;
    const contacts = [...state.contacts];
    contacts[index] = { ...contacts[index], included: !contacts[index].included };
    setState({ ...state, contacts });
  }

  function toggleEdit(index: number) {
    if (state.step !== "review") return;
    const contacts = [...state.contacts];
    contacts[index] = { ...contacts[index], editing: !contacts[index].editing };
    setState({ ...state, contacts });
  }

  function updateContact(index: number, field: keyof ExtractedContact, value: string) {
    if (state.step !== "review") return;
    const contacts = [...state.contacts];
    let parsed: string | number | null = value || null;
    if (field === "birthdayMonth" || field === "birthdayDay") {
      parsed = value ? parseInt(value, 10) : null;
    }
    contacts[index] = { ...contacts[index], [field]: parsed };
    setState({ ...state, contacts });
  }

  function toggleAll(included: boolean) {
    if (state.step !== "review") return;
    const contacts = state.contacts.map((c) => ({ ...c, included }));
    setState({ ...state, contacts });
  }

  async function handleImport() {
    if (state.step !== "review") return;

    const selected = state.contacts.filter((c) => c.included);
    if (selected.length === 0) return;

    setState({ step: "importing", count: selected.length });

    try {
      const contacts = selected.map(({ included, editing, ...rest }) => rest);
      const res = await fetch("/api/people/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });

      if (!res.ok) {
        const data = await res.json();
        setState({
          step: "error",
          message: data.error || "Import failed",
        });
        return;
      }

      const data = await res.json();
      setState({ step: "done", count: data.created });
    } catch {
      setState({
        step: "error",
        message: "Something went wrong during import. Please try again.",
      });
    }
  }

  function reset() {
    setState({ step: "upload" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const includedCount =
    state.step === "review"
      ? state.contacts.filter((c) => c.included).length
      : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Import Contacts</h1>

      {/* Upload Step */}
      {state.step === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground"
          }`}
        >
          <div className="space-y-4">
            <div className="text-4xl">📄</div>
            <div>
              <p className="text-sm font-medium">
                Drop your file here, or{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports CSV, Excel, text files, JSON, and more
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Analyzing Step */}
      {state.step === "analyzing" && (
        <div className="border border-border rounded-xl p-12 text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <div>
            <p className="text-sm font-medium">Analyzing your file&hellip;</p>
            <p className="text-xs text-muted-foreground mt-1">
              {state.fileName}
            </p>
          </div>
        </div>
      )}

      {/* Review Step */}
      {state.step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Found <span className="font-medium text-foreground">{state.contacts.length}</span>{" "}
              contact{state.contacts.length !== 1 ? "s" : ""} in{" "}
              <span className="font-medium text-foreground">{state.fileName}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAll(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Select all
              </button>
              <span className="text-xs text-muted-foreground">/</span>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {state.contacts.map((contact, i) => (
              <div
                key={i}
                className={`border rounded-lg p-4 transition-colors ${
                  contact.included
                    ? "border-border bg-background"
                    : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={contact.included}
                    onChange={() => toggleInclude(i)}
                    className="mt-1 h-4 w-4 rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    {contact.editing ? (
                      <div className="space-y-3">
                        <EditField
                          label="Name"
                          value={contact.name}
                          onChange={(v) => updateContact(i, "name", v)}
                        />
                        <EditField
                          label="Company"
                          value={contact.company || ""}
                          onChange={(v) => updateContact(i, "company", v)}
                        />
                        <EditField
                          label="Role"
                          value={contact.role || ""}
                          onChange={(v) => updateContact(i, "role", v)}
                        />
                        <EditField
                          label="Personal Details"
                          value={contact.personalDetails || ""}
                          onChange={(v) => updateContact(i, "personalDetails", v)}
                          multiline
                        />
                        <EditField
                          label="Notes"
                          value={contact.notes || ""}
                          onChange={(v) => updateContact(i, "notes", v)}
                          multiline
                        />
                        <EditField
                          label="Source"
                          value={contact.source || ""}
                          onChange={(v) => updateContact(i, "source", v)}
                        />
                        <EditField
                          label="Email"
                          value={contact.email || ""}
                          onChange={(v) => updateContact(i, "email", v)}
                        />
                        <EditField
                          label="Phone"
                          value={contact.phone || ""}
                          onChange={(v) => updateContact(i, "phone", v)}
                        />
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Birthday
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={contact.birthdayMonth?.toString() ?? ""}
                              onChange={(e) => updateContact(i, "birthdayMonth", e.target.value)}
                              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            >
                              <option value="">Month</option>
                              {[
                                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                              ].map((m, idx) => (
                                <option key={idx + 1} value={idx + 1}>{m}</option>
                              ))}
                            </select>
                            <select
                              value={contact.birthdayDay?.toString() ?? ""}
                              onChange={(e) => updateContact(i, "birthdayDay", e.target.value)}
                              className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            >
                              <option value="">Day</option>
                              {Array.from({ length: 31 }, (_, idx) => (
                                <option key={idx + 1} value={idx + 1}>{idx + 1}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <EditField
                          label="Children"
                          value={contact.children || ""}
                          onChange={(v) => updateContact(i, "children", v)}
                        />
                        <button
                          onClick={() => toggleEdit(i)}
                          className="text-xs text-primary hover:underline"
                        >
                          Done editing
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{contact.name}</p>
                          <button
                            onClick={() => toggleEdit(i)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                        {(contact.role || contact.company) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[contact.role, contact.company]
                              .filter(Boolean)
                              .join(" at ")}
                          </p>
                        )}
                        {contact.personalDetails && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {contact.personalDetails}
                          </p>
                        )}
                        {contact.notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {contact.notes}
                          </p>
                        )}
                        {(contact.birthdayMonth || contact.birthdayDay) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Birthday: {contact.birthdayMonth ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][contact.birthdayMonth - 1] : "?"} {contact.birthdayDay ?? "?"}
                          </p>
                        )}
                        {contact.children && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Children: {contact.children}
                          </p>
                        )}
                        {contact.source && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Source: {contact.source}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={reset}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Start over
            </button>
            <button
              onClick={handleImport}
              disabled={includedCount === 0}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {includedCount} contact{includedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* Importing Step */}
      {state.step === "importing" && (
        <div className="border border-border rounded-xl p-12 text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm font-medium">
            Importing {state.count} contact{state.count !== 1 ? "s" : ""}&hellip;
          </p>
        </div>
      )}

      {/* Done Step */}
      {state.step === "done" && (
        <div className="border border-border rounded-xl p-12 text-center space-y-4">
          <div className="text-4xl">✓</div>
          <div>
            <p className="text-sm font-medium">
              Successfully imported {state.count} contact
              {state.count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              View contacts
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Import more
            </button>
          </div>
        </div>
      )}

      {/* Error Step */}
      {state.step === "error" && (
        <div className="border border-destructive/50 bg-destructive/5 rounded-xl p-8 text-center space-y-4">
          <p className="text-sm text-destructive font-medium">
            {state.message}
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      )}
    </div>
  );
}
