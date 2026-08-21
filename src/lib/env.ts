/**
 * Validated environment access. Importing this from a module that reaches the
 * browser bundle is a build error by construction — every value here is
 * server-only and read lazily so `next build` does not require a live database.
 */
import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error(
        "SESSION_SECRET must be at least 32 characters. Generate one with: " +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    return secret;
  },
  get allowBootstrapSignup() {
    return process.env.ALLOW_BOOTSTRAP_SIGNUP === "true";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
