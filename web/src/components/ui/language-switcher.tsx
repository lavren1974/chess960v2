// components/language-switcher.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { languages } from '@/app/i18n/settings'

interface LanguageSwitcherProps {
  lng: string;
}

export function LanguageSwitcher({ lng }: LanguageSwitcherProps) {
  const pathname = usePathname()

  const makePath = (newLng: string) => {
    if (!pathname || pathname === '/' || pathname === `/${lng}` || pathname === `/${lng}/`) {
      return `/${newLng}`
    }
    return pathname.replace(`/${lng}/`, `/${newLng}/`)
  }

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
        <span className="text-xl">{lng.toUpperCase()}</span>
      </div>
      <ul tabIndex={0} className="dropdown-content z-1 menu p-2 shadow-sm bg-base-100 rounded-box w-52">
        {languages.map((language) => {
          const href = makePath(language)
          return (
            <li key={language}>
              <Link
                href={href}
                className={`${lng === language ? 'active' : ''}`}
                onClick={(event) => {
                  if (language === lng) {
                    event.preventDefault()
                    return
                  }
                  const active = document.activeElement
                  if (active instanceof HTMLElement) active.blur()
                  document.cookie = `NEXT_LOCALE=${language}; Path=/; Max-Age=${60 * 60 * 24 * 365}`
                }}
              >
                {language.toUpperCase()}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
