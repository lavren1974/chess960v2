"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

export function RoundJump({ lng, scope }: { lng: string; scope: "latest" | "all" }) {
  const { t } = useTranslation();
  const [roundInput, setRoundInput] = useState<string>("");

  const href = roundInput
    ? {
        pathname: `/${lng}/results/round/${roundInput}`,
        query: scope === "all" ? { scope: "all" } : {},
      }
    : undefined;

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="opacity-70">{t("standings.viewRound")}</label>
      <input
        type="number"
        min={1}
        className="input input-bordered input-sm w-28"
        value={roundInput}
        onChange={(e) => setRoundInput(e.target.value)}
        placeholder="e.g. 1"
      />
      {href ? (
        <Link className="btn btn-sm btn-outline" href={href}>
          {t("standings.open")}
        </Link>
      ) : (
        <button className="btn btn-sm btn-disabled" aria-disabled>
          {t("standings.open")}
        </button>
      )}
    </div>
  );
}

