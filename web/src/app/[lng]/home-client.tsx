'use client';

import { useTranslation } from "@/app/i18n/client";
import Link from "next/link";
import {
  ArrowRight,
  Swords,
  Shuffle,
  Brain,
  Trophy,
  BookOpen,
  Gem,
  Crown,
  AlertTriangle,
} from "lucide-react";

export function HomeClient({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "home");

  const features = [
    {
      icon: Brain,
      title: t("advantages.a1.title"),
      description: t("advantages.a1.text"),
      badge: t("advantages.a1.resultLabel"),
    },
    {
      icon: BookOpen,
      title: t("goals.openingTheory.title"),
      description: t("goals.openingTheory.text"),
      badge: t("solution.badge"),
    },
    {
      icon: Gem,
      title: t("goals.gems.title"),
      description: t("goals.gems.text"),
      badge: t("advantages.badge"),
    },
  ];

  return (
    <div className="space-y-20">
      {/* Test Mode Alert */}
      <div className="alert alert-success shadow-lg">
        <AlertTriangle className="size-5" />
        <div>
          <h3 className="font-bold">{t("testMode.title")}</h3>
          <div className="text-sm">{t("testMode.message")}</div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-base-200 to-base-100">
        <div className="absolute inset-0 pointer-events-none [mask-image:radial-gradient(60%_60%_at_50%_20%,#000_40%,transparent_80%)]">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[120%] bg-gradient-to-r from-primary/20 via-secondary/10 to-accent/20 blur-3xl" />
        </div>
        <div className="relative px-6 py-16 md:px-10 lg:px-16">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-base-300/60 text-sm">
              <Trophy className="size-4 text-primary" />
              <span className="font-medium">{t("hero.badge")}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              {t("hero.title")}
            </h1>
            <div className="text-lg md:text-xl text-base-content/70 space-y-4">
              <p>{t("hero.p1")}</p>
              <p>{t("hero.p2")}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link href="results" className="btn btn-secondary">
                {t("landing.watchLive")} <Swords className="size-4" />
              </Link>
              <Link href="register" className="btn btn-primary">
                {t("buttons.join")} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What is Chess960v2 Section */}
      <section className="space-y-8">
        <header className="text-center max-w-2xl mx-auto">
          <div className="badge badge-primary badge-lg mb-2">{t("concept.badge")}</div>
          <h2 className="text-3xl md:text-4xl font-bold">{t("concept.title")}</h2>
          <p className="mt-4 text-lg text-base-content/80">{t("problem.text1")}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card bg-base-100 shadow-md text-center">
            <div className="card-body items-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xl">1</span>
              <h3 className="card-title">{t("concept.step1.title")}</h3>
              <p>{t("concept.step1.text")}</p>
            </div>
          </div>
          <div className="card bg-base-100 shadow-md text-center">
            <div className="card-body items-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xl">2</span>
              <h3 className="card-title">{t("concept.step2.title")}</h3>
              <p>{t("concept.step2.text")}</p>
            </div>
          </div>
          <div className="card bg-base-100 shadow-md text-center">
            <div className="card-body items-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xl">3</span>
              <h3 className="card-title">{t("concept.step3.title")}</h3>
              <p>{t("concept.step3.text")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="space-y-8">
        <header className="text-center max-w-2xl mx-auto">
          <div className="badge badge-secondary badge-lg mb-2">{t("advantages.badge")}</div>
          <h2 className="text-3xl md:text-4xl font-bold">{t("advantages.title")}</h2>
          <p className="mt-4 text-lg text-base-content/80">{t("solution.text")}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow">
              <div className="card-body">
                <div className="flex items-center gap-3">
                  <feature.icon className="size-7 text-primary" />
                  <h3 className="card-title text-lg">{feature.title}</h3>
                </div>
                <p className="text-base-content/80 mt-2">{feature.description}</p>
                <div className="card-actions justify-end mt-4">
                  <div className="badge badge-outline badge-primary">{feature.badge}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-b from-base-100 to-base-200 p-8 md:p-12 text-center">
        <div className="max-w-3xl mx-auto space-y-5">
          <Crown className="mx-auto size-10 text-primary" />
          <h2 className="text-3xl md:text-4xl font-extrabold">{t("concluding.title")}</h2>
          <p className="text-lg md:text-xl text-base-content/80">{t("concluding.p")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="results" className="btn btn-secondary btn-lg">
              {t("landing.watchLive")} <Swords className="size-5" />
            </Link>
            <Link href="register" className="btn btn-primary btn-lg">
              {t("buttons.create")} <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
