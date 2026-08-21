/**
 * Creates an invite code from the command line.
 *
 * Useful when you want to hand a friend a code without opening the app —
 * or to get back in if you have locked yourself out of signup.
 *
 *   npm run invite -- --uses 1 --days 30 --note "Marco"
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

  const uses = Math.max(1, Number(flag("uses", "1")));
  const days = Math.max(1, Number(flag("days", "30")));
  const note = flag("note", "");

  const sql = postgres(url, { max: 1 });
  try {
    const code = generateCode();
    await sql`
      INSERT INTO invite_codes (code, created_by, note, max_uses, expires_at)
      VALUES (${code}, NULL, ${note || null}, ${uses}, now() + ${`${days} days`}::interval)`;

    console.log(`\n  Invite code:  ${code}`);
    console.log(`  Uses:         ${uses}`);
    console.log(`  Expires:      in ${days} day(s)`);
    if (note) console.log(`  Note:         ${note}`);
    console.log(`\n  Share it — they enter it on the sign-up screen.\n`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Could not create an invite:", err instanceof Error ? err.message : err);
  process.exit(1);
});
