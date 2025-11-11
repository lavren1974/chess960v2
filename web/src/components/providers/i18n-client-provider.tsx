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
  const [instance, setInstance] = useState(i18next)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const i18nInstance = i18next
      .createInstance()
      .use(initReactI18next)
      .use(LanguageDetector)
      .use(resourcesToBackend((language: string, namespace: string) => 
        import(`@/app/i18n/locales/${language}/${namespace}.json`))
      )

    async function init() {
      await i18nInstance.init({
        ...getOptions(lng),
        lng,
        ns: namespaces,
        detection: {
          order: ['path', 'htmlTag', 'cookie', 'navigator'],
        }
      })
      setInstance(i18nInstance)
      setMounted(true)
    }

    init()
  }, [lng, namespaces])

  if (!mounted) return null

  return (
    <I18nextProvider i18n={instance}>
      {children}
    </I18nextProvider>
  )
}