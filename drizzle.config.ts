import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// The Supabase transaction pooler (port 6543) shares server connections across
// every app using this database, so another app's `SET search_path` can leak in
// and make unqualified statements resolve against the wrong schema. Run
// migrations over the session pooler (port 5432) to get a dedicated connection.
const url = new URL(process.env.DATABASE_URL!);
if (url.port === "6543") url.port = "5432";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: url.toString(),
  },
});
