import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";
import OfflineSync from "@/components/OfflineSync";
import TimezoneSync from "@/components/TimezoneSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The energy engine needs sex, birth date and height; without them every
  // number on every screen would be a guess.
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <>
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
      <OfflineSync />
      <TimezoneSync current={user.timezone} />
      <BottomNav />
    </>
  );
}
