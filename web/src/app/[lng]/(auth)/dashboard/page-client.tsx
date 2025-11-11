"use client";

import { useUser } from "@/components/supabase-provider";
import { deleteAccount, updateProfile } from "@/lib/actions/account";
import { useState, useEffect } from "react";
import { Trash2, AlertCircle, X, Save, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export function DashboardClient({ lng }: { lng: string }) {
  const user = useUser();
  const router = useRouter();
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
      setSettingsError("An unexpected error occurred");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  useEffect(() => {
    const button = document.getElementById("settings-button");
    if (!button) {
      return;
    }

    const handleSettingsClick = () => {
      setShowSettings(true);
      setSettingsError(null);
      setSettingsErrors([]);
      setSettingsSuccess(false);
      setSettingsWarning(null);
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    };

    button.addEventListener("click", handleSettingsClick);
    return () => button.removeEventListener("click", handleSettingsClick);
  }, []);

  return (
    <div className="space-y-8">
      {error && (
        <div className="alert alert-error">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card bg-base-100 shadow-md lg:col-span-2">
          <div className="card-body">
            <h2 className="card-title">Profile</h2>
            <p className="text-base-content/60">Manage your personal information and preferences.</p>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-base-content/60">Name</span>
                <span className="font-medium">{displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Email</span>
                <span className="font-medium">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">User ID</span>
                <span className="font-mono text-sm">{user?.id}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <h2 className="card-title">Danger Zone</h2>
            <p className="text-base-content/60">Delete your account and all associated data.</p>
            <button className="btn btn-error mt-4" onClick={handleDeleteClick}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Confirm Account Deletion</h3>
            <p className="py-4 text-base-content/70">
              This action will permanently remove your account and data. This cannot be undone.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={handleCancelDelete}>
                Cancel
              </button>
              <button className="btn btn-error" onClick={handleConfirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Account Settings</h2>
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
                <span>Profile updated.</span>
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
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  defaultValue={(user?.user_metadata?.name as string | undefined) ?? ""}
                  className="input input-bordered w-full"
                  required
                />
              </div>

              <div className="divider">Change Password (Optional)</div>

              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-base-content/80 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    name="currentPassword"
                    placeholder="Enter current password"
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
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showNewPassword ? "text" : "password"}
                    name="password"
                    placeholder="Enter new password"
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
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="passwordConfirm"
                    type={showConfirmPassword ? "text" : "password"}
                    name="passwordConfirm"
                    placeholder="Confirm new password"
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
                  {isUpdatingProfile ? "Updating..." : "Update Profile"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="btn btn-ghost"
                  disabled={isUpdatingProfile}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
