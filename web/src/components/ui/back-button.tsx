"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function BackButton({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    try {
      const hasReferrer = Boolean(document.referrer);
      const sameOrigin = hasReferrer && new URL(document.referrer).origin === window.location.origin;
      const hasHistory = window.history.length > 1;
      setCanGoBack(Boolean(sameOrigin && hasHistory));
    } catch {
      setCanGoBack(false);
    }
  }, []);

  if (canGoBack) {
    return (
      <button className={`btn btn-sm ${className ?? ""}`} onClick={() => router.back()}>
        {children ?? "Back"}
      </button>
    );
  }

  return (
    <a className={`btn btn-sm ${className ?? ""}`} href={fallbackHref}>
      {children ?? "Back"}
    </a>
  );
}

