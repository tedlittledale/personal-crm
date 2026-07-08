import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Use a single connection for serverless environments.
// search_path is pinned because the Supabase transaction pooler shares server
// connections across apps, and another app's `SET search_path` can leak in.
const client = postgres(connectionString, {
  prepare: false,
  connection: { search_path: "public" },
});

export const db = drizzle(client, { schema });
