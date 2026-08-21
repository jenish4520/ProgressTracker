/**
 * Minimal forward-only migration runner.
 *
 * Applies every .sql file in drizzle/ in filename order exactly once, each in
 * its own transaction, recording what ran in _migrations. Deliberately not
 * drizzle-kit: hand-written SQL keeps CHECK constraints and partial indexes
 * that the generator would drop, and removes a dependency from the tree.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;

    const applied = new Map(
      (await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM _migrations`)
        .map((r) => [r.name, r.checksum] as const),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;

    for (const file of files) {
      const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);
      const previous = applied.get(file);

      if (previous) {
        // An edited migration means the database and the repo disagree about
        // what the schema is — fail loudly rather than silently diverging.
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} changed after it was applied (${previous} -> ${checksum}). ` +
              `Add a new migration file instead of editing an applied one.`,
          );
        }
        continue;
      }

      process.stdout.write(`  applying ${file} ... `);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations (name, checksum) VALUES (${file}, ${checksum})`;
      });
      process.stdout.write("ok\n");
      ran++;
    }

    console.log(ran ? `Applied ${ran} migration(s).` : "Database already up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
