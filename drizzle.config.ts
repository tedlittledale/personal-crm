import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

const envFile = process.env.DB_ENV === "staging" ? ".env.staging" : ".env.local";
dotenv.config({ path: envFile });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
