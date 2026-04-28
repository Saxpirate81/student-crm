"use client";

import type { ReactNode } from "react";
import { ParentSessionGate } from "@/components/ParentSessionGate";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return <ParentSessionGate>{children}</ParentSessionGate>;
}
