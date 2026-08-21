import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  date,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Shared value types.
 *
 * These are stored as `text` with CHECK constraints (see the SQL
 * migration) rather than native Postgres enums: adding a new activity
 * level or meal slot later is a one-line constraint swap instead of an
 * ALTER TYPE dance that locks the table.
 * ------------------------------------------------------------------ */

export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "extra";
export type GoalType = "cut" | "bulk" | "maintain";
export type UnitSystem = "metric" | "imperial";
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "openfoodfacts" | "custom";
export type ExerciseKind = "strength" | "cardio";

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),

    // Profile — needed by the BMR/TDEE engine. Nullable until onboarding
    // completes, so a half-finished signup never blocks login.
    sex: text("sex").$type<Sex>(),
    birthDate: date("birth_date"),
    heightCm: doublePrecision("height_cm"),
    activityLevel: text("activity_level").$type<ActivityLevel>().default("light"),

    unitSystem: text("unit_system").$type<UnitSystem>().notNull().default("metric"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    code: text("code").primaryKey(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invite_codes_created_by_idx").on(t.createdBy)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Only a hash of the cookie token is stored, so a database leak does not
    // hand out live sessions.
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<GoalType>().notNull(),

    // Positive kg/week in the direction of the goal: 0.5 on a cut means
    // "lose 0.5 kg/week", 0.25 on a bulk means "gain 0.25 kg/week".
    rateKgPerWeek: doublePrecision("rate_kg_per_week").notNull().default(0),
    startWeightKg: doublePrecision("start_weight_kg"),
    targetWeightKg: doublePrecision("target_weight_kg"),
    startDate: date("start_date").notNull(),

    // When set, these override the values the engine would compute. Lets an
    // experienced user pin their own numbers without fighting the algorithm.
    calorieOverride: integer("calorie_override"),
    proteinOverrideG: integer("protein_override_g"),
    fatOverrideG: integer("fat_override_g"),

    isActive: boolean("is_active").notNull().default(true),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goals_user_active_idx").on(t.userId, t.isActive)],
);

/* ------------------------------------------------------------------ *
 * Body metrics
 * ------------------------------------------------------------------ */

export const bodyEntries = pgTable(
  "body_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Logical calendar day, not an instant: a 07:00 weigh-in belongs to that
    // date regardless of the timezone the phone was in.
    date: date("date").notNull(),
    weightKg: doublePrecision("weight_kg"),
    bodyFatPct: doublePrecision("body_fat_pct"),
    waistCm: doublePrecision("waist_cm"),
    chestCm: doublePrecision("chest_cm"),
    hipsCm: doublePrecision("hips_cm"),
    armCm: doublePrecision("arm_cm"),
    thighCm: doublePrecision("thigh_cm"),
    neckCm: doublePrecision("neck_cm"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One row per user per day: a second weigh-in on the same day updates the
  // existing entry rather than creating a duplicate the trend has to average.
  (t) => [uniqueIndex("body_entries_user_date_unique").on(t.userId, t.date)],
);

/* ------------------------------------------------------------------ *
 * Nutrition
 * ------------------------------------------------------------------ */

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Null for global Open Food Facts cache rows, set for a user's own foods.
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    source: text("source").$type<FoodSource>().notNull().default("custom"),
    barcode: text("barcode"),
    name: text("name").notNull(),
    brand: text("brand"),

    // Everything is normalised per 100 g/ml on the way in, which makes
    // arbitrary portion maths a single multiplication everywhere else.
    kcalPer100: doublePrecision("kcal_per_100").notNull(),
    proteinPer100: doublePrecision("protein_per_100").notNull().default(0),
    carbsPer100: doublePrecision("carbs_per_100").notNull().default(0),
    fatPer100: doublePrecision("fat_per_100").notNull().default(0),
    fiberPer100: doublePrecision("fiber_per_100"),
    sugarPer100: doublePrecision("sugar_per_100"),
    saltPer100: doublePrecision("salt_per_100"),

    // Optional "1 serving = 30 g" hint so the UI can offer real-world portions.
    servingName: text("serving_name"),
    servingGrams: doublePrecision("serving_grams"),
    isLiquid: boolean("is_liquid").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Barcodes are unique only among the shared Open Food Facts cache rows;
    // a user may still save their own variant of the same product.
    uniqueIndex("foods_barcode_global_unique")
      .on(t.barcode)
      .where(sql`owner_id IS NULL AND barcode IS NOT NULL`),
    index("foods_owner_idx").on(t.ownerId),
    index("foods_name_idx").on(t.name),
  ],
);

export const foodLogEntries = pgTable(
  "food_log_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    meal: text("meal").$type<Meal>().notNull(),
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "set null" }),
    quantityG: doublePrecision("quantity_g").notNull(),

    // Macros are snapshotted at log time. If Open Food Facts later corrects a
    // product's data, or the user edits their custom food, history must not
    // silently rewrite itself — yesterday's deficit was what it was.
    nameSnapshot: text("name_snapshot").notNull(),
    kcal: doublePrecision("kcal").notNull(),
    proteinG: doublePrecision("protein_g").notNull(),
    carbsG: doublePrecision("carbs_g").notNull(),
    fatG: doublePrecision("fat_g").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("food_log_user_date_idx").on(t.userId, t.date)],
);

/* ------------------------------------------------------------------ *
 * Training
 * ------------------------------------------------------------------ */

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Null owner = built-in exercise from the seed catalogue.
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<ExerciseKind>().notNull().default("strength"),
    muscleGroup: text("muscle_group").notNull(),
    equipment: text("equipment"),
    // Metabolic equivalent, used to estimate calories burned per session.
    met: doublePrecision("met").notNull().default(5),
    isBodyweight: boolean("is_bodyweight").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exercises_owner_idx").on(t.ownerId),
    index("exercises_name_idx").on(t.name),
  ],
);

export const routines = pgTable(
  "routines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("routines_user_idx").on(t.userId)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    routineId: uuid("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    targetSets: integer("target_sets").notNull().default(3),
    targetReps: integer("target_reps").notNull().default(8),
    restSeconds: integer("rest_seconds").notNull().default(120),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    date: date("date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text("note"),
    // Cached at finish time from the sets + the user's bodyweight that day.
    caloriesBurned: integer("calories_burned"),

    // Identity assigned on the device before the workout ever reaches the
    // server. Makes the offline sync push idempotent: replaying a queued
    // workout after a flaky connection updates instead of duplicating.
    clientId: text("client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workouts_user_client_unique").on(t.userId, t.clientId),
    index("workouts_user_date_idx").on(t.userId, t.date),
  ],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutId: uuid("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    setIndex: integer("set_index").notNull().default(1),

    reps: integer("reps"),
    weightKg: doublePrecision("weight_kg"),
    rpe: doublePrecision("rpe"),
    isWarmup: boolean("is_warmup").notNull().default(false),

    // Cardio.
    durationSeconds: integer("duration_seconds"),
    distanceM: doublePrecision("distance_m"),

    completed: boolean("completed").notNull().default(true),
  },
  (t) => [index("workout_sets_workout_idx").on(t.workoutId)],
);
