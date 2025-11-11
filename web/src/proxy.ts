import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fallbackLng, languages } from "./app/i18n/settings";
import { getMiddlewareClient } from "@/lib/supabase/middleware";

const protectedRoutes = ["/dashboard"];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  if (
    pathname.includes(".") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/")
  ) {
    return response;
  }

  const pathnameHasLocale = languages.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (!pathnameHasLocale) {
    // Prefer persisted locale from cookie if valid
    const cookieLng = request.cookies.get("lng")?.value;
    const locale = cookieLng && languages.includes(cookieLng) ? cookieLng : fallbackLng;
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = `/${locale}${pathname}`;
    const redirect = NextResponse.redirect(newUrl);
    // Also set/refresh the cookie on redirect response
    redirect.cookies.set("lng", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
    return redirect;
  }

  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  if (protectedRoutes.some((route) => pathWithoutLocale.startsWith(route))) {
    const supabase = getMiddlewareClient(request, response);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const locale = pathname.split("/")[1];
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirect = NextResponse.redirect(loginUrl);
      // Persist current locale when redirecting to login
      if (languages.includes(locale)) {
        redirect.cookies.set("lng", locale, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      }
      return redirect;
    }
  }

  // If path already contains a valid locale, refresh the cookie so preference sticks
  const currentLocale = pathname.split("/")[1];
  if (languages.includes(currentLocale)) {
    response.cookies.set("lng", currentLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

// Note: middleware config is defined in root middleware.ts

