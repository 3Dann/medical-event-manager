import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import he from './locales/he.json'
import en from './locales/en.json'
import ar from './locales/ar.json'
import ru from './locales/ru.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import am from './locales/am.json'

export const RTL_LANGS = ['he', 'ar']

export const LANGUAGES = [
  { code: 'he', flag: '🇮🇱', name: 'עברית', dir: 'rtl' },
  { code: 'en', flag: '🇬🇧', name: 'English', dir: 'ltr' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية', dir: 'rtl' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский', dir: 'ltr' },
  { code: 'fr', flag: '🇫🇷', name: 'Français', dir: 'ltr' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch', dir: 'ltr' },
  { code: 'es', flag: '🇪🇸', name: 'Español', dir: 'ltr' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano', dir: 'ltr' },
  { code: 'pt', flag: '🇧🇷', name: 'Português', dir: 'ltr' },
  { code: 'am', flag: '🇪🇹', name: 'አማርኛ', dir: 'ltr' },
]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { he, en, ar, ru, fr, de, es, it, pt, am },
    defaultNS: 'common',
    ns: ['common', 'lang', 'nav', 'auth', 'landing', 'dashboard', 'diagnosis', 'claim_status', 'patient_portal', 'intake'],
    fallbackLng: 'he',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
