'use client'

import { useEffect, useState } from 'react'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { getOptions } from '@/app/i18n/settings'

interface I18nProviderProps {
  children: React.ReactNode
  lng: string
  namespaces: string[]
}

export function I18nProvider({
  children,
  lng,
  namespaces,
}: I18nProviderProps) {
  const hasAllNamespaces = (language: string, ns: string[]) =>
    ns.length === 0 || ns.every((name) => i18next.hasResourceBundle(language, name))

  const [ready, setReady] = useState(
    i18next.isInitialized && hasAllNamespaces(lng, namespaces)
  )

  useEffect(() => {
    let isActive = true

    async function init() {
      if (!i18next.isInitialized) {
        i18next
          .use(initReactI18next)
          .use(LanguageDetector)
          .use(resourcesToBackend((language: string, namespace: string) =>
            import(`@/app/i18n/locales/${language}/${namespace}.json`))
          )

        await i18next.init({
          ...getOptions(lng),
          lng,
          ns: namespaces,
          react: { useSuspense: false },
          detection: {
            order: ['path', 'htmlTag', 'cookie', 'navigator'],
            lookupCookie: 'NEXT_LOCALE',
            caches: ['cookie'],
          }
        })
      }

      if (!isActive) return
      setReady(true)
    }

    init()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    async function syncLanguage() {
      if (!i18next.isInitialized) return
      if (i18next.resolvedLanguage !== lng) {
        await i18next.changeLanguage(lng)
      }
      if (namespaces.length) {
        await i18next.loadNamespaces(namespaces)
      }
      if (isActive) {
        setReady(hasAllNamespaces(lng, namespaces))
      }
    }

    syncLanguage()

    return () => {
      isActive = false
    }
  }, [lng, namespaces])

  if (!ready) return null

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>
}
