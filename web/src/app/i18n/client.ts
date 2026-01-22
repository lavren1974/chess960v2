// app/i18n/client.ts
'use client'

import i18next from 'i18next'
import { initReactI18next, useTranslation as useTranslationOrg } from 'react-i18next'
import { useEffect } from 'react'
import resourcesToBackend from 'i18next-resources-to-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { getOptions } from './settings'

// Initialize i18next for client side
i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(resourcesToBackend((language: string, namespace: string) => 
    import(`./locales/${language}/${namespace}.json`))
  )
  .init({
    ...getOptions(),
    lng: undefined,
    react: { useSuspense: false },
    detection: {
      order: ['path', 'htmlTag', 'cookie', 'navigator'],
      lookupCookie: 'NEXT_LOCALE',
      caches: ['cookie'],
    }
  })

export function useTranslation(lng: string, ns: string, options = {}) {
  const translation = useTranslationOrg(ns, options)

  useEffect(() => {
    if (i18next.resolvedLanguage !== lng) {
      i18next.changeLanguage(lng)
    }
  }, [lng])

  return translation
}
