/**
 * Integration tests against a real Postgres.
 *
 * These cover the invariants that unit tests cannot reach: that one account's
 * data is genuinely unreachable from another, and that replaying the offline
 * queue converges instead of duplicating. Skipped automatically when no
 * database is configured, so `npm test` still works without one.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";

// DATABASE_URL comes from .env via the test script's --env-file-if-exists.
import { db } from "../src/db/index.ts";
import { users, exercises, workouts, bodyEntries, foodLogEntries, foods } from "../src/db/schema.ts";
import { upsertWorkout, listWorkouts, lastPerformance } from "../src/server/workouts.ts";
import { createInvite, consumeInvite } from "../src/server/invites.ts";
import { loadEnergyState, loadDayNutrition } from "../src/server/energy.ts";
import { eq, inArray, isNull } from "drizzle-orm";
import type { SessionUser } from "../src/lib/auth.ts";

const canRun = await (async () => {
  try {
    if (!process.env.DATABASE_URL) return false;
    const probe = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
    await probe`SELECT 1`;
    await probe.end();
    return true;
  } catch {
    return false;
  }
})();

describe("integration", { skip: canRun ? false : "no DATABASE_URL reachable" }, () => {
  let alice: SessionUser;
  let bob: SessionUser;
  let squatId: string;
  let benchId: string;
  const createdUserIds: string[] = [];

  before(async () => {
    const mk = async (email: string, name: string) => {
      const [row] = await db
        .insert(users)
        .values({
          email,
          name,
          passwordHash: "x",
          sex: "male",
          birthDate: "2004-01-15",
          heightCm: 180,
          activityLevel: "moderate",
        })
        .returning();
      createdUserIds.push(row.id);
      return row as unknown as SessionUser;
    };
    alice = await mk(`alice+${Date.now()}@test.local`, "Alice");
    bob = await mk(`bob+${Date.now()}@test.local`, "Bob");

    const cat = await db.select().from(exercises).where(isNull(exercises.ownerId));
    squatId = cat.find((e) => e.name === "Back Squat")!.id;
    benchId = cat.find((e) => e.name === "Bench Press")!.id;
  });

  after(async () => {
    // Cascades clear body entries, workouts, food logs and goals.
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.delete(foods).where(eq(foods.name, "Integration Test Food"));
  });

  test("replaying the same offline workout converges on one row", async () => {
    const payload = {
      clientId: "offline-session-abc123",
      name: "Push Day",
      date: "2026-08-20",
      routineId: null,
      startedAt: "2026-08-20T17:00:00.000Z",
      endedAt: "2026-08-20T18:00:00.000Z",
      note: null,
      sets: [
        { exerciseId: benchId, position: 0, setIndex: 1, reps: 8, weightKg: 80, rpe: null, isWarmup: false, durationSeconds: null, distanceM: null, completed: true },
        { exerciseId: benchId, position: 0, setIndex: 2, reps: 8, weightKg: 80, rpe: null, isWarmup: false, durationSeconds: null, distanceM: null, completed: true },
      ],
    };

    const first = await upsertWorkout(alice.id, payload);
    const second = await upsertWorkout(alice.id, payload); // the flaky-connection replay

    assert.equal(first.workout.id, second.workout.id, "same client id must map to the same workout");
    const rows = await db.select().from(workouts).where(eq(workouts.userId, alice.id));
    assert.equal(rows.length, 1, "replay must not create a duplicate session");
    assert.equal(second.setCount, 2, "sets are replaced, not appended");
  });

  test("re-syncing an edited workout replaces its sets rather than accumulating", async () => {
    const edited = {
      clientId: "offline-session-abc123",
      name: "Push Day (edited)",
      date: "2026-08-20",
      routineId: null,
      startedAt: "2026-08-20T17:00:00.000Z",
      endedAt: "2026-08-20T18:00:00.000Z",
      note: "felt strong",
      sets: [
        { exerciseId: benchId, position: 0, setIndex: 1, reps: 5, weightKg: 90, rpe: 8, isWarmup: false, durationSeconds: null, distanceM: null, completed: true },
      ],
    };
    const result = await upsertWorkout(alice.id, edited);
    assert.equal(result.setCount, 1);

    const [session] = await listWorkouts(alice.id);
    assert.equal(session.sets.length, 1, "the old two sets must be gone");
    assert.equal(session.name, "Push Day (edited)");
    assert.equal(session.note, "felt strong");
  });

  test("calories burned are computed and stored on the session", async () => {
    const [session] = await listWorkouts(alice.id);
    assert.ok(session.caloriesBurned !== null && session.caloriesBurned > 0, "should estimate a burn");
    assert.ok(session.caloriesBurned! < 2000, `implausible burn: ${session.caloriesBurned}`);
  });

  test("one user's workouts are invisible to another", async () => {
    await upsertWorkout(bob.id, {
      clientId: "bob-session-1",
      name: "Bob Leg Day",
      date: "2026-08-20",
      routineId: null,
      startedAt: "2026-08-20T10:00:00.000Z",
      endedAt: "2026-08-20T11:00:00.000Z",
      note: null,
      sets: [{ exerciseId: squatId, position: 0, setIndex: 1, reps: 5, weightKg: 100, rpe: null, isWarmup: false, durationSeconds: null, distanceM: null, completed: true }],
    });

    const aliceSees = await listWorkouts(alice.id);
    const bobSees = await listWorkouts(bob.id);

    assert.equal(aliceSees.length, 1);
    assert.equal(bobSees.length, 1);
    assert.ok(!aliceSees.some((w) => w.name === "Bob Leg Day"), "privacy breach: Bob's session leaked to Alice");
    assert.ok(!bobSees.some((w) => w.name.startsWith("Push Day")), "privacy breach: Alice's session leaked to Bob");
  });

  test("the same client id from two users stays two separate workouts", async () => {
    // Client ids are device-generated, so a collision across users is possible;
    // uniqueness is scoped per user, not global.
    const shared = "collision-id-xyz";
    const a = await upsertWorkout(alice.id, {
      clientId: shared, name: "Alice Session", date: "2026-08-19", routineId: null,
      startedAt: "2026-08-19T17:00:00.000Z", endedAt: null, note: null, sets: [],
    });
    const b = await upsertWorkout(bob.id, {
      clientId: shared, name: "Bob Session", date: "2026-08-19", routineId: null,
      startedAt: "2026-08-19T17:00:00.000Z", endedAt: null, note: null, sets: [],
    });
    assert.notEqual(a.workout.id, b.workout.id, "one user's sync must not overwrite another's");
  });

  test("a workout referencing another user's custom exercise drops that set", async () => {
    const [bobsExercise] = await db
      .insert(exercises)
      .values({ ownerId: bob.id, name: "Bob's Secret Lift", muscleGroup: "Back", met: 5 })
      .returning();

    const result = await upsertWorkout(alice.id, {
      clientId: "alice-probe", name: "Probe", date: "2026-08-18", routineId: null,
      startedAt: "2026-08-18T17:00:00.000Z", endedAt: null, note: null,
      sets: [
        { exerciseId: bobsExercise.id, position: 0, setIndex: 1, reps: 5, weightKg: 60, rpe: null, isWarmup: false, durationSeconds: null, distanceM: null, completed: true },
        { exerciseId: squatId, position: 1, setIndex: 1, reps: 5, weightKg: 100, rpe: null, isWarmup: false, durationSeconds: null, distanceM: null, completed: true },
      ],
    });
    assert.equal(result.setCount, 1, "only the built-in exercise should survive");
  });

  test("last performance surfaces the most recent working set per exercise", async () => {
    const last = await lastPerformance(alice.id);
    const bench = last.get(benchId);
    assert.ok(bench, "bench press should have a last performance");
    assert.equal(bench!.weightKg, 90, "should reflect the edited session, not the original 80");
  });

  test("invite codes cannot be redeemed beyond their use limit", async () => {
    const invite = await createInvite({ createdBy: alice.id, maxUses: 2, expiresInDays: 7 });
    assert.equal(await consumeInvite(invite.code), true);
    assert.equal(await consumeInvite(invite.code), true);
    assert.equal(await consumeInvite(invite.code), false, "third redemption must fail");
  });

  test("concurrent redemption of a single-use code lets exactly one win", async () => {
    const invite = await createInvite({ createdBy: alice.id, maxUses: 1, expiresInDays: 7 });
    const results = await Promise.all([
      consumeInvite(invite.code),
      consumeInvite(invite.code),
      consumeInvite(invite.code),
    ]);
    assert.equal(results.filter(Boolean).length, 1, "a single-use code must not be claimed twice");
  });

  test("expired invite codes are rejected", async () => {
    const invite = await createInvite({ createdBy: alice.id, maxUses: 5, expiresInDays: 1 });
    await db.execute(
      `UPDATE invite_codes SET expires_at = now() - interval '1 day' WHERE code = '${invite.code}'`,
    );
    assert.equal(await consumeInvite(invite.code), false);
  });

  test("energy state computes real targets from profile and weigh-ins", async () => {
    await db.insert(bodyEntries).values([
      { userId: alice.id, date: "2026-08-18", weightKg: 80.4 },
      { userId: alice.id, date: "2026-08-19", weightKg: 80.1 },
      { userId: alice.id, date: "2026-08-20", weightKg: 80.2 },
    ]);

    const state = await loadEnergyState(alice, "2026-08-20");
    assert.equal(state.profileComplete, true);
    assert.ok(state.bmr! > 1700 && state.bmr! < 1900, `BMR out of range: ${state.bmr}`);
    assert.ok(state.tdee!.value > state.bmr!, "TDEE must exceed BMR");
    assert.equal(state.tdee!.method, "formula", "three days is not enough for an adaptive estimate");
    assert.ok(state.trendWeightKg! > 79 && state.trendWeightKg! < 81);
    assert.ok(state.macros!.proteinG > 0);
  });

  test("weighing in twice on one day updates rather than duplicates", async () => {
    await db
      .insert(bodyEntries)
      .values({ userId: alice.id, date: "2026-08-20", weightKg: 79.9 })
      .onConflictDoUpdate({
        target: [bodyEntries.userId, bodyEntries.date],
        set: { weightKg: 79.9 },
      });

    const rows = await db.select().from(bodyEntries).where(eq(bodyEntries.userId, alice.id));
    const onThatDay = rows.filter((r) => r.date === "2026-08-20");
    assert.equal(onThatDay.length, 1, "one row per day");
    assert.equal(onThatDay[0].weightKg, 79.9, "the later weigh-in wins");
  });

  test("day nutrition totals sum only the requested user and day", async () => {
    const [food] = await db
      .insert(foods)
      .values({ ownerId: null, source: "custom", name: "Integration Test Food", kcalPer100: 100, proteinPer100: 10, carbsPer100: 5, fatPer100: 2 })
      .returning();

    await db.insert(foodLogEntries).values([
      { userId: alice.id, date: "2026-08-20", meal: "lunch", foodId: food.id, quantityG: 200, nameSnapshot: "Test", kcal: 200, proteinG: 20, carbsG: 10, fatG: 4 },
      { userId: alice.id, date: "2026-08-19", meal: "lunch", foodId: food.id, quantityG: 100, nameSnapshot: "Test", kcal: 100, proteinG: 10, carbsG: 5, fatG: 2 },
      { userId: bob.id, date: "2026-08-20", meal: "lunch", foodId: food.id, quantityG: 500, nameSnapshot: "Test", kcal: 500, proteinG: 50, carbsG: 25, fatG: 10 },
    ]);

    const aliceDay = await loadDayNutrition(alice.id, "2026-08-20");
    assert.equal(aliceDay.kcal, 200, "must not include Bob's food or Alice's other day");
    assert.equal(aliceDay.proteinG, 20);
    assert.equal(aliceDay.entryCount, 1);
  });

  test("deleting a user removes all of their data", async () => {
    const [temp] = await db
      .insert(users)
      .values({ email: `temp+${Date.now()}@test.local`, name: "Temp", passwordHash: "x" })
      .returning();
    await db.insert(bodyEntries).values({ userId: temp.id, date: "2026-08-20", weightKg: 70 });

    await db.delete(users).where(eq(users.id, temp.id));
    const orphans = await db.select().from(bodyEntries).where(eq(bodyEntries.userId, temp.id));
    assert.equal(orphans.length, 0, "cascade must leave no orphaned personal data");
  });
});
