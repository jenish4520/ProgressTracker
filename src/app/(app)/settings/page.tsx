import { requireUser } from "@/lib/auth";
import { loadEnergyState } from "@/server/energy";
import { listInvites } from "@/server/invites";
import SettingsScreen from "@/components/SettingsScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · ProgressTracker" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [state, invites] = await Promise.all([loadEnergyState(user), listInvites(user.id)]);

  return (
    <SettingsScreen
      user={{
        name: user.name,
        email: user.email,
        sex: user.sex,
        birthDate: user.birthDate,
        heightCm: user.heightCm,
        activityLevel: user.activityLevel ?? "light",
        unitSystem: user.unitSystem,
      }}
      goal={state.goal}
      target={state.target}
      macros={state.macros}
      tdee={state.tdee}
      trendWeightKg={state.trendWeightKg}
      invites={invites.map((i) => ({
        code: i.code,
        note: i.note,
        uses: i.uses,
        maxUses: i.maxUses,
        expiresAt: i.expiresAt?.toISOString() ?? null,
      }))}
    />
  );
}
