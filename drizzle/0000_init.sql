-- Initial schema for ProgressTracker.
-- Every user-owned table cascades from users(id): deleting an account removes
-- all of that person's body, food and training data with it.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  sex            text CHECK (sex IN ('male','female')),
  birth_date     date,
  height_cm      double precision CHECK (height_cm IS NULL OR (height_cm > 50 AND height_cm < 260)),
  activity_level text DEFAULT 'light' CHECK (activity_level IN ('sedentary','light','moderate','very','extra')),
  unit_system    text NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','imperial')),
  onboarded_at   timestamptz,
  is_admin       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive: nobody should be able to register Jenish@… twice.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE invite_codes (
  code       text PRIMARY KEY,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note       text,
  max_uses   integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses       integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invite_codes_created_by_idx ON invite_codes (created_by);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE goals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('cut','bulk','maintain')),
  rate_kg_per_week   double precision NOT NULL DEFAULT 0 CHECK (rate_kg_per_week >= 0 AND rate_kg_per_week <= 2),
  start_weight_kg    double precision,
  target_weight_kg   double precision,
  start_date         date NOT NULL,
  calorie_override   integer CHECK (calorie_override IS NULL OR calorie_override > 0),
  protein_override_g integer CHECK (protein_override_g IS NULL OR protein_override_g >= 0),
  fat_override_g     integer CHECK (fat_override_g IS NULL OR fat_override_g >= 0),
  is_active          boolean NOT NULL DEFAULT true,
  ended_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_user_active_idx ON goals (user_id, is_active);
-- At most one active goal per user; the app ends the old one when a new is set.
CREATE UNIQUE INDEX goals_one_active_per_user ON goals (user_id) WHERE is_active;

CREATE TABLE body_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  weight_kg    double precision CHECK (weight_kg IS NULL OR (weight_kg > 20 AND weight_kg < 500)),
  body_fat_pct double precision CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 75)),
  waist_cm     double precision,
  chest_cm     double precision,
  hips_cm      double precision,
  arm_cm       double precision,
  thigh_cm     double precision,
  neck_cm      double precision,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX body_entries_user_date_unique ON body_entries (user_id, date);

CREATE TABLE foods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  source          text NOT NULL DEFAULT 'custom' CHECK (source IN ('openfoodfacts','custom')),
  barcode         text,
  name            text NOT NULL,
  brand           text,
  kcal_per_100    double precision NOT NULL CHECK (kcal_per_100 >= 0 AND kcal_per_100 <= 1000),
  protein_per_100 double precision NOT NULL DEFAULT 0 CHECK (protein_per_100 >= 0),
  carbs_per_100   double precision NOT NULL DEFAULT 0 CHECK (carbs_per_100 >= 0),
  fat_per_100     double precision NOT NULL DEFAULT 0 CHECK (fat_per_100 >= 0),
  fiber_per_100   double precision,
  sugar_per_100   double precision,
  salt_per_100    double precision,
  serving_name    text,
  serving_grams   double precision CHECK (serving_grams IS NULL OR serving_grams > 0),
  is_liquid       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX foods_barcode_global_unique
  ON foods (barcode) WHERE owner_id IS NULL AND barcode IS NOT NULL;
CREATE INDEX foods_owner_idx ON foods (owner_id);
CREATE INDEX foods_name_idx ON foods (name);
-- Trigram index powers the "type a few letters" food search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX foods_name_trgm_idx ON foods USING gin (name gin_trgm_ops);

CREATE TABLE food_log_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  meal          text NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','snack')),
  food_id       uuid REFERENCES foods(id) ON DELETE SET NULL,
  quantity_g    double precision NOT NULL CHECK (quantity_g > 0),
  name_snapshot text NOT NULL,
  kcal          double precision NOT NULL CHECK (kcal >= 0),
  protein_g     double precision NOT NULL DEFAULT 0,
  carbs_g       double precision NOT NULL DEFAULT 0,
  fat_g         double precision NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_log_user_date_idx ON food_log_entries (user_id, date);

CREATE TABLE exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'strength' CHECK (kind IN ('strength','cardio')),
  muscle_group  text NOT NULL,
  equipment     text,
  met           double precision NOT NULL DEFAULT 5 CHECK (met > 0 AND met < 25),
  is_bodyweight boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exercises_owner_idx ON exercises (owner_id);
CREATE INDEX exercises_name_idx ON exercises (name);
-- Built-in catalogue names stay unique so seeding is re-runnable.
CREATE UNIQUE INDEX exercises_builtin_name_unique
  ON exercises (lower(name)) WHERE owner_id IS NULL;

CREATE TABLE routines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  note        text,
  position    integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX routines_user_idx ON routines (user_id);

CREATE TABLE routine_exercises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id   uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position     integer NOT NULL DEFAULT 0,
  target_sets  integer NOT NULL DEFAULT 3 CHECK (target_sets > 0),
  target_reps  integer NOT NULL DEFAULT 8 CHECK (target_reps > 0),
  rest_seconds integer NOT NULL DEFAULT 120 CHECK (rest_seconds >= 0)
);
CREATE INDEX routine_exercises_routine_idx ON routine_exercises (routine_id);

CREATE TABLE workouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id      uuid REFERENCES routines(id) ON DELETE SET NULL,
  name            text NOT NULL,
  date            date NOT NULL,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  note            text,
  calories_burned integer CHECK (calories_burned IS NULL OR calories_burned >= 0),
  client_id       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Idempotent offline sync: replaying a queued workout updates, never duplicates.
CREATE UNIQUE INDEX workouts_user_client_unique ON workouts (user_id, client_id);
CREATE INDEX workouts_user_date_idx ON workouts (user_id, date);

CREATE TABLE workout_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id       uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id      uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position         integer NOT NULL DEFAULT 0,
  set_index        integer NOT NULL DEFAULT 1,
  reps             integer CHECK (reps IS NULL OR (reps >= 0 AND reps <= 1000)),
  weight_kg        double precision CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)),
  rpe              double precision CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  is_warmup        boolean NOT NULL DEFAULT false,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  distance_m       double precision CHECK (distance_m IS NULL OR distance_m >= 0),
  completed        boolean NOT NULL DEFAULT true
);
CREATE INDEX workout_sets_workout_idx ON workout_sets (workout_id);
