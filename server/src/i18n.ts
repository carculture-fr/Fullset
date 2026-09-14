import { AsyncLocalStorage } from "node:async_hooks"
import type { NextFunction, Request, Response } from "express"

import en from "./locales/en.json" with { type: "json" }
import fr from "./locales/fr.json" with { type: "json" }

/**
 * Messages renvoyés au client, en français ou en anglais selon l'en-tête Accept-Language de la
 * requête en cours (gardée dans un AsyncLocalStorage). Hors requête (tâches de fond, tests qui
 * appellent les fonctions directement) : français. Dictionnaires : locales/fr.json (référence)
 * et locales/en.json, mêmes clés, variables `{{nom}}`, pluriels `_one` / `_other` avec `count`.
 */

export type Lang = "fr" | "en"
type Dict = { [key: string]: string | Dict }
const DICTS: Record<Lang, Dict> = { fr, en }

const store = new AsyncLocalStorage<Lang>()

/** Premier tag `fr*` ou `en*` par ordre de préférence ; sans en-tête : français ; ni l'un ni l'autre : anglais. */
export function langFromHeader(header: string | null | undefined): Lang {
  if (!header?.trim()) return "fr"
  const tags = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";")
      const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith("q="))?.slice(2) ?? 1)
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1, i }
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  for (const { tag } of tags) {
    if (tag === "fr" || tag.startsWith("fr-")) return "fr"
    if (tag === "en" || tag.startsWith("en-")) return "en"
  }
  // « * » seul (fetch de Node l'envoie par défaut) : aucune préférence, donc français.
  return tags.every((t) => t.tag === "*") ? "fr" : "en"
}

/** Ligne de commande : anglais sauf si LANG commence par « fr ». */
export const langFromEnv = (): Lang => (process.env.LANG?.toLowerCase().startsWith("fr") ? "fr" : "en")

export const requestLang = (req: Request): Lang => langFromHeader(req.get("accept-language"))
export const currentLang = (): Lang => store.getStore() ?? "fr"
export const runWithLang = <T>(lang: Lang, fn: () => T): T => store.run(lang, fn)

/**
 * Pose la langue de la requête pour la suite du traitement. Posé tôt, puis de nouveau après les
 * lecteurs de corps : ils reprennent la main depuis des événements de flux, hors du contexte.
 */
export function languageMiddleware(req: Request, _res: Response, next: NextFunction) {
  store.run(requestLang(req), next)
}

/** Enveloppe un middleware (multer) pour que la suite reparte dans la langue de la requête. */
export const keepLanguage =
  (mw: (req: Request, res: Response, next: NextFunction) => void) => (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, (err?: unknown) => store.run(requestLang(req), () => next(err)))

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict
  for (const part of key.split(".")) {
    if (typeof node !== "object") return undefined
    node = node[part]
  }
  return typeof node === "string" ? node : undefined
}

export type Params = Record<string, string | number | null | undefined>

/** Message traduit ; une clé inconnue revient telle quelle. `count` choisit `_one` / `_other`. */
export function msg(key: string, params: Params = {}, lang: Lang = currentLang()): string {
  const find = (k: string) => lookup(DICTS[lang], k) ?? lookup(DICTS.fr, k)
  let template: string | undefined
  if (typeof params.count === "number") template = find(`${key}_${new Intl.PluralRules(lang).select(params.count)}`) ?? find(`${key}_other`)
  template ??= find(key) ?? key
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name: string) => (params[name] === undefined || params[name] === null ? all : String(params[name])))
}
