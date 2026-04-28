"use client";

import { useEffect, useState } from "react";
import {
  type HeroGreetingRole,
  getHeroGreetingHeadlineClient,
  getHeroGreetingHeadlineSsr,
} from "@/lib/greetings/rotating-hero-greeting";

/**
 * Stable on SSR + first client paint (pool line 0), then updates after mount to the
 * rotated line from session storage. Call `advanceHeroGreetingRotation(role)` on login
 * to move to the next greeting.
 */
export function useRotatingHeroHeadline(role: HeroGreetingRole, displayName: string): string {
  const [headline, setHeadline] = useState(() => getHeroGreetingHeadlineSsr(role, displayName));

  useEffect(() => {
    setHeadline(getHeroGreetingHeadlineClient(role, displayName));
  }, [role, displayName]);

  return headline;
}
