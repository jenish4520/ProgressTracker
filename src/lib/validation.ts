import { z } from "zod";

/**
 * Every value crossing the network boundary is parsed here. Nothing reaches a
 * query straight from a request body.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Not a real date");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

// Length over character-class rules: a long passphrase beats a short one with
// a symbol bolted on, and arbitrary complexity rules mostly produce Password1!
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That is longer than 200 characters");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: emailSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().max(64).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sex: z.enum(["male", "female"]).optional(),
  birthDate: isoDate.optional(),
  heightCm: z.number().min(50).max(260).optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "very", "extra"]).optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  // Validated as a real IANA zone rather than accepting arbitrary text.
  timezone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone")
    .optional(),
});

export const goalSchema = z.object({
  type: z.enum(["cut", "bulk", "maintain"]),
  rateKgPerWeek: z.number().min(0).max(2),
  targetWeightKg: z.number().min(20).max(500).nullish(),
  startWeightKg: z.number().min(20).max(500).nullish(),
  calorieOverride: z.number().int().min(800).max(8000).nullish(),
  proteinOverrideG: z.number().int().min(0).max(500).nullish(),
  fatOverrideG: z.number().int().min(0).max(500).nullish(),
});

export const bodyEntrySchema = z.object({
  date: isoDate,
  weightKg: z.number().min(20).max(500).nullish(),
  bodyFatPct: z.number().min(0).max(75).nullish(),
  waistCm: z.number().min(20).max(300).nullish(),
  chestCm: z.number().min(20).max(300).nullish(),
  hipsCm: z.number().min(20).max(300).nullish(),
  armCm: z.number().min(10).max(150).nullish(),
  thighCm: z.number().min(10).max(200).nullish(),
  neckCm: z.number().min(10).max(150).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const macroPer100 = z.number().min(0).max(100);

export const foodSchema = z.object({
  name: z.string().trim().min(1, "Name the food").max(160),
  brand: z.string().trim().max(120).nullish(),
  barcode: z.string().trim().regex(/^\d{6,14}$/, "Barcodes are 6-14 digits").nullish(),
  kcalPer100: z.number().min(0).max(1000),
  proteinPer100: macroPer100.default(0),
  carbsPer100: macroPer100.default(0),
  fatPer100: macroPer100.default(0),
  fiberPer100: macroPer100.nullish(),
  sugarPer100: macroPer100.nullish(),
  saltPer100: z.number().min(0).max(100).nullish(),
  servingName: z.string().trim().max(60).nullish(),
  servingGrams: z.number().min(0.1).max(5000).nullish(),
  isLiquid: z.boolean().default(false),
});

export const foodLogSchema = z.object({
  date: isoDate,
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  foodId: z.uuid().nullish(),
  quantityG: z.number().min(0.1).max(10000),
  // Present when logging something ad hoc that is not in the food library.
  manual: foodSchema.partial({ proteinPer100: true, carbsPer100: true, fatPer100: true }).nullish(),
});

export const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["strength", "cardio"]).default("strength"),
  muscleGroup: z.string().trim().min(1).max(60),
  equipment: z.string().trim().max(60).nullish(),
  met: z.number().min(0.5).max(24).default(5),
  isBodyweight: z.boolean().default(false),
});

export const routineSchema = z.object({
  name: z.string().trim().min(1, "Name the routine").max(80),
  note: z.string().trim().max(500).nullish(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.uuid(),
        targetSets: z.number().int().min(1).max(20).default(3),
        targetReps: z.number().int().min(1).max(100).default(8),
        restSeconds: z.number().int().min(0).max(900).default(120),
      }),
    )
    .max(40),
});

export const workoutSetSchema = z.object({
  exerciseId: z.uuid(),
  position: z.number().int().min(0).max(200).default(0),
  setIndex: z.number().int().min(1).max(100).default(1),
  reps: z.number().int().min(0).max(1000).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  isWarmup: z.boolean().default(false),
  durationSeconds: z.number().int().min(0).max(86400).nullish(),
  distanceM: z.number().min(0).max(1_000_000).nullish(),
  completed: z.boolean().default(true),
});

export const workoutSchema = z.object({
  // Device-generated identity: makes replaying a queued offline workout
  // idempotent rather than creating duplicates.
  clientId: z.string().trim().min(8).max(64),
  name: z.string().trim().min(1).max(80),
  date: isoDate,
  routineId: z.uuid().nullish(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullish(),
  note: z.string().trim().max(1000).nullish(),
  sets: z.array(workoutSetSchema).max(400),
});

/** Offline queue flush: a batch of whole workouts pushed at once. */
export const syncSchema = z.object({
  workouts: z.array(workoutSchema).max(50),
});

export const inviteSchema = z.object({
  note: z.string().trim().max(120).nullish(),
  maxUses: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type BodyEntryInput = z.infer<typeof bodyEntrySchema>;
export type FoodInput = z.infer<typeof foodSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type RoutineInput = z.infer<typeof routineSchema>;
