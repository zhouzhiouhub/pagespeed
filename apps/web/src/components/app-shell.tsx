"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "./app-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <AppNav pathname={pathname} />
      <main className="flex-1">{children}</main>
    </>
  );
}
