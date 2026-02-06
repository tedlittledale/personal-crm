"use client";

import { useState, useEffect, useCallback } from "react";

const SHORTCUT_ICLOUD_URL =
  "https://www.icloud.com/shortcuts/f7d359d6c3924fd994ef426f7def813a";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchApiKey = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-key");
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.apiKey);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKey();
  }, [fetchApiKey]);

  async function handleRegenerate() {
    if (
      !confirm(
        "Are you sure? This will invalidate your existing API key and any shortcuts using it."
      )
    )
      return;

    setRegenerating(true);
    try {
      const res = await fetch("/api/settings/api-key/regenerate", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setApiKey(data.apiKey);
        setRevealed(true);
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${"*".repeat(20)}${apiKey.slice(-4)}`
    : "";

  const serverUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* iOS Shortcut Section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">iOS Shortcut</h2>
        <p className="text-sm text-muted-foreground">
          Install the People Notes shortcut on your iPhone. After recording a
          voice note in your transcription app (e.g. Whisper Notes), share the
          text to this shortcut.
        </p>

        <a
          href={SHORTCUT_ICLOUD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Install Shortcut
        </a>

        <p className="text-sm text-muted-foreground">
          When installing, you&rsquo;ll be asked to enter the values below.
        </p>

        {/* Server URL */}
        <div>
          <label className="block text-sm font-medium mb-1">Server URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono truncate">
              {serverUrl}
            </code>
            <button
              onClick={() => handleCopy(serverUrl, "url")}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              {copied === "url" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* API Key for shortcut setup */}
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          {loading ? (
            <div className="h-10 rounded-lg bg-muted animate-pulse" />
          ) : apiKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono truncate">
                {revealed ? apiKey : maskedKey}
              </code>
              <button
                onClick={() => setRevealed(!revealed)}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                onClick={() => handleCopy(apiKey, "key")}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {copied === "key" ? "Copied!" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No API key found. Your account may not be fully set up yet.
            </p>
          )}
        </div>

        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="text-sm text-destructive hover:underline disabled:opacity-50"
        >
          {regenerating ? "Regenerating..." : "Regenerate API key"}
        </button>
      </section>

      {/* Instructions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>
            Tap &ldquo;Install Shortcut&rdquo; above and enter your Server URL
            and API Key when prompted
          </li>
          <li>
            Record a voice note in your transcription app (e.g. Whisper Notes)
          </li>
          <li>The app transcribes your audio locally on your device</li>
          <li>
            Tap Share and select the &ldquo;People Notes&rdquo; shortcut
          </li>
          <li>
            The shortcut sends the text to our server, which extracts structured
            data using AI
          </li>
          <li>
            You&rsquo;ll be taken to a review page where you can correct any
            mistakes and save
          </li>
        </ol>
      </section>
    </div>
  );
}
