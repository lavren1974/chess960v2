"use client";

import { useUser } from "@/components/supabase-provider";
import { deleteAccount, updateProfile } from "@/lib/actions/account";
import { useEffect, useState } from "react";
import { Trash2, AlertCircle, X, Save, Eye, EyeOff, Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import { PositionsBrowser } from "@/components/agents/positions-browser";

export function DashboardClient({ lng, favorites = [], initialPositions }: { lng: string; favorites?: AgentRow[]; initialPositions?: { view: "white" | "black"; page: number; perPage: number; rows: AgentRow[]; total: number; favoriteIds: number[]; counts: { white: number; black: number }; initialPages?: Partial<Record<"white" | "black", { page: number; perPage: number; rows: AgentRow[]; total: number }>>; initialExtra?: Array<{ view: "white" | "black"; page: number; perPage: number; rows: AgentRow[]; total: number }> } }) {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsErrors, setSettingsErrors] = useState<string[]>([]);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { t } = useTranslation();
  const [favList, setFavList] = useState<AgentRow[]>(favorites);
  const [favView, setFavView] = useState<"w" | "b">("w");

  const readTabParam = (): "profile" | "favorites" | "positions" | null => {
    const val = searchParams?.get("tab");
    if (val === "profile" || val === "favorites" || val === "positions") return val;
    return null;
  };

  const initialTab = (() => {
    const fromUrl = readTabParam();
    if (fromUrl) return fromUrl;
    try {
      const ls = typeof window !== "undefined" ? localStorage.getItem("dashboard.activeTab") : null;
      if (ls === "profile" || ls === "favorites" || ls === "positions") return ls;
    } catch {}
    return "profile" as const;
  })();

  const [activeTab, setActiveTab] = useState<"profile" | "favorites" | "positions">(initialTab as any);

  const displayName = (user?.user_metadata?.name as string | undefined)?.trim() || user?.email || "";

  const handleDeleteClick = () => setShowConfirm(true);
  const handleCancelDelete = () => setShowConfirm(false);

  const handleConfirmDelete = async () => {
    try {
      const result = await deleteAccount();
      if (result.error) {
        setError(result.error);
      } else if (result.redirect) {
        router.push(`/${lng}${result.redirect}`);
      }
    } catch (deleteError) {
      console.error("Error deleting account:", deleteError);
      setError(t("dashboard.errors.deleteUnexpected"));
    }
  };

  const handleSettingsSubmit = async (formData: FormData) => {
    setIsUpdatingProfile(true);
    setSettingsError(null);
    setSettingsErrors([]);
    setSettingsSuccess(false);
    setSettingsWarning(null);

    const password = (formData.get("password") as string)?.trim();
    const passwordConfirm = (formData.get("passwordConfirm") as string)?.trim();
    const currentPassword = (formData.get("currentPassword") as string)?.trim();

    if (!password) {
      formData.delete("password");
    }
    if (!passwordConfirm) {
      formData.delete("passwordConfirm");
    }
    if (!currentPassword) {
      formData.delete("currentPassword");
    }

    try {
      const result = await updateProfile(formData);
      if (result.error) {
        setSettingsError(result.error);
      } else if (result.errors) {
        setSettingsErrors(result.errors);
      } else if (result.success) {
        if (result.warning) {
          setSettingsWarning(result.warning);
        }
        setSettingsSuccess(true);
        setTimeout(() => {
          setShowSettings(false);
          setSettingsSuccess(false);
          setSettingsWarning(null);
        }, result.warning ? 4000 : 2000);
      }
    } catch (updateError) {
      console.error("Error updating profile:", updateError);
      setSettingsError(t("dashboard.profileTab.unexpectedError", "An unexpected error occurred"));
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const openSettings = () => {
    setShowSettings(true);
    setSettingsError(null);
    setSettingsErrors([]);
    setSettingsSuccess(false);
    setSettingsWarning(null);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  // Keep URL and localStorage in sync with the active tab
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard.activeTab", activeTab);
      }
    } catch {}

    if (!pathname) return;
    const sp = new URLSearchParams(searchParams?.toString());
    sp.set("tab", activeTab);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // React to external URL changes (e.g., navigation to a different tab)
  useEffect(() => {
    const q = readTabParam();
    if (q && q !== activeTab) setActiveTab(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="alert alert-error">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Tabs header */}
      <div className="tabs tabs-boxed w-fit">
        <button className={`tab ${activeTab === "profile" ? "tab-active" : ""}`} onClick={() => setActiveTab("profile")}>
          {t("dashboard.profile", "Profile")}
        </button>
        <button className={`tab ${activeTab === "favorites" ? "tab-active" : ""}`} onClick={() => setActiveTab("favorites")}>
          {t("dashboard.favorites", "Favorites")}
        </button>
        <button className={`tab ${activeTab === "positions" ? "tab-active" : ""}`} onClick={() => setActiveTab("positions")}>
          {t("positions.title", "Positions")}
        </button>
      </div>

      {/* Tab panels */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          {/* Account quick stats + settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="stat bg-base-100 rounded-lg shadow-md">
              <div className="stat-title">{t("dashboard.profileTab.emailLabel", "Email")}</div>
              <div className="stat-value text-primary text-xl break-words">{user?.email}</div>
              <div className="stat-desc">{t("dashboard.profileTab.emailDesc", "Primary contact address")}</div>
            </div>
            <div className="stat bg-base-100 rounded-lg shadow-md">
              <div className="stat-title">{t("dashboard.profileTab.memberSince", "Member Since")}</div>
              <div className="stat-value text-info text-2xl">
                {user?.created_at ? new Date(user.created_at as string).toLocaleDateString() : t("dashboard.profileTab.memberSinceUnknown", "Unknown")}
              </div>
              <div className="stat-desc">{t("dashboard.profileTab.memberSinceDesc", "Welcome back!")}</div>
            </div>
            <div className="card bg-base-100 rounded-lg shadow-md md:col-span-2">
              <div className="card-body">
                <button className="btn btn-primary self-start" onClick={openSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  {t("dashboard.settings", "Settings")}
                </button>
              </div>
            </div>
          </div>

          {/* Profile info */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title">{t("dashboard.profile", "Profile")}</h2>
              <p className="text-base-content/60">{t("dashboard.profileTab.manageIntro", "Manage your personal information and preferences.")}</p>
              <div className="mt-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-base-content/60">{t("dashboard.profileTab.name", "Name")}</span>
                  <span className="font-medium break-words">{displayName}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-base-content/60">{t("dashboard.profileTab.emailLabel", "Email")}</span>
                  <span className="font-medium break-all">{user?.email}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-base-content/60">{t("dashboard.profileTab.userId", "User ID")}</span>
                  <span className="font-mono text-sm break-all">{user?.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title">{t("dashboard.profileTab.dangerTitle", "Danger Zone")}</h2>
              <p className="text-base-content/60">{t("dashboard.profileTab.dangerDesc", "Delete your account and all associated data.")}</p>
              <button className="btn btn-error mt-4" onClick={handleDeleteClick}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("dashboard.profileTab.delete", "Delete Account")}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "favorites" && (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body pt-2">
            <h2 className="card-title">{t("dashboard.favorites", "Favorites")}</h2>
            {(() => {
              const white = favList.filter((a) => a.color === "w");
              const black = favList.filter((a) => a.color === "b");
              const countW = white.length;
              const countB = black.length;
              const items = (favView === "w" ? white : black).slice(0, 100);
              if (favList.length === 0) {
                return (
                  <p className="text-base-content/60">
                    {t("dashboard.favoritesEmpty", "No favorites yet. Browse positions to add some.")}
                  </p>
                );
              }
              return (
                <>
                  <div className="w-fit mb-3 flex gap-3">
                    <button
                      className={`btn ${favView === "w" ? "btn-primary text-primary-content" : "btn-outline"}`}
                      onClick={() => setFavView("w")}
                      type="button"
                    >
                      {t("playPage.white", "White")}
                      <span className="ml-2 badge badge-ghost badge-xs">{countW}</span>
                    </button>
                    <button
                      className={`btn ${favView === "b" ? "btn-primary text-primary-content" : "btn-outline"}`}
                      onClick={() => setFavView("b")}
                      type="button"
                    >
                        {t("playPage.black", "Black")}
                        <span className="ml-2 badge badge-ghost badge-xs">{countB}</span>
                      </button>
                    </div>
                  {items.length === 0 ? (
                    <p className="text-base-content/60">{t("dashboard.favoritesSideEmpty", { defaultValue: "No favorites for this side yet." })}</p>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[24rem] overflow-y-auto pr-1">
                      {items.map((a) => (
                        <a
                          key={`fav-${a.id}`}
                          className="inline-block align-middle link link-primary"
                          href={`/${lng}/results/player/${a.id}`}
                          title={`${a.color}-${a.sp_id}`}
                        >
                          <AgentLabel
                            agent={a}
                            isFavorited
                            onFavoriteChange={(agentId, isFav) => {
                              if (!isFav) setFavList((prev) => prev.filter((x) => x.id !== agentId));
                            }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === "positions" && (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body pt-2">
            <h2 className="card-title">{t("positions.title", "Positions")}</h2>
            <PositionsBrowser
              lng={lng}
              initial={initialPositions}
              onFavoriteToggle={(agent, isFav) => {
                setFavList((prev) => {
                  const exists = prev.some((x) => x.id === agent.id);
                  if (isFav) {
                    if (exists) return prev;
                    // Prepend so newest appears first
                    return [agent, ...prev];
                  }
                  // remove
                  return prev.filter((x) => x.id !== agent.id);
                });
              }}
            />
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{t("dashboard.profileTab.deleteConfirmTitle", "Confirm Account Deletion")}</h3>
            <p className="py-4 text-base-content/70">
              {t("dashboard.profileTab.deleteConfirmBody", "This action will permanently remove your account and data. This cannot be undone.")}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={handleCancelDelete}>
                {t("dashboard.profileTab.cancel", "Cancel")}
              </button>
              <button className="btn btn-error" onClick={handleConfirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("dashboard.profileTab.delete", "Delete Account")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">{t("dashboard.profileTab.accountSettings", "Account Settings")}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {settingsError && (
              <div className="alert alert-error mb-4">
                <AlertCircle className="h-5 w-5" />
                <span>{settingsError}</span>
              </div>
            )}

            {settingsWarning && (
              <div className="alert alert-warning mb-4">
                <AlertCircle className="h-5 w-5" />
                <span>{settingsWarning}</span>
              </div>
            )}

            {settingsSuccess && (
              <div className="alert alert-success mb-4">
                <AlertCircle className="h-5 w-5" />
                <span>{t("dashboard.profileTab.profileUpdated", "Profile updated.")}</span>
              </div>
            )}

            {settingsErrors.length > 0 && (
              <div className="alert alert-error mb-4">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <ul className="list-disc ml-4">
                    {settingsErrors.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <form action={handleSettingsSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-base-content/80 mb-1">
                  {t("dashboard.profileTab.name", "Name")}
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  defaultValue={(user?.user_metadata?.name as string | undefined) ?? ""}
                  className="input input-bordered w-full cursor-not-allowed bg-base-200"
                  required
                  readOnly
                />
              </div>

              <div className="divider">{t("dashboard.profileTab.changePassword", "Change Password (Optional)")}</div>

              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-base-content/80 mb-1">
                  {t("dashboard.profileTab.currentPassword", "Current Password")}
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    name="currentPassword"
                    placeholder={t("dashboard.profileTab.currentPasswordPlaceholder", "Enter current password")}
                    className="input input-bordered w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/60 hover:text-base-content"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-base-content/80 mb-1">
                  {t("dashboard.profileTab.newPassword", "New Password")}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showNewPassword ? "text" : "password"}
                    name="password"
                    placeholder={t("dashboard.profileTab.newPasswordPlaceholder", "Enter new password")}
                    className="input input-bordered w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/60 hover:text-base-content"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="passwordConfirm" className="block text-sm font-medium text-base-content/80 mb-1">
                  {t("dashboard.profileTab.confirmNewPassword", "Confirm New Password")}
                </label>
                <div className="relative">
                  <input
                    id="passwordConfirm"
                    type={showConfirmPassword ? "text" : "password"}
                    name="passwordConfirm"
                    placeholder={t("dashboard.profileTab.confirmNewPasswordPlaceholder", "Confirm new password")}
                    className="input input-bordered w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/60 hover:text-base-content"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" className="btn btn-primary flex-1" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {isUpdatingProfile
                    ? t("dashboard.profileTab.submitting", "Updating...")
                    : t("dashboard.profileTab.submit", "Update Profile")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="btn btn-ghost"
                  disabled={isUpdatingProfile}
                >
                  {t("dashboard.profileTab.cancel", "Cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
