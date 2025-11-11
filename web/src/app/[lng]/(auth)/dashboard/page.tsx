import { getServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "./page-client";
import { Settings } from "lucide-react";
import { getServerTranslation } from "@/app/i18n";
import type { Metadata } from "next";

export default async function Dashboard({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  const supabase = await getServerClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return (
      <div className="space-y-8">
        <div className="alert alert-error">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="font-bold">Authentication Required</h3>
            <div className="text-xs">Please log in to access your dashboard.</div>
          </div>
        </div>
      </div>
    );
  }

  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString() : null;
  const emailConfirmed = Boolean(user.email_confirmed_at);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
          <p className="text-base-content/60">Review your account details and manage your profile settings.</p>
        </div>
        <button className="btn btn-primary self-start sm:self-auto" id="settings-button">
          <Settings className="h-4 w-4 mr-2" />
          Account Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat bg-base-100 rounded-lg shadow-md">
          <div className="stat-title">Email</div>
          <div className="stat-value text-primary text-xl break-words">{user.email}</div>
          <div className="stat-desc">Primary contact address</div>
        </div>

        <div className="stat bg-base-100 rounded-lg shadow-md">
          <div className="stat-title">Account Status</div>
          <div className="stat-value text-success text-2xl">{emailConfirmed ? "Verified" : "Pending"}</div>
          <div className="stat-desc">
            {emailConfirmed ? "Email confirmed" : "Confirm your email to unlock all features"}
          </div>
        </div>

        <div className="stat bg-base-100 rounded-lg shadow-md">
          <div className="stat-title">Member Since</div>
          <div className="stat-value text-info text-2xl">{memberSince ?? "Unknown"}</div>
          <div className="stat-desc">Welcome back!</div>
        </div>
      </div>

      <DashboardClient lng={lng} />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const { t } = await getServerTranslation(lng, "common");
  return { title: t("dashboard.title") };
}
