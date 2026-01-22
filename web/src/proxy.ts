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
    const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
    const locale = languages.includes(cookieLocale || "") ? cookieLocale! : fallbackLng;
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = `/${locale}${pathname}`;
    const redirect = NextResponse.redirect(newUrl);
    // also propagate preference on redirect
    redirect.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return redirect;
  }

  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  // Keep cookie in sync with path locale when present
  const currentLocale = pathname.split("/")[1];
  if (languages.includes(currentLocale)) {
    response.cookies.set("NEXT_LOCALE", currentLocale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  if (protectedRoutes.some((route) => pathWithoutLocale.startsWith(route))) {
    const supabase = getMiddlewareClient(request, response);
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      const locale = pathname.split("/")[1];
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico).*)"],
};

