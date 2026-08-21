# ProgressTracker

A private fitness tracker: what you ate, what you lifted, what you weigh — and
what that combination is actually doing to your body.

Built as a mobile-first PWA. Install it to your phone home screen, log a set
between exercises with no signal, and let it sync when you resurface.

---

## What it does

**Learns your real metabolism.** Standard calorie formulas are population
averages and can be 300+ kcal wrong for any individual. After about two weeks
of logging, this measures your actual maintenance calories from the only
evidence that counts — what you ate versus what your weight did:

```
TDEE = average intake + (weight change × 7700 kcal/kg ÷ days)
```

Ate 2,200 kcal and lost 0.4 kg over 14 days? You burn roughly 2,420 kcal a day.
Measured, not assumed. The estimate blends with the formula in proportion to
how much data backs it, so the number moves smoothly from textbook guess to
measured fact instead of lurching once a threshold is crossed.

**Tells you the truth about your weight.** Water, glycogen and salt swing daily
weight by 1–2 kg, which completely buries the 0.5 kg/week you are working for.
Every screen shows the smoothed trend, plus your *actual* rate of change from a
least-squares fit — so you can see a working diet is working on day three
instead of concluding it has stalled.

**Compares plan against reality.** You set a goal — lose 0.5 kg/week, gain
0.25, hold steady — and it derives your calorie and macro targets, then reports
what is genuinely happening beside what you intended, in plain language.

**Logs training without fighting you.** Save routines that pre-fill with last
session's weights, or start empty and add as you go. Volume, estimated 1RM and
MET-based calorie burn per session.

**Barcode scanning for German shelves.** Backed by Open Food Facts, which has
strong coverage of Rewe, Aldi, Lidl and dm products. Scan, pick a portion, done.

### Privacy

Every account is an island. There is no sharing, no feed, no leaderboard —
nobody can see anyone else's weight, food or training. New accounts require an
invite code you generate, so the instance stays limited to people you actually
know. Sessions are database rows, not JWTs, so signing out a lost phone really
revokes it.

---

## Running it

**You need:** Node 20+ and a PostgreSQL database.

```bash
git clone <this repo> && cd ProgressTracker
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
DATABASE_URL="postgres://tracker:tracker@localhost:5432/progresstracker"
SESSION_SECRET="…"          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ALLOW_BOOTSTRAP_SIGNUP="true"
```

Need a local database? `docker compose up -d` starts one matching that URL.

```bash
npm run db:migrate   # create the schema
npm run db:seed      # load the 61-exercise catalogue
npm run dev          # http://localhost:3000
```

Register the first account — with `ALLOW_BOOTSTRAP_SIGNUP="true"` it needs no
invite code and becomes the admin. **Set that back to `"false"` afterwards.**

### Adding your friends

Generate a code in **Settings → Invite a friend**, or from the terminal:

```bash
npm run invite -- --uses 1 --days 30 --note "Marco"
```

### Installing on a phone

Open the site in mobile Safari or Chrome and choose *Add to Home Screen*. It
then runs full-screen, and workout logging works with no connection.

Note that **the camera requires HTTPS** — barcode scanning will not work over
plain `http://` except on `localhost`. Any of Vercel, Railway or Fly gives you
HTTPS by default; for a home server, put Caddy or a Cloudflare tunnel in front.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Full test suite |
| `npm run typecheck` | TypeScript, no emit |
| `./scripts/check.sh` | Typecheck + tests + build, as CI would |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the exercise catalogue (re-runnable) |
| `npm run db:reset` | **Drops everything.** Local use only |
| `npm run invite -- --uses 1 --days 30` | Generate an invite code |

---

## How it is put together

Next.js 16 (App Router) · TypeScript · PostgreSQL via Drizzle · Tailwind v4.

```
src/
  lib/          Pure domain logic — no I/O, so it is all directly testable
    nutrition   BMR, TDEE, adaptive TDEE, calorie and macro targets
    trend       EMA smoothing, least-squares rate, goal projection
    training    Volume, estimated 1RM, MET calorie burn
    food        Open Food Facts parsing, portion maths
    dates       Timezone-correct calendar days
  server/       Data access. Every query scoped by the session user's id
  db/           Schema, hand-written SQL migrations, exercise seed
  app/          Pages and API routes
  components/   UI, including the inline-SVG charts
tests/          56 tests: unit maths plus integration against real Postgres
```

**Migrations are hand-written SQL**, applied once each by a small runner that
records checksums and refuses to proceed if an already-applied file has been
edited. This keeps the CHECK constraints and partial indexes a schema generator
would silently drop.

**Offline sync is idempotent.** Each workout is assigned an id on the device
before it can ever reach the server, and sync upserts on that id. Replaying a
queue after a flaky connection converges on one row rather than duplicating
your session. Failures are reported per workout, so one bad record cannot wedge
everything queued behind it.

**Colours are validated, not chosen by eye.** The chart palette clears
colourblind-separation, lightness-band and contrast gates in both light and
dark mode; dark is a separately selected set of steps for the dark surface, not
an inverted light palette.

---

## Things worth knowing

- **Calories burned in training are estimates.** MET values are population
  averages. Treat the number as a consistent signal for comparing your own
  sessions — not as a budget to eat back.
- **The adaptive TDEE needs honest logging.** It infers your burn from your
  intake, so consistently under-logging food makes it think you burn less than
  you do. It rejects physiologically implausible results rather than believing
  an incomplete log.
- **Aggressive rates are clamped.** Requesting a pace that would drive your
  target below a safe intake floors it and tells you it did.
- **This is not medical advice.** If you have a health condition or an eating
  disorder history, talk to a doctor or dietitian before running a deficit.

## Credits

Food data from [Open Food Facts](https://world.openfoodfacts.org), used under
the [ODbL](https://opendatacommons.org/licenses/odbl/). MET values from the
Compendium of Physical Activities. BMR via Mifflin-St Jeor.
