"use client";

import { useState } from "react";

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for browsers without the async clipboard API.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy failed");
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleClick() {
    try {
      await copyText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
