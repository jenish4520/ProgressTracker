"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { WorkoutInput } from "@/lib/validation";

/**
 * On-device storage for workout logging.
 *
 * Gyms are basements and basements have no signal. A tracker that loses a
 * session because the connection dropped between sets is a tracker people stop
 * using, so the device is the source of truth while a workout is in progress
 * and the server is reconciled afterwards.
 */

const DB_NAME = "progress-tracker";
const DB_VERSION = 1;

export interface ActiveWorkout {
  clientId: string;
  name: string;
  date: string;
  routineId: string | null;
  startedAt: string;
  note: string | null;
  entries: ActiveEntry[];
}

export interface ActiveEntry {
  exerciseId: string;
  exerciseName: string;
  kind: "strength" | "cardio";
  sets: ActiveSet[];
}

export interface ActiveSet {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rpe: number | null;
  isWarmup: boolean;
  completed: boolean;
}

interface TrackerDB extends DBSchema {
  /** Finished workouts waiting to reach the server. */
  pending: { key: string; value: WorkoutInput };
  /** The single in-progress session, so a phone reboot mid-workout loses nothing. */
  active: { key: "current"; value: ActiveWorkout };
  /** Exercise catalogue snapshot, so the picker works with no connection. */
  cache: { key: string; value: { data: unknown; savedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= openDB<TrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "clientId" });
      if (!db.objectStoreNames.contains("active")) db.createObjectStore("active");
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    },
  });
  return dbPromise;
}

/** A device-side identity for a workout, assigned before it can ever be sent. */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveActive(workout: ActiveWorkout): Promise<void> {
  const db = await getDb();
  await db?.put("active", workout, "current");
}

export async function loadActive(): Promise<ActiveWorkout | null> {
  const db = await getDb();
  return (await db?.get("active", "current")) ?? null;
}

export async function clearActive(): Promise<void> {
  const db = await getDb();
  await db?.delete("active", "current");
}

export async function queueWorkout(workout: WorkoutInput): Promise<void> {
  const db = await getDb();
  await db?.put("pending", workout);
}

export async function pendingWorkouts(): Promise<WorkoutInput[]> {
  const db = await getDb();
  return (await db?.getAll("pending")) ?? [];
}

export async function dropPending(clientIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db || !clientIds.length) return;
  const tx = db.transaction("pending", "readwrite");
  await Promise.all([...clientIds.map((id) => tx.store.delete(id)), tx.done]);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return (await db?.count("pending")) ?? 0;
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  const db = await getDb();
  await db?.put("cache", { data, savedAt: Date.now() }, key);
}

/** Reads a cached value, ignoring anything older than `maxAgeMs`. */
export async function cacheGet<T>(key: string, maxAgeMs = 7 * 86_400_000): Promise<T | null> {
  const db = await getDb();
  const row = await db?.get("cache", key);
  if (!row) return null;
  if (Date.now() - row.savedAt > maxAgeMs) return null;
  return row.data as T;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

/**
 * Pushes every queued workout.
 *
 * Items the server rejects as permanently invalid are dropped rather than
 * retried forever — one malformed session must not wedge the queue behind it.
 * Network failures leave the queue untouched for the next attempt.
 */
export async function flushQueue(): Promise<SyncResult> {
  const queued = await pendingWorkouts();
  if (!queued.length) return { synced: 0, failed: 0 };

  const res = await fetch("/api/workouts/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workouts: queued }),
  });

  if (!res.ok) throw new Error(`Sync failed with status ${res.status}`);

  const body = (await res.json()) as {
    ok: boolean;
    data?: { synced: string[]; failed: { clientId: string; reason: string }[] };
  };
  if (!body.ok || !body.data) throw new Error("Sync rejected");

  await dropPending([...body.data.synced, ...body.data.failed.map((f) => f.clientId)]);
  return { synced: body.data.synced.length, failed: body.data.failed.length };
}
