"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const SHORTCUT_ICLOUD_URL =
  "https://www.icloud.com/shortcuts/5c5a0a3d730a43699813cac9264c4c05";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Telegram state
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramUnlinking, setTelegramUnlinking] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramCopied, setTelegramCopied] = useState(false);

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

  const fetchTelegramStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/telegram/status");
      if (res.ok) {
        const data = await res.json();
        setTelegramLinked(data.linked);
      }
    } finally {
      setTelegramLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKey();
    fetchTelegramStatus();
  }, [fetchApiKey, fetchTelegramStatus]);

  // Poll for link status while the deep link is shown
  useEffect(() => {
    if (!telegramDeepLink || telegramLinked) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/settings/telegram/status");
        if (res.ok) {
          const data = await res.json();
          if (data.linked) {
            setTelegramLinked(true);
            setTelegramDeepLink(null);
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [telegramDeepLink, telegramLinked]);

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

  async function handleCopy() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLinkTelegram() {
    setTelegramLinking(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/settings/telegram/link", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setTelegramDeepLink(data.deepLink);
      } else {
        setTelegramError(data.error || "Failed to generate link");
      }
    } catch (err) {
      setTelegramError("Network error. Please try again.");
    } finally {
      setTelegramLinking(false);
    }
  }

  async function handleUnlinkTelegram() {
    if (!confirm("Unlink your Telegram account? You'll stop receiving weekly summaries."))
      return;

    setTelegramUnlinking(true);
    try {
      const res = await fetch("/api/settings/telegram/link", {
        method: "DELETE",
      });
      if (res.ok) {
        setTelegramLinked(false);
        setTelegramDeepLink(null);
      }
    } finally {
      setTelegramUnlinking(false);
    }
  }

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${"*".repeat(20)}${apiKey.slice(-4)}`
    : "";

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Telegram / Notifications Section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Link your Telegram account to receive weekly contact summaries and ask
          questions about your contacts via chat.
        </p>

        {telegramLoading ? (
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
        ) : telegramLinked ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">Telegram linked</span>
            </div>
            <button
              onClick={handleUnlinkTelegram}
              disabled={telegramUnlinking}
              className="text-sm text-destructive hover:underline disabled:opacity-50"
            >
              {telegramUnlinking ? "Unlinking..." : "Unlink"}
            </button>
          </div>
        ) : telegramDeepLink ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Click the link below to open Telegram and connect your account:
            </p>
            <div className="flex items-center gap-2">
              <a
                href={telegramDeepLink}
                className="inline-flex items-center rounded-lg bg-[#0088cc] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Open in Telegram
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(telegramDeepLink);
                    setTelegramCopied(true);
                    setTimeout(() => setTelegramCopied(false), 2000);
                  } catch {
                    // Fallback: select text in a temp input
                    const input = document.createElement("input");
                    input.value = telegramDeepLink;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand("copy");
                    document.body.removeChild(input);
                    setTelegramCopied(true);
                    setTimeout(() => setTelegramCopied(false), 2000);
                  }
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {telegramCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              After clicking, press &ldquo;Start&rdquo; in Telegram to complete the link.
              Then come back here and refresh to see the status update.
            </p>
          </div>
        ) : (
          <button
            onClick={handleLinkTelegram}
            disabled={telegramLinking}
            className="inline-flex items-center rounded-lg bg-[#0088cc] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {telegramLinking ? "Generating link..." : "Link Telegram"}
          </button>
        )}

        {telegramError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {telegramError}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Once linked you will:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Receive a weekly summary of new contacts and upcoming birthdays</li>
            <li>Be able to ask questions about your contacts via Telegram</li>
          </ul>
        </div>
      </section>

      {/* iOS Shortcut Section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">iOS Shortcut</h2>
        <p className="text-sm text-muted-foreground">
          Install the People Notes shortcut on your iPhone. After recording a
          voice note in your transcription app (e.g. Whisper Notes), share the
          text to this shortcut.
        </p>

        <p className="text-sm text-muted-foreground">
          First, copy your API key below. You&rsquo;ll need to paste it when
          installing the shortcut.
        </p>

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
                onClick={handleCopy}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
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

        <div>
          <a
            href={SHORTCUT_ICLOUD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Install Shortcut
          </a>
        </div>
      </section>

      {/* Instructions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>
            Tap &ldquo;Install Shortcut&rdquo; above and enter your API Key
            when prompted
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

      {/* Data Management Section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Data Management</h2>
        <p className="text-sm text-muted-foreground">
          Import contacts from a file or export your contacts as a CSV backup.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/import"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Import contacts
          </Link>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                window.location.href = "/api/export";
              } finally {
                // Small delay so user sees the feedback
                setTimeout(() => setExporting(false), 1500);
              }
            }}
            disabled={exporting}
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}
