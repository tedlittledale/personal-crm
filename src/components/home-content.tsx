"use client";

import { useState, useCallback } from "react";
import { SearchInput } from "./search-input";
import { PeopleList } from "./people-list";

type Person = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  source: string | null;
  updatedAt: Date | string;
};

type NLSearchResult = {
  results: Person[];
  summary: string;
};

export function HomeContent({ serverPeople }: { serverPeople: Person[] }) {
  const [nlResult, setNlResult] = useState<NLSearchResult | null>(null);

  const handleNLResults = useCallback((data: NLSearchResult) => {
    setNlResult(data);
  }, []);

  const handleNLClear = useCallback(() => {
    setNlResult(null);
  }, []);

  const displayPeople = nlResult ? nlResult.results : serverPeople;

  return (
    <>
      <SearchInput onNLResults={handleNLResults} onNLClear={handleNLClear} />

      {nlResult && (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {nlResult.summary}
          <span className="ml-2 text-xs">
            ({nlResult.results.length} result{nlResult.results.length !== 1 ? "s" : ""})
          </span>
        </div>
      )}

      <PeopleList people={displayPeople} />
    </>
  );
}
