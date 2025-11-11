// app/i18n/settings.ts
export const fallbackLng = 'en'
export const languages = [fallbackLng, 'es', 'fr', 'de', 'ru']
export const defaultNS = 'common'

export function getOptions(lng = fallbackLng, ns = defaultNS) {
  return {
    supportedLngs: languages,
    fallbackLng,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns
  }
}