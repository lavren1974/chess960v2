'use client'

import Link from 'next/link'
import { Github, Send, MessageSquare, Shield } from 'lucide-react'
import { useTranslation } from '@/app/i18n/client'
import { siteConfig, formatCopyright } from '@/config/site'
import { ClientWrapper } from './client-wrapper'


// interface FooterProps {
//   lng: string
// }

// Footer with three content columns and a bottom copyright line. The
// copyright string is sourced from config if present (supports {year}/{site}
// placeholders) and falls back to localized i18n otherwise.
export function Footer({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, 'common')

  return (
    <ClientWrapper>
    <footer className="border-t mt-auto bg-base-200">
      <div className="mx-auto max-w-7xl py-12 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           {/* Column 1 - About */}
           <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.about')}</h3>
            <p className="text-sm text-base-content/80">
              {t('footer.description')}
            </p>
          </div>

          {/* Column 2 - Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.quickLinks')}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`/${lng}`} className="hover:text-primary transition-colors">
                  {t('nav.home')}
                </Link>
              </li>
              <li>
                <Link href={`/${lng}/results`} className="hover:text-primary transition-colors">
                  {t('nav.results')}
                </Link>
              </li>
              <li>
                <Link href={`/${lng}/standings`} className="hover:text-primary transition-colors">
                  {t('nav.standings')}
                </Link>
              </li>
              <li>
                <Link href={`/${lng}/about`} className="hover:text-primary transition-colors">
                  {t('nav.about')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3 - Connect */}
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.connect')}</h3>
            <div className="flex items-center space-x-4">
              <a 
                href="https://github.com/lavren1974/Chess960v2"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base-content/80 hover:text-primary transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-6 w-6" />
              </a>
              <a 
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base-content/80 hover:text-primary transition-colors"
                aria-label="Telegram"
              >
                <Send className="h-6 w-6" />
              </a>
              <a 
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base-content/80 hover:text-primary transition-colors"
                aria-label="Reddit"
              >
                <MessageSquare className="h-6 w-6" />
              </a>
              <a 
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base-content/80 hover:text-primary transition-colors"
                aria-label="Discord"
              >
                <Shield className="h-6 w-6" />
              </a>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-base-300 text-center text-sm text-base-content/60">
          <p>
            {siteConfig.copyright
              ? formatCopyright(siteConfig.copyright, siteConfig.siteName)
              : t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
    </ClientWrapper>
  );
}
