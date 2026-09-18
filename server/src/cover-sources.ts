import type { IgdbClient } from "./igdb.js"
import type { ScreenscraperClient } from "./screenscraper.js"
import type { SteamGridClient } from "./steamgriddb.js"

/**
 * Les jaquettes proposées pour un jeu ou pour une console, rassemblées depuis les sources
 * branchées : à toi de choisir, comme dans RomM. Une source qui ne répond pas (clé absente,
 * service en panne, quota atteint) est simplement absente de la liste : les autres restent.
 *
 * Deux façons de désigner une image : son adresse quand elle est montrable (IGDB, SteamGridDB),
 * ou un repère opaque quand l'adresse porte des identifiants (ScreenScraper, dont les URL de
 * médias contiennent le mot de passe développeur). Le repère se relit par `/api/screenscraper/media`.
 */

export type CoverSource = "igdb" | "screenscraper" | "steamgriddb"

export type CoverOption = {
  source: CoverSource
  /** Ce qui distingue cette image des autres : région, style, type de boîte. */
  label: string
  /** Adresse de l'image à poser, quand elle peut voyager. */
  url?: string
  /** Repère à repasser au serveur, quand l'adresse ne peut pas voyager. */
  key?: string
  /** Ce que l'écran affiche. */
  thumb: string
}

type Sources = {
  igdb(): IgdbClient | null
  screenscraper(): ScreenscraperClient | null
  steamgriddb(): SteamGridClient | null
}

/** Vignette servie par le serveur pour une image ScreenScraper (son adresse porte des secrets). */
export const screenscraperThumb = (key: string, width = 300) => `/api/screenscraper/media?key=${encodeURIComponent(key)}&w=${width}`

const label = (parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" · ")

/** Chaque source à son tour, sans qu'une panne n'emporte les autres. */
async function gather(tasks: Array<() => Promise<CoverOption[]>>) {
  const results = await Promise.allSettled(tasks.map((run) => run()))
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
}

export async function gameCoverOptions(sources: Sources, game: { igdb_id: number | null; title: string; platform: string }): Promise<CoverOption[]> {
  const igdb = sources.igdb()
  const screenscraper = sources.screenscraper()
  const steamgriddb = sources.steamgriddb()

  return gather([
    async () => {
      if (!igdb || game.igdb_id === null) return []
      const fiche = await igdb.game(game.igdb_id, game.platform)
      return fiche.covers.map((c) => ({ source: "igdb" as const, label: label(["IGDB", c.label]), url: c.url, thumb: c.url }))
    },
    async () => {
      if (!screenscraper) return []
      const [jeu] = await screenscraper.search(game.title, game.platform)
      if (!jeu) return []
      return jeu.covers.map((c) => ({
        source: "screenscraper" as const,
        label: label(["ScreenScraper", c.type, c.region]),
        key: c.key,
        thumb: screenscraperThumb(c.key),
      }))
    },
    async () => {
      if (!steamgriddb) return []
      const [jeu] = await steamgriddb.search(game.title)
      if (!jeu) return []
      const images = await steamgriddb.covers(jeu.id)
      return images.slice(0, 12).map((i) => ({
        source: "steamgriddb" as const,
        label: label(["SteamGridDB", i.style, i.author]),
        url: i.url,
        thumb: i.thumb,
      }))
    },
  ])
}

/** Images proposées pour une console : celles de ScreenScraper viennent compléter Commons. */
export async function hardwareCoverOptions(sources: Sources, platform: string): Promise<CoverOption[]> {
  const screenscraper = sources.screenscraper()
  if (!screenscraper) return []
  return gather([
    async () => {
      const images = await screenscraper.systemImages(platform)
      return images.map((i) => ({
        source: "screenscraper" as const,
        label: label(["ScreenScraper", i.type, i.region]),
        key: i.key,
        thumb: screenscraperThumb(i.key),
      }))
    },
  ])
}
