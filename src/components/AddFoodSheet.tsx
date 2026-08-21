"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Meal } from "@/db/schema";
import { api, ApiError } from "@/lib/client";
import { macrosForQuantity, parseServingGrams, type NormalisedFood } from "@/lib/food";
import BarcodeScanner from "@/components/BarcodeScanner";

interface FoodRow {
  id?: string;
  name: string;
  brand: string | null;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  servingName?: string | null;
  servingGrams?: number | null;
  isLiquid?: boolean;
  barcode?: string | null;
}

type Chosen = FoodRow & { remote?: boolean };

export default function AddFoodSheet({
  date,
  meal,
  onClose,
  onAdded,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<FoodRow[]>([]);
  const [remote, setRemote] = useState<NormalisedFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setLocal([]);
      setRemote([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await api.get<{ local: FoodRow[]; remote: NormalisedFood[] }>(
          `/api/foods/search?q=${encodeURIComponent(query.trim())}`,
        );
        setLocal(res.local);
        setRemote(res.remote);
      } catch {
        setError("Search is unavailable right now. You can still add a food by hand.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  const onScan = useCallback(async (code: string) => {
    setScanning(false);
    setError(null);
    try {
      const res = await api.get<{ food: FoodRow }>(`/api/foods/barcode/${code}`);
      setChosen(res.food);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "That product is not in the database yet — add it by hand and it will be saved for next time."
          : "Could not look that barcode up.",
      );
      setManual(true);
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add food to ${meal}`}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold capitalize">Add to {meal}</h2>
          <button onClick={onClose} className="btn btn-ghost px-2" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {scanning ? (
            <BarcodeScanner onDetected={onScan} onCancel={() => setScanning(false)} />
          ) : chosen ? (
            <PortionForm
              food={chosen}
              date={date}
              meal={meal}
              onBack={() => setChosen(null)}
              onAdded={onAdded}
            />
          ) : manual ? (
            <ManualFoodForm
              initialName={query}
              date={date}
              meal={meal}
              onBack={() => setManual(false)}
              onAdded={onAdded}
            />
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  className="field"
                  placeholder="Search a food…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoCapitalize="none"
                />
                <button
                  className="btn btn-secondary shrink-0 px-3"
                  onClick={() => setScanning(true)}
                  aria-label="Scan a barcode"
                  title="Scan barcode"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm" style={{ color: "var(--status-serious)" }}>
                  {error}
                </p>
              )}

              {searching && <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Searching…</p>}

              {local.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Your foods
                  </h3>
                  <FoodList items={local} onPick={setChosen} />
                </>
              )}

              {remote.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Open Food Facts
                  </h3>
                  <FoodList items={remote} onPick={(f) => setChosen({ ...f, remote: true })} />
                </>
              )}

              {!searching && query.trim().length >= 2 && local.length === 0 && remote.length === 0 && (
                <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>No matches.</p>
              )}

              <button className="btn btn-secondary mt-5 w-full" onClick={() => setManual(true)}>
                Enter a food by hand
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FoodList({ items, onPick }: { items: FoodRow[]; onPick: (f: FoodRow) => void }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((f, i) => (
        <li key={f.id ?? `${f.name}-${i}`}>
          <button
            onClick={() => onPick(f)}
            className="flex w-full items-center justify-between gap-3 border-b py-2.5 text-left"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {f.brand ? `${f.brand} · ` : ""}
                <span className="tnum">{Math.round(f.kcalPer100)} kcal / 100 g</span>
              </p>
            </div>
            <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Choose a portion, see the macros update live, commit. */
function PortionForm({
  food,
  date,
  meal,
  onBack,
  onAdded,
}: {
  food: Chosen;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  const servingG = food.servingGrams ?? parseServingGrams(food.servingName ?? null);
  const [grams, setGrams] = useState(String(servingG ?? 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = Number(grams) || 0;
  const macros = macrosForQuantity(food, quantity);
  const unit = food.isLiquid ? "ml" : "g";

  async function add() {
    setBusy(true);
    setError(null);
    try {
      let foodId = food.id;

      // A remote result is not in our database yet; save it first so the log
      // entry can point at a real row and the next scan resolves locally.
      if (!foodId) {
        const saved = await api.post<{ id: string }>("/api/foods", {
          name: food.name,
          brand: food.brand,
          barcode: food.barcode ?? null,
          kcalPer100: food.kcalPer100,
          proteinPer100: food.proteinPer100,
          carbsPer100: food.carbsPer100,
          fatPer100: food.fatPer100,
          servingName: food.servingName ?? null,
          servingGrams: food.servingGrams ?? null,
          isLiquid: food.isLiquid ?? false,
        });
        foodId = saved.id;
      }

      await api.post("/api/log", { date, meal, foodId, quantityG: quantity });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost mb-2 px-0" onClick={onBack}>‹ Back</button>
      <h3 className="text-lg font-semibold">{food.name}</h3>
      {food.brand && <p className="text-sm" style={{ color: "var(--text-muted)" }}>{food.brand}</p>}

      <div className="mt-4">
        <label className="label" htmlFor="grams">Amount ({unit})</label>
        <input
          id="grams"
          type="number"
          inputMode="decimal"
          className="field"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          autoFocus
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {[servingG, 30, 50, 100, 150, 200, 250]
            .filter((v): v is number => typeof v === "number" && v > 0)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((v) => (
              <button
                key={v}
                className="btn btn-secondary px-2.5 py-1 text-xs"
                style={{ minHeight: 34 }}
                onClick={() => setGrams(String(v))}
              >
                {v === servingG ? `1 serving (${v}${unit})` : `${v}${unit}`}
              </button>
            ))}
        </div>
      </div>

      <div className="card mt-4 p-3">
        <p className="tnum text-2xl font-semibold">{Math.round(macros.kcal)} kcal</p>
        <p className="tnum mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
          {macros.proteinG} g protein · {macros.carbsG} g carbs · {macros.fatG} g fat
        </p>
      </div>

      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>}

      <button className="btn btn-primary mt-4 w-full" onClick={add} disabled={busy || quantity <= 0}>
        {busy ? "Adding…" : "Add to log"}
      </button>
    </div>
  );
}

function ManualFoodForm({
  initialName,
  date,
  meal,
  onBack,
  onAdded,
}: {
  initialName: string;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: initialName,
    kcalPer100: "",
    proteinPer100: "",
    carbsPer100: "",
    fatPer100: "",
    quantityG: "100",
  });
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const per100 = {
        name: form.name,
        kcalPer100: Number(form.kcalPer100),
        proteinPer100: Number(form.proteinPer100) || 0,
        carbsPer100: Number(form.carbsPer100) || 0,
        fatPer100: Number(form.fatPer100) || 0,
      };

      let foodId: string | undefined;
      if (save) {
        const saved = await api.post<{ id: string }>("/api/foods", per100);
        foodId = saved.id;
      }

      await api.post("/api/log", {
        date,
        meal,
        quantityG: Number(form.quantityG),
        ...(foodId ? { foodId } : { manual: per100 }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="btn btn-ghost mb-2 px-0" onClick={onBack}>‹ Back</button>
      <h3 className="mb-3 text-lg font-semibold">Add a food by hand</h3>

      <div className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="mname">Name</label>
          <input id="mname" className="field" value={form.name} onChange={set("name")} required />
        </div>

        <p className="hint">Enter the values per 100 g, as printed on the packet.</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="mkcal">Calories</label>
            <input id="mkcal" type="number" inputMode="decimal" className="field" value={form.kcalPer100} onChange={set("kcalPer100")} required />
          </div>
          <div>
            <label className="label" htmlFor="mprot">Protein (g)</label>
            <input id="mprot" type="number" inputMode="decimal" className="field" value={form.proteinPer100} onChange={set("proteinPer100")} />
          </div>
          <div>
            <label className="label" htmlFor="mcarb">Carbs (g)</label>
            <input id="mcarb" type="number" inputMode="decimal" className="field" value={form.carbsPer100} onChange={set("carbsPer100")} />
          </div>
          <div>
            <label className="label" htmlFor="mfat">Fat (g)</label>
            <input id="mfat" type="number" inputMode="decimal" className="field" value={form.fatPer100} onChange={set("fatPer100")} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="mqty">How much are you eating? (g)</label>
          <input id="mqty" type="number" inputMode="decimal" className="field" value={form.quantityG} onChange={set("quantityG")} required />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save to my foods for next time
        </label>

        {error && <p role="alert" className="text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add to log"}
        </button>
      </div>
    </form>
  );
}
