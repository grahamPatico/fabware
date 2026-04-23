import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// In production on Vercel Functions, the same deployment serves the static
// frontend AND the API routes. The frontend build should never touch this
// module, but the API handler does — and if DATABASE_URL is missing we want
// the server to still boot (so /api/healthz works) and only fail on DB-
// touching routes. Cold-start crashes are harder to diagnose than 500s on a
// specific route.
const connectionString = process.env.DATABASE_URL;
const hasDb = !!connectionString;

export const pool = hasDb ? new Pool({ connectionString }) : null;

function notConfigured(): never {
  throw new Error(
    "DATABASE_URL is not set. Provision a Postgres database (Neon / Vercel Postgres) and add DATABASE_URL to the project env.",
  );
}

// `db` is typed as if always present; callers at the route layer should
// treat a request that touches the DB as potentially throwing.
export const db = hasDb
  ? drizzle(pool!, { schema })
  : (new Proxy({}, {
      get() {
        return notConfigured;
      },
    }) as ReturnType<typeof drizzle>);

export const isDatabaseConfigured = hasDb;

export * from "./schema";
