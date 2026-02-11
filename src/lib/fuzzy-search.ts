import { db } from "@/db";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Compute the Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Compute a similarity score between two strings (0 to 1).
 * 1 means identical, 0 means completely different.
 */
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(al, bl) / maxLen;
}

/**
 * Compute a name-aware similarity score. Splits names into parts and
 * tries to match them individually, handling cases where first/last
 * name order might differ or individual parts are misspelled.
 */
function nameSimilarity(query: string, candidate: string): number {
  // Full-string similarity as baseline
  const fullSim = similarity(query, candidate);

  // Also try splitting into parts and matching pairwise
  const qParts = query.toLowerCase().trim().split(/\s+/);
  const cParts = candidate.toLowerCase().trim().split(/\s+/);

  if (qParts.length === 0 || cParts.length === 0) return fullSim;

  // For each query part, find the best matching candidate part
  let totalSim = 0;
  const usedIndices = new Set<number>();

  for (const qp of qParts) {
    let bestSim = 0;
    let bestIdx = -1;
    for (let i = 0; i < cParts.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = similarity(qp, cParts[i]);
      if (s > bestSim) {
        bestSim = s;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) usedIndices.add(bestIdx);
    totalSim += bestSim;
  }

  const partsSim = totalSim / Math.max(qParts.length, cParts.length);

  // Return the higher of full-string and parts-based similarity
  return Math.max(fullSim, partsSim);
}

export type FuzzyMatch = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  similarity: number;
};

/**
 * Search for existing people whose names fuzzy-match the given name.
 * Returns matches sorted by similarity (highest first), above the threshold.
 */
export async function fuzzySearchPeople(
  userId: string,
  name: string,
  threshold = 0.55
): Promise<FuzzyMatch[]> {
  const allPeople = await db
    .select({
      id: people.id,
      name: people.name,
      company: people.company,
      role: people.role,
    })
    .from(people)
    .where(eq(people.userId, userId));

  const matches: FuzzyMatch[] = [];

  for (const person of allPeople) {
    const sim = nameSimilarity(name, person.name);
    if (sim >= threshold) {
      matches.push({
        id: person.id,
        name: person.name,
        company: person.company,
        role: person.role,
        similarity: Math.round(sim * 100) / 100,
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);

  // Return top 5 at most
  return matches.slice(0, 5);
}
