"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

export function RoundJump({
  lng,
  scope,
  champId,
  favoritesOnly = false,
  initialRound,
}: {
  lng: string;
  scope: "latest" | "all";
  champId: number | null;
  favoritesOnly?: boolean;
  initialRound?: number;
}) {
  const { t } = useTranslation();
  const [roundInput, setRoundInput] = useState<string>(initialRound ? String(initialRound) : "");

  useEffect(() => {
    if (typeof initialRound === "number" && Number.isFinite(initialRound)) {
      setRoundInput(String(initialRound));
    }
  }, [initialRound]);

  const href = roundInput
    ? {
        pathname: `/${lng}/results/round/${roundInput}`,
        query: {
          ...(scope === "all" ? { scope: "all" } : {}),
          ...(champId ? { champ: String(champId) } : {}),
          ...(favoritesOnly ? { favorites: "1" } : {}),
        },
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
