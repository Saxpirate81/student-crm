"use client";

import { useEffect, useMemo, useState } from "react";
import { getRepository } from "@/lib/data";

export function useRepository() {
  const repository = useMemo(() => getRepository(), []);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setVersion((prev) => prev + 1);
  }, []);

  return {
    repository,
    version,
    refresh: () => setVersion((prev) => prev + 1),
  };
}
