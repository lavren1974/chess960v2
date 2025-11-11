"use client";

import { useEffect } from "react";

export function DebugClient() {
  useEffect(() => {
    console.log("✅✅✅ CLIENT JS IS RUNNING! ✅✅✅ If you see this, the problem is not with the build.");
  }, []);

  return null;
}
