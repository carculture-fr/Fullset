import "i18next"

import type fr from "./locales/fr.json"

// Clés de traduction vérifiées par TypeScript : une clé absente de fr.json ne compile pas.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: { translation: typeof fr }
  }
}
