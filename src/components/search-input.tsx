"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition, useRef, useEffect } from "react";

// Heuristic: if the query contains question-like words, treat as NL query
const NL_PATTERN =
  /\b(who|which|find|show|list|people|contacts?|anyone|everybody|someone|what|where|when|how many|birthdays?|works?\s+at|met\s+at|without|with)\b/i;

type Person = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  source: string | null;
  aiSummary?: string | null;
  updatedAt: Date | string;
};

type NLSearchResult = {
  results: Person[];
  summary: string;
};

export function SearchInput({
  onNLResults,
  onNLClear,
}: {
  onNLResults?: (data: NLSearchResult) => void;
  onNLClear?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isNLSearching, setIsNLSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (term: string) => {
      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!term) {
        // Clear both NL and regular search
        onNLClear?.();
        startTransition(() => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("search");
          router.replace(`/?${params.toString()}`);
        });
        return;
      }

      // Debounce all searches by 300ms
      debounceRef.current = setTimeout(() => {
        if (NL_PATTERN.test(term)) {
          // Natural language search
          setIsNLSearching(true);
          fetch(`/api/search?q=${encodeURIComponent(term)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.results) {
                onNLResults?.(data);
              }
            })
            .catch(console.error)
            .finally(() => setIsNLSearching(false));
        } else {
          // Regular name search
          onNLClear?.();
          startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("search", term);
            router.replace(`/?${params.toString()}`);
          });
        }
      }, 300);
    },
    [router, searchParams, startTransition, onNLResults, onNLClear]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showSpinner = isPending || isNLSearching;

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search by name or ask a question..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => handleSearch(e.target.value)}
        className={`w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 ${
          showSpinner ? "opacity-60" : ""
        }`}
      />
      {showSpinner && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
    </div>
  );
}
