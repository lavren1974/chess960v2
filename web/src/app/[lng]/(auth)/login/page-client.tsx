"use client";

import { login } from "@/lib/actions/auth";
import { useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function LoginClient() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const notice = searchParams.get("notice");
  const lng = params.lng as string;

  async function handleSubmit(formData: FormData) {
    setError(null);
    formData.append("language", lng);
    const result = await login(formData);

    if (result?.error) {
      setError(result.error);
    } else if (result?.redirect) {
      const redirectTo = searchParams.get("redirect");
      if (redirectTo && redirectTo.startsWith("/")) {
        router.push(redirectTo);
      } else {
        router.push(`/${lng}${result.redirect}`);
      }
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <form action={handleSubmit} className="bg-base-100 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-8 text-center text-base-content">
          {t("auth.login")}
        </h1>

        {notice && (
          <div className="bg-info/10 border border-info/30 text-info px-4 py-3 rounded-lg mb-6">
            {t(`auth.errors.${notice}`)}
          </div>
        )}

        {error && (
          <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-base-content/80 mb-1">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder={t("auth.email")}
              required
              className="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-base-content/80 mb-1">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={t("auth.password")}
              required
              className="input input-bordered w-full bg-base-200 focus:bg-base-100 transition-colors"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full">
            {t("auth.login")}
          </button>
        </div>
      </form>
    </div>
  );
}

