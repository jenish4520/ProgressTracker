/** Drops and recreates the public schema. Destructive; local use only. */
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (/amazonaws|neon\.tech|supabase|railway/.test(url) && process.env.I_MEAN_IT !== "yes") {
    throw new Error(
      "DATABASE_URL looks like a hosted database. Re-run with I_MEAN_IT=yes if you really want to wipe it.",
    );
  }
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    console.log("Schema dropped. Run `npm run db:migrate && npm run db:seed` to rebuild.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
