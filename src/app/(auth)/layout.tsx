import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Already signed in? There is nothing to do on a login screen.
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">{children}</main>
  );
}
