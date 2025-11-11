// components/language-switcher.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { languages } from '@/app/i18n/settings'

interface LanguageSwitcherProps {
  lng: string;
}

export function LanguageSwitcher({ lng }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const router = useRouter()

  const handleLanguageChange = (newLng: string) => {
    const currentPath = window.location.pathname
    let newPath: string

    // Handle root path specially
    if (currentPath === '/' || currentPath === `/${lng}` || currentPath === `/${lng}/`) {
      newPath = `/${newLng}`
    } else {
      newPath = currentPath.replace(`/${lng}/`, `/${newLng}/`)
    }

    // Persist selection for future visits
    try {
      const secure = window.location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `lng=${newLng}; path=/; max-age=31536000; samesite=lax${secure}`
    } catch {}

    router.push(newPath)
    i18n.changeLanguage(newLng)
  }

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
        <span className="text-xl">{lng.toUpperCase()}</span>
      </div>
      <ul tabIndex={0} className="dropdown-content z-1 menu p-2 shadow-sm bg-base-100 rounded-box w-52">
        {languages.map((language) => (
          <li key={language}>
            <button
              className={`${lng === language ? 'active' : ''}`}
              onClick={() => handleLanguageChange(language)}
            >
              {language.toUpperCase()}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
