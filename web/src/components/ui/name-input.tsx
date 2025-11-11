"use client";

import React, { useState, useCallback, useRef } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type NameAvailabilityResponse = {
  available: boolean | null;
  reason?: string;
};

const MIN_NAME_LENGTH = 6;

async function requestNameAvailability(name: string): Promise<NameAvailabilityResponse> {
  const response = await fetch("/api/name-availability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error("request_failed");
  }

  const data = (await response.json()) as NameAvailabilityResponse;
  return data;
}

export default function NameInput() {
  const [name, setName] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequestId = useRef(0);
  const lastCheckedName = useRef<string | null>(null);

  const { t } = useTranslation();

  const checkNameAvailability = useCallback(
    async (nameToCheck: string) => {
      const normalized = nameToCheck.trim();
      const requestId = ++activeRequestId.current;

      if (!normalized) {
        setIsChecking(false);
        setIsAvailable(null);
        setError(null);
        lastCheckedName.current = null;
        return;
      }

      if (normalized.length < MIN_NAME_LENGTH) {
        setIsChecking(false);
        setIsAvailable(null);
        setError(t("auth.name.tooShort"));
        lastCheckedName.current = null;
        return;
      }

      setIsChecking(true);
      setIsAvailable(null);
      setError(null);

      try {
        const result = await requestNameAvailability(normalized);

        if (activeRequestId.current !== requestId) {
          return;
        }

        if (result.available === true) {
          setIsAvailable(true);
          setError(null);
          lastCheckedName.current = normalized;
        } else if (result.available === false) {
          setIsAvailable(false);
          lastCheckedName.current = normalized;

          if (result.reason === "too_short") {
            setError(t("auth.name.tooShort"));
          } else if (result.reason === "invalid_name") {
            setError(t("auth.name.checkError"));
          } else {
            setError(t("auth.name.taken"));
          }
        } else {
          setIsAvailable(null);
          setError(t("auth.name.checkError"));
          lastCheckedName.current = null;
        }
      } catch (queryError) {
        if (activeRequestId.current === requestId) {
          console.warn("Name availability check failed:", queryError);
          setError(t("auth.name.checkError"));
          setIsAvailable(null);
          lastCheckedName.current = null;
        }
      } finally {
        if (activeRequestId.current === requestId) {
          setIsChecking(false);
        }
      }
    },
    [t],
  );

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setName(value);

    activeRequestId.current += 1;
    setIsChecking(false);
    setIsAvailable(null);
    setError(null);
    lastCheckedName.current = null;
  }, []);

  const handleBlur = useCallback(() => {
    const trimmed = name.trim();

    if (!trimmed) {
      setError(null);
      setIsAvailable(null);
      return;
    }

    if (trimmed.length < MIN_NAME_LENGTH) {
      setError(t("auth.name.tooShort"));
      setIsAvailable(null);
      return;
    }

    if (lastCheckedName.current === trimmed && isAvailable !== null) {
      return;
    }

    void checkNameAvailability(trimmed);
  }, [name, checkNameAvailability, isAvailable, t]);

  return (
    <div>
      <label htmlFor="name" className="block text-sm font-medium text-base-content/80 mb-1">
        {t("auth.name.label")}
      </label>
      <div className="relative">
        <input
          id="name"
          type="text"
          name="name"
          value={name}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t("auth.name.placeholder")}
          required
          className={`input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors pr-10
            ${error ? "input-error" : isAvailable ? "input-success" : ""}`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {isChecking ? (
            <Loader2 className="h-5 w-5 animate-spin text-base-content/50" />
          ) : isAvailable ? (
            <Check className="h-5 w-5 text-success" />
          ) : error ? (
            <X className="h-5 w-5 text-error" />
          ) : null}
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
      {isAvailable && <p className="mt-1 text-sm text-success">{t("auth.name.available")}</p>}
    </div>
  );
}
