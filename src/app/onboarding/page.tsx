import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import OnboardingWizard from "@/components/OnboardingWizard";
import { todayInZone } from "@/lib/dates";

export const metadata = { title: "Set up · ProgressTracker" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <OnboardingWizard
        todayRef={todayInZone(user.timezone)}
        initial={{
          name: user.name,
          sex: user.sex,
          birthDate: user.birthDate,
          heightCm: user.heightCm,
          activityLevel: user.activityLevel ?? "light",
          unitSystem: user.unitSystem,
          timezone: user.timezone,
        }}
      />
    </main>
  );
}
