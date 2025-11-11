"use client";

import { logout } from "@/lib/actions/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "../supabase-provider";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClientWrapper } from "./client-wrapper";
import { siteConfig } from "@/config/site";

export function Navbar({ lng }: { lng: string }) {
  const user = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useTranslation();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result?.redirect) {
      router.push(`/${lng}${result.redirect}`);
    }
  };

  // Match current path against a route suffix (locale is prefixed in app router).
  const isActive = (path: string) => pathname === `/${lng}${path}`;

  // Utility to produce consistent link styles with active/hover states.
  const linkStyle = (path: string) => `
  px-4 py-2 rounded-md transition-colors inline-flex items-center
  ${
    isActive(path)
      ? "bg-primary text-primary-content hover:bg-primary-focus"
      : "hover:bg-base-200"
  }
`;

  const displayName =
    (user?.user_metadata?.name as string | undefined)?.trim() || user?.email || "";

  return (
    <ClientWrapper>
      <nav className="border-b shadow-xs bg-base-100">
        <div className="navbar mx-auto max-w-7xl px-4">
          <div className="navbar-start">
            {/* Brand navigates to locale root */}
            <Link
              href={`/${lng}`}
              className={`text-xl font-bold transition-colors ${
                isActive("/") ? "text-primary" : "hover:text-primary"
              }`}
            >
              {siteConfig.siteName}
            </Link>
          </div>

          <div className="navbar-center hidden md:flex">
            <ul className="flex items-center space-x-2">
              <li>
                <Link href={`/${lng}/standings`} className={linkStyle("/standings")}>
                  {t("nav.standings")}
                </Link>
              </li>
              <li>
                <Link href={`/${lng}/ratings`} className={linkStyle("/ratings")}>
                  {t("nav.ratings")}
                </Link>
              </li>
              {/** Removed Latest Results from menu */}
              <li>
                <Link href={`/${lng}/results/all`} className={linkStyle("/results/all")}>
                  {t("nav.allResults")}
                </Link>
              </li>
              <li>
                <Link href={`/${lng}/about`} className={linkStyle("/about")}>
                  {t("nav.about")}
                </Link>
              </li>
            </ul>
          </div>

          <div className="navbar-end flex md:hidden">
            <LanguageSwitcher lng={lng} />
            <ThemeToggle />

            <button
              onClick={toggleMenu}
              className="btn btn-ghost btn-circle ml-2"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          <div className="navbar-end hidden md:flex items-center gap-2">
            <ul className="flex items-center space-x-2">
              {user ? (
                <>
                  <li>
                    <Link
                      href={`/${lng}/dashboard`}
                      className={linkStyle("/dashboard")}
                    >
                      {displayName}
                    </Link>
                  </li>
                  <li>
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2 rounded-md hover:bg-base-200 transition-colors"
                    >
                      {t("nav.logout")}
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link
                      href={`/${lng}/login`}
                      className={linkStyle("/login")}
                    >
                      {t("nav.login")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/${lng}/register`}
                      className={linkStyle("/register")}
                    >
                      {t("nav.register")}
                    </Link>
                  </li>
                </>
              )}
            </ul>
            <LanguageSwitcher lng={lng} />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div
        className={`
        md:hidden transition-all duration-300 ease-in-out
        ${isMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
        overflow-hidden bg-base-100
      `}
      >
        <div className="px-4 py-2 space-y-2">
          <Link
            href={`/${lng}/standings`}
            className={`block ${linkStyle("/standings")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            {t("nav.standings")}
          </Link>

          <Link
            href={`/${lng}/ratings`}
            className={`block ${linkStyle("/ratings")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            {t("nav.ratings")}
          </Link>

          {/** Removed Latest Results from mobile menu */}

          <Link
            href={`/${lng}/results/all`}
            className={`block ${linkStyle("/results/all")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            {t("nav.allResults")}
          </Link>

          <Link
            href={`/${lng}/about`}
            className={`block ${linkStyle("/about")}`}
            onClick={() => setIsMenuOpen(false)}
          >
            {t("nav.about")}
          </Link>

          {user ? (
            <>
              <Link
                href={`/${lng}/dashboard`}
                className={`block ${linkStyle("/dashboard")}`}
                onClick={() => setIsMenuOpen(false)}
              >
                {displayName}
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  setIsMenuOpen(false);
                }}
                className="block w-full text-left px-4 py-2 rounded-md hover:bg-base-200 transition-colors"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/${lng}/login`}
                className={`block ${linkStyle("/login")}`}
                onClick={() => setIsMenuOpen(false)}
              >
                {t("nav.login")}
              </Link>
              <Link
                href={`/${lng}/register`}
                className={`block ${linkStyle("/register")}`}
                onClick={() => setIsMenuOpen(false)}
              >
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>
      </div>
    </ClientWrapper>
  );
}
