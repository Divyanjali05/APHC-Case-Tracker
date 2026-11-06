import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import te from './locales/te.json';
import hi from './locales/hi.json';

const resources = {
  en: { translation: en },
  te: { translation: te },
  hi: { translation: hi },
};

const defaultLocale = process.env.EXPO_PUBLIC_DEFAULT_LOCALE || 'en';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v3',
    resources,
    lng: defaultLocale,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
