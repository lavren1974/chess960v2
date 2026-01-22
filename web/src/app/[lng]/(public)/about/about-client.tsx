'use client';

import Link from "next/link";
import { useTranslation } from "@/app/i18n/client";
import { Brain, Crown, Cpu, HardDrive, MemoryStick, Swords, Infinity as InfinityIcon, Github } from "lucide-react";

export function AboutClient({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, 'about');

  const whyTitle = t('about.tournament.why.title', { defaultValue: '' }) as string;
  const whyText = t('about.tournament.why.text', { defaultValue: '' }) as string;
  const timeTitle = t('about.tournament.time.title', { defaultValue: '' }) as string;
  const timeP1 = t('about.tournament.time.p1', { defaultValue: '' }) as string;
  const timeP2 = t('about.tournament.time.p2', { defaultValue: '' }) as string;
  const timeP3 = t('about.tournament.time.p3', { defaultValue: '' }) as string;
  const serverTitle = t('about.tournament.server.title', { defaultValue: '' }) as string;
  const serverText = t('about.tournament.server.text', { defaultValue: '' }) as string;

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-base-300/60 text-sm">
            <Crown className="size-4 text-primary" />
            <span className="font-medium">{t('about.badge', { defaultValue: 'About' })}</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            {t('about.title')}
          </h1>
          <p className="text-lg text-base-content/70">
            {t('about.description')}
          </p>
        </div>

        {/* Mission */}
        <section className="bg-base-100 rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-semibold mb-4">
            {t('about.mission.title')}
          </h2>
          <p className="text-base-content/80">
            {t('about.mission.text')}
          </p>
        </section>

        {/* Format */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-base-100 rounded-lg shadow-md p-8 space-y-4">
            <h2 className="text-2xl font-semibold">
              {t('about.format.title', { defaultValue: 'What is Chess960v2?' })}
            </h2>
            <p className="text-base-content/80">{t('about.format.p1', { defaultValue: '' })}</p>
            <p className="text-base-content/80">{t('about.format.p2', { defaultValue: '' })}</p>
            {/* Optional third paragraph if provided */}
            <p className="text-base-content/80">{t('about.format.p3', { defaultValue: '' })}</p>
          </div>
          <div className="bg-base-100 rounded-lg shadow-md p-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              {t('about.format.points', { defaultValue: 'Why it matters' })}
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-base-content/80">
              <li>{t('about.format.bullets.control', { defaultValue: '' })}</li>
              <li>{t('about.format.bullets.creativity', { defaultValue: '' })}</li>
              <li>{t('about.format.bullets.variety', { defaultValue: '' })}</li>
              <li>{t('about.format.bullets.rules', { defaultValue: '' })}</li>
            </ul>
          </div>
        </section>

        {/* Meaning of Chess960v2 */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
          <h2 className="text-2xl font-semibold">{t('about.meaning.title', { defaultValue: '' })}</h2>
          <p className="text-base-content/80">{t('about.meaning.text', { defaultValue: '' })}</p>
        </section>

        {/* Tournament */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="badge badge-secondary badge-lg">{t('about.tournament.badge', { defaultValue: 'Tournament' })}</div>
            <h2 className="text-2xl md:text-3xl font-bold">{t('about.tournament.title')}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-base-100 rounded-lg shadow-md p-8 space-y-3">
              <p>{t('about.tournament.p1')}</p>
              <p>{t('about.tournament.p2')}</p>
              {whyTitle && (
                <>
                  <h3 className="text-xl font-semibold pt-2">{whyTitle}</h3>
                  <p>{whyText}</p>
                </>
              )}
              {timeTitle && (
                <>
                  <h3 className="text-xl font-semibold pt-2">{timeTitle}</h3>
                  <p>{timeP1}</p>
                  <p>{timeP2}</p>
                  {timeP3 && <p>{timeP3}</p>}
                </>
              )}
            </div>
            <div className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
              <h3 className="card-title flex items-center gap-2">
                <Crown className="size-5 text-primary" /> {t('about.tournament.hardware.title')}
              </h3>
              {serverTitle && (
                <div className="text-base font-medium text-base-content/90">{serverTitle}</div>
              )}
              {serverText && (
                <p className="text-base-content/80">{serverText}</p>
              )}
              <div className="space-y-2 text-base-content/80">
                <div className="flex items-center gap-2"><Cpu className="size-4 text-primary" /> {t('about.tournament.hardware.cpu')}</div>
                <div className="flex items-center gap-2"><MemoryStick className="size-4 text-primary" /> {t('about.tournament.hardware.ram')}</div>
                <div className="flex items-center gap-2"><HardDrive className="size-4 text-primary" /> {t('about.tournament.hardware.ssd')}</div>
              </div>
              <p className="text-sm text-base-content/70">{t('about.tournament.hardware.note')}</p>
            </div>
          </div>
        </section>

        {/* Tech */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-4">
          <h2 className="text-2xl font-semibold">{t('about.tech.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base-content/80">
            <div>• {t('about.tech.items.next')}</div>
            <div>• {t('about.tech.items.supabase')}</div>
            <div>• {t('about.tech.items.tailwind')}</div>
            <div>• {t('about.tech.items.i18n')}</div>
          </div>
        </section>

        {/* Future */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
          <h2 className="text-2xl font-semibold">{t('about.future.title')}</h2>
          <p>{t('about.future.p1')}</p>
          <p>{t('about.future.p2')}</p>
        </section>

        {/* Benefits */}
        {(t('about.benefits.title', { defaultValue: '' }) as string) && (
          <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-6">
            <h2 className="text-2xl font-semibold">{t('about.benefits.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <Brain className="size-5 text-primary mt-1" />
                <div>
                  <div className="font-medium">{t('about.benefits.items.mem.title', { defaultValue: '' })}</div>
                  <p className="text-base-content/80">{t('about.benefits.items.mem.text', { defaultValue: '' })}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Swords className="size-5 text-primary mt-1" />
                <div>
                  <div className="font-medium">{t('about.benefits.items.control.title', { defaultValue: '' })}</div>
                  <p className="text-base-content/80">{t('about.benefits.items.control.text', { defaultValue: '' })}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <InfinityIcon className="size-5 text-primary mt-1" />
                <div>
                  <div className="font-medium">{t('about.benefits.items.variety.title', { defaultValue: '' })}</div>
                  <p className="text-base-content/80">{t('about.benefits.items.variety.text', { defaultValue: '' })}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Crown className="size-5 text-primary mt-1" />
                <div>
                  <div className="font-medium">{t('about.benefits.items.pure.title', { defaultValue: '' })}</div>
                  <p className="text-base-content/80">{t('about.benefits.items.pure.text', { defaultValue: '' })}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* For You */}
        {(t('about.forYou.title', { defaultValue: '' }) as string) && (
          <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
            <h2 className="text-2xl font-semibold">{t('about.forYou.title')}</h2>
            {Boolean(t('about.forYou.text', { defaultValue: '' })) && (
              <p className="text-base-content/80">{t('about.forYou.text')}</p>
            )}
          </section>
        )}

        {/* Creator */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
          <h2 className="text-2xl font-semibold">{t('about.creator.title')}</h2>
          <p className="text-base-content/80">{t('about.creator.p1')}</p>
        </section>

        {/* Support */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
          <h2 className="text-2xl font-semibold">{t('about.support.title')}</h2>
          <p className="text-base-content/80">{t('about.support.text')}</p>
          <div className="space-y-2 text-base-content/80">
            <div className="flex flex-wrap gap-2">
              <span className="font-medium">{t('about.support.btcLabel')}</span>
              <span className="font-mono break-all">
                bc1q4ye0nvx4z4gpr5lv7dut3hyu96m6dcvcpqqnj7
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="font-medium">{t('about.support.xmrLabel')}</span>
              <span className="font-mono break-all">
                48aN8ABaA5fXdniA5gbRbeQYGg2mLaXUVVT8bZoS19uVbd6oC8GxRS83RzRkGwUuyTJu6Sb8gazLGBzgTJrwVuHcJFAv81e
              </span>
            </div>
          </div>
        </section>

        {/* Open Source */}
        <section className="bg-base-100 rounded-lg shadow-md p-8 space-y-3">
          <h2 className="text-2xl font-semibold">{t('about.openSource.title')}</h2>
          <p className="text-base-content/80">{t('about.openSource.text')}</p>
          <a
            className="btn btn-outline"
            href="https://github.com/lavren1974/Chess960v2"
            target="_blank"
            rel="noreferrer"
          >
            {t('about.openSource.button')} <Github className="size-4" />
          </a>
        </section>

        {/* Links + CTA */}
        <section className="rounded-2xl border border-primary/20 bg-gradient-to-b from-base-100 to-base-200 p-6 md:p-10 text-center">
          <div className="max-w-3xl mx-auto space-y-5">
            <h2 className="text-2xl md:text-3xl font-extrabold">{t('about.cta.title')}</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="results" className="btn btn-secondary">
                {t('about.cta.watch')} <Swords className="size-4" />
              </Link>
              <Link href="register" className="btn btn-primary">
                {t('about.cta.join')} <Swords className="size-4" />
              </Link>
            </div>
            <div className="text-sm text-base-content/70">
              <p>{t('about.links.title')}</p>
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                <a className="link" href="https://github.com/lavren1974/Chess960v2">{t('about.links.github')}</a>
                <a className="link" href="#">{t('about.links.youtube')}</a>
                <a className="link" href="#">{t('about.links.telegram')}</a>
                <a className="link" href="#">{t('about.links.discord')}</a>
                <a className="link" href="#">{t('about.links.support')}</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
