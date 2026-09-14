import { describe, expect, it } from "vitest"

import en from "../locales/en.json"
import fr from "../locales/fr.json"

type Tree = { [key: string]: string | Tree }

const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v]] : Object.entries(flatten(v, `${prefix}${k}.`)))),
  )

const variables = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort()

// Le français est la référence : une traduction reprend exactement ses clés, variables et balises.
describe("fichiers de langue", () => {
  const frKeys = flatten(fr as Tree)
  const enKeys = flatten(en as Tree)

  it("fr.json et en.json ont exactement les mêmes clés", () => {
    expect(Object.keys(enKeys).sort()).toEqual(Object.keys(frKeys).sort())
  })

  it("chaque traduction garde les mêmes variables {{…}} et balises <…>", () => {
    for (const [key, text] of Object.entries(frKeys)) {
      // Pluriels : la forme « one » peut omettre le nombre (« used once »).
      const mine = enKeys[key] ?? ""
      if (!key.endsWith("_one")) expect(variables(mine), key).toEqual(variables(text))
      expect(tags(mine), key).toEqual(tags(text))
    }
  })

  it("aucune traduction vide", () => {
    for (const [key, text] of Object.entries({ ...frKeys, ...enKeys })) expect(text.trim(), key).not.toBe("")
  })
})
