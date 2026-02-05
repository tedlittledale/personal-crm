"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="mx-auto max-w-3xl flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-base">
            People Notes
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                pathname === "/"
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              People
            </Link>
            <Link
              href="/settings"
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                pathname === "/settings"
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Settings
            </Link>
          </div>
        </div>
        <UserButton />
      </div>
    </nav>
  );
}
