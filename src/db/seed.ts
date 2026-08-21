/**
 * Seeds the built-in exercise catalogue (owner_id NULL = available to everyone).
 *
 * MET values come from the Compendium of Physical Activities. Compound barbell
 * work sits around 6.0 ("vigorous effort"), isolation and machine work around
 * 3.5-4.5 ("light to moderate"), and cardio carries its own machine-specific
 * value. Re-runnable: conflicts on the built-in name index are ignored.
 */
import postgres from "postgres";

interface SeedExercise {
  name: string;
  muscleGroup: string;
  equipment?: string;
  met?: number;
  kind?: "strength" | "cardio";
  isBodyweight?: boolean;
}

const CATALOGUE: SeedExercise[] = [
  // ---- Legs ----
  { name: "Back Squat", muscleGroup: "Legs", equipment: "Barbell", met: 6 },
  { name: "Front Squat", muscleGroup: "Legs", equipment: "Barbell", met: 6 },
  { name: "Goblet Squat", muscleGroup: "Legs", equipment: "Dumbbell", met: 5 },
  { name: "Leg Press", muscleGroup: "Legs", equipment: "Machine", met: 5 },
  { name: "Romanian Deadlift", muscleGroup: "Hamstrings", equipment: "Barbell", met: 6 },
  { name: "Leg Curl", muscleGroup: "Hamstrings", equipment: "Machine", met: 3.5 },
  { name: "Leg Extension", muscleGroup: "Quads", equipment: "Machine", met: 3.5 },
  { name: "Bulgarian Split Squat", muscleGroup: "Legs", equipment: "Dumbbell", met: 5.5 },
  { name: "Walking Lunge", muscleGroup: "Legs", equipment: "Dumbbell", met: 5.5 },
  { name: "Hip Thrust", muscleGroup: "Glutes", equipment: "Barbell", met: 5 },
  { name: "Calf Raise", muscleGroup: "Calves", equipment: "Machine", met: 3.5 },
  { name: "Hack Squat", muscleGroup: "Legs", equipment: "Machine", met: 5.5 },

  // ---- Back ----
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell", met: 6 },
  { name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell", met: 5.5 },
  { name: "Pull-Up", muscleGroup: "Back", equipment: "Bodyweight", met: 8, isBodyweight: true },
  { name: "Chin-Up", muscleGroup: "Back", equipment: "Bodyweight", met: 8, isBodyweight: true },
  { name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable", met: 4.5 },
  { name: "Seated Cable Row", muscleGroup: "Back", equipment: "Cable", met: 4.5 },
  { name: "Dumbbell Row", muscleGroup: "Back", equipment: "Dumbbell", met: 5 },
  { name: "T-Bar Row", muscleGroup: "Back", equipment: "Barbell", met: 5.5 },
  { name: "Face Pull", muscleGroup: "Rear Delts", equipment: "Cable", met: 3.5 },
  { name: "Back Extension", muscleGroup: "Lower Back", equipment: "Bodyweight", met: 4, isBodyweight: true },

  // ---- Chest ----
  { name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell", met: 6 },
  { name: "Incline Bench Press", muscleGroup: "Chest", equipment: "Barbell", met: 6 },
  { name: "Dumbbell Bench Press", muscleGroup: "Chest", equipment: "Dumbbell", met: 5.5 },
  { name: "Incline Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbell", met: 5.5 },
  { name: "Chest Fly", muscleGroup: "Chest", equipment: "Cable", met: 4 },
  { name: "Push-Up", muscleGroup: "Chest", equipment: "Bodyweight", met: 8, isBodyweight: true },
  { name: "Dip", muscleGroup: "Chest", equipment: "Bodyweight", met: 8, isBodyweight: true },
  { name: "Machine Chest Press", muscleGroup: "Chest", equipment: "Machine", met: 4.5 },

  // ---- Shoulders ----
  { name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell", met: 5.5 },
  { name: "Dumbbell Shoulder Press", muscleGroup: "Shoulders", equipment: "Dumbbell", met: 5 },
  { name: "Lateral Raise", muscleGroup: "Shoulders", equipment: "Dumbbell", met: 3.5 },
  { name: "Front Raise", muscleGroup: "Shoulders", equipment: "Dumbbell", met: 3.5 },
  { name: "Rear Delt Fly", muscleGroup: "Rear Delts", equipment: "Dumbbell", met: 3.5 },
  { name: "Upright Row", muscleGroup: "Shoulders", equipment: "Barbell", met: 4.5 },
  { name: "Shrug", muscleGroup: "Traps", equipment: "Dumbbell", met: 4 },

  // ---- Arms ----
  { name: "Barbell Curl", muscleGroup: "Biceps", equipment: "Barbell", met: 4 },
  { name: "Dumbbell Curl", muscleGroup: "Biceps", equipment: "Dumbbell", met: 3.5 },
  { name: "Hammer Curl", muscleGroup: "Biceps", equipment: "Dumbbell", met: 3.5 },
  { name: "Preacher Curl", muscleGroup: "Biceps", equipment: "Barbell", met: 3.5 },
  { name: "Cable Curl", muscleGroup: "Biceps", equipment: "Cable", met: 3.5 },
  { name: "Triceps Pushdown", muscleGroup: "Triceps", equipment: "Cable", met: 3.5 },
  { name: "Skull Crusher", muscleGroup: "Triceps", equipment: "Barbell", met: 4 },
  { name: "Overhead Triceps Extension", muscleGroup: "Triceps", equipment: "Dumbbell", met: 3.5 },
  { name: "Close-Grip Bench Press", muscleGroup: "Triceps", equipment: "Barbell", met: 5.5 },

  // ---- Core ----
  { name: "Plank", muscleGroup: "Core", equipment: "Bodyweight", met: 3.5, isBodyweight: true },
  { name: "Hanging Leg Raise", muscleGroup: "Core", equipment: "Bodyweight", met: 5, isBodyweight: true },
  { name: "Cable Crunch", muscleGroup: "Core", equipment: "Cable", met: 4 },
  { name: "Russian Twist", muscleGroup: "Core", equipment: "Bodyweight", met: 4, isBodyweight: true },
  { name: "Ab Wheel Rollout", muscleGroup: "Core", equipment: "Bodyweight", met: 5, isBodyweight: true },

  // ---- Cardio ----
  { name: "Treadmill Run", muscleGroup: "Cardio", equipment: "Machine", met: 9.8, kind: "cardio" },
  { name: "Treadmill Walk", muscleGroup: "Cardio", equipment: "Machine", met: 3.8, kind: "cardio" },
  { name: "Incline Walk", muscleGroup: "Cardio", equipment: "Machine", met: 5.3, kind: "cardio" },
  { name: "Stationary Bike", muscleGroup: "Cardio", equipment: "Machine", met: 7, kind: "cardio" },
  { name: "Rowing Machine", muscleGroup: "Cardio", equipment: "Machine", met: 7, kind: "cardio" },
  { name: "Elliptical", muscleGroup: "Cardio", equipment: "Machine", met: 5, kind: "cardio" },
  { name: "Stair Climber", muscleGroup: "Cardio", equipment: "Machine", met: 9, kind: "cardio" },
  { name: "Jump Rope", muscleGroup: "Cardio", equipment: "Bodyweight", met: 12.3, kind: "cardio", isBodyweight: true },
  { name: "Outdoor Run", muscleGroup: "Cardio", equipment: "None", met: 9.8, kind: "cardio", isBodyweight: true },
  { name: "Cycling", muscleGroup: "Cardio", equipment: "None", met: 8, kind: "cardio", isBodyweight: true },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(url, { max: 1 });

  try {
    let inserted = 0;
    for (const e of CATALOGUE) {
      const rows = await sql`
        INSERT INTO exercises (owner_id, name, kind, muscle_group, equipment, met, is_bodyweight)
        VALUES (
          NULL,
          ${e.name},
          ${e.kind ?? "strength"},
          ${e.muscleGroup},
          ${e.equipment ?? null},
          ${e.met ?? 5},
          ${e.isBodyweight ?? false}
        )
        ON CONFLICT DO NOTHING
        RETURNING id`;
      if (rows.length) inserted++;
    }
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM exercises WHERE owner_id IS NULL`;
    console.log(`Seeded ${inserted} new exercise(s); catalogue now holds ${count}.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
