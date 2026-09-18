import express, { type NextFunction, type Request, type Response } from "express"
import multer from "multer"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { checkCredentials, deleteOtherSessions, getAccount, setPassword, updateProfile, validatePassword, validateProfile } from "./account.js"
import { createAuth, routePath } from "./auth.js"
import { barcodeRows, deleteBarcode, exportBarcodesCsv, learnFromCopy, linkBarcode, listBarcodes, lookupBarcode, normalizeEan } from "./barcodes.js"
import { ScandexError, identifyBarcode, type ScandexClient } from "./scandex.js"
import { createServices, saveService, servicesStatus, testService } from "./services.js"
import { SteamError, ignoreSteamGames, importSteam, steamCandidates, steamStatus, syncSteam, type SteamClient } from "./steam.js"
import { ConflictError, addValue, deleteValue, isListKey, listValues, renameValue } from "./lists.js"
import { allowedOriginsFromEnv, originCheck, securityHeaders } from "./security.js"
import { NotFoundError, PHOTOS_DIR, ValidationError, createCopy, deleteCopy, updateCopy, validateCopy } from "./copies.js"
import { COVERS_DIR } from "./covers.js"
import { schemaVersion, type Db } from "./db.js"
import { createGame, findGame, relinkGame, updateGame } from "./games.js"
import { IgdbError, type IgdbClient } from "./igdb.js"
import { getGame, listLibrary } from "./library.js"
import { MAX_IMAGE_BYTES, addPhoto, deletePhoto, setCover, setCoverFromPhoto, setCoverFromUrl } from "./media.js"
import { downloadMissingCovers } from "./covers.js"
import { CollectionNotEmptyError, importCollection } from "./import-collection.js"
import { stats, summary } from "./stats.js"
import { ImportFormatError, exportCsv, exportJson, importExport } from "./transfer.js"
import type { RommClient } from "./romm.js"
import { analyzeLegacy, commitLegacy, type LegacyDecision } from "./legacy.js"
import {
  addHardwarePhoto,
  addHardwareValuation,
  clearHardwareImage,
  createHardware,
  deleteHardware,
  deleteHardwarePhoto,
  deleteHardwareValuation,
  exportHardwareCsv,
  getHardware,
  listHardware,
  setHardwareImage,
  updateHardware,
} from "./hardware.js"
import { addValuation, deleteValuation } from "./valuations.js"
import { addEvent, addHardwareEvent, currentExits, deleteEvent, deleteHardwareEvent, journal } from "./events.js"
import { canonicalPlatform, listPlatforms, rememberPlatform } from "./catalog.js"
import { gameCoverOptions, hardwareCoverOptions } from "./cover-sources.js"
import { COMMONS_UA, CommonsError, commonsFile, imageOptions, isCommonsMedia, pickAutomatic, type CommonsImage } from "./commons.js"
import { addWish, deleteWish, listWishlist, updateWish } from "./wishlist.js"
import { CatalogSourceError, fetchSourceList, sourceList } from "./fullsetnet.js"
import { availableSets, deleteSet, getSet, linkSetCovers, markRomm, missingCsv, saveSet, setTemplateCsv, setsForGame, wishMissing } from "./sets.js"
import { fileSlug, parseRomsetList } from "./romset.js"
import { coverOneGame, refreshMissingCovers } from "./cover-refresh.js"
import { buildBackup, restoreBackup } from "./backup.js"
import { getPreferences, setPreferences } from "./preferences.js"
import { keepLanguage, languageMiddleware, msg } from "./i18n.js"

// Version : celle du tag (APP_VERSION, posée par la CI), sinon celle du package.json racine
// (image construite par `docker compose up --build`, développement).
const packageVersion = () => {
  try {
    return (JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../package.json"), "utf8")) as { version?: string }).version ?? "dev"
  } catch {
    return "dev"
  }
}
export const APP_VERSION = process.env.APP_VERSION && process.env.APP_VERSION !== "dev" ? process.env.APP_VERSION : packageVersion()

export type AppDeps = {
  igdb?: IgdbClient | null
  romm?: RommClient | null
  scandex?: ScandexClient | null
  steam?: SteamClient | null
  /** Origines admises pour les écritures ; sans liste, le site lui-même (Host / X-Forwarded-Host). */
  allowedOrigins?: string[]
  /** Tests seulement : API ouverte sans compte ni session, et sans contrôle d'origine faute de liste. */
  openAccess?: boolean
  fetchImpl?: typeof fetch
}

const IGDB_IMAGES = "https://images.igdb.com/"
/** Hôtes des images SteamGridDB : le serveur ne télécharge que depuis leur CDN. */
const STEAMGRID_IMAGES = ["https://cdn2.steamgriddb.com/", "https://cdn.steamgriddb.com/"]

export function createApp(db: Db, dataDir: string, deps: AppDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } })
  // Multer rend la main depuis la lecture du flux : la suite repart dans la langue de la requête.
  const upload = { single: (field: string) => keepLanguage(multerUpload.single(field)) }
  // Clients IGDB, Steam, ScanDex et RomM : relus à chaque usage, la configuration change dans l'appli.
  const services = createServices(db, { igdb: deps.igdb, romm: deps.romm, scandex: deps.scandex, steam: deps.steam }, fetchImpl)

  const app = express()
  app.disable("x-powered-by")
  // Langue des messages (Accept-Language), posée avant tout ce qui peut répondre une erreur.
  app.use(languageMiddleware)
  // Seul un proxy déclaré (TRUST_PROXY) est cru sur l'IP du client et le protocole : un
  // X-Forwarded-For envoyé par n'importe qui d'autre ne doit pas contourner la limite d'essais.
  const trustProxy = process.env.TRUST_PROXY?.trim()
  if (trustProxy) app.set("trust proxy", trustProxy.split(",").map((a) => a.trim()))
  app.use(securityHeaders)
  const allowed = deps.allowedOrigins ?? allowedOriginsFromEnv()
  app.use(originCheck(allowed, { disabled: Boolean(deps.openAccess) && !allowed.length }))
  const auth = createAuth(db, { openAccess: deps.openAccess })
  app.use(auth.requireAuth)
  // Corps JSON lus après la garde, 100 ko au plus ; 10 Mo pour les imports (un export complet,
  // la validation d'un import de l'ancienne appli qui renvoie toutes ses lignes).
  const smallJson = express.json({ limit: "100kb" })
  const bigJson = express.json({ limit: "10mb" })
  app.use((req, res, next) => (routePath(req).startsWith("/api/import") ? bigJson : smallJson)(req, res, next))
  // Le lecteur JSON rend la main hors du contexte de la requête : on y rentre de nouveau.
  app.use(languageMiddleware)

  app.post("/api/setup", auth.setup)
  app.post("/api/auth/login", auth.login)
  app.post("/api/auth/logout", auth.logout)
  app.get("/api/auth/me", auth.handleMe)

  // --- Compte ---
  app.get("/api/account", (_req, res) => {
    const a = getAccount(db)
    if (!a) throw new NotFoundError(msg("app.noAccount"))
    res.json(a)
  })
  app.put("/api/account", (req, res) => {
    updateProfile(db, validateProfile(req.body ?? {}))
    res.json({ ok: true })
  })
  // Nouveau mot de passe : l'actuel est exigé ; les autres appareils sont déconnectés.
  app.put("/api/account/password", async (req, res) => {
    if (!(await checkCredentials(db, getAccount(db)?.username, req.body?.current))) throw new ValidationError(msg("app.wrongCurrentPassword"))
    await setPassword(db, validatePassword(req.body?.password))
    const token = auth.sessionToken(req)
    if (token) deleteOtherSessions(db, token)
    res.json({ ok: true })
  })
  app.post("/api/account/logout-others", (req, res) => {
    const token = auth.sessionToken(req)
    if (token) deleteOtherSessions(db, token)
    res.json({ ok: true })
  })

  // --- Steam : lecture au bouton, jeux absents ajoutés sur choix ---
  app.get("/api/steam", (_req, res) => res.json(steamStatus(db, services.steam() !== null)))
  app.post("/api/steam/sync", async (_req, res) => {
    const steam = services.steam()
    if (!steam) throw new SteamError(msg("app.steamNotConfigured"))
    res.json(await syncSteam(db, steam, services.igdb()))
  })
  app.get("/api/steam/candidates", (_req, res) => res.json({ items: steamCandidates(db) }))
  // Écarter des jeux de l'écran de choix : ils ne reviendront pas à la prochaine synchronisation.
  app.post("/api/steam/ignore", (req, res) => {
    res.json(ignoreSteamGames(db, req.body?.appids, req.body?.ignored !== false))
  })
  app.post("/api/steam/import", async (req, res) => {
    res.status(201).json(await importSteam(db, dataDir, services.igdb(), req.body?.appids, fetchImpl))
  })

  // Une photo d'exemplaire devient la jaquette du jeu (photo de sa propre boîte).
  app.post("/api/photos/:id/cover", (req, res) => res.json(setCoverFromPhoto(db, dataDir, id(req))))

  // Scan des jaquettes, au bouton : chaque jeu sans image la cherche chez les sources branchées.
  app.post("/api/covers/refresh", async (_req, res) => {
    if (!services.igdb() && !services.screenscraper() && !services.steamgriddb()) throw new IgdbError(msg("covers.noSource"))
    res.json(await refreshMissingCovers(db, dataDir, services, fetchImpl))
  })

  // --- Mode Fullset : listes de référence par console ---
  app.get("/api/sets", (_req, res) => res.json({ lists: availableSets(db) }))
  // Modèle de fichier pour composer sa propre liste. Avant « /api/sets/:slug », qui l'avalerait.
  app.get("/api/sets/modele.csv", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="modele-liste.csv"')
    res.send(setTemplateCsv())
  })
  app.get("/api/sets/:slug", (req, res) => {
    const found = getSet(db, String(req.params.slug))
    if (!found) throw new NotFoundError(msg("sets.unknownList"))
    res.json(found)
  })
  // Récupération chez la source, sur demande seulement : jamais de tâche de fond.
  app.post("/api/sets/:slug/refresh", async (req, res) => {
    const list = sourceList(req.params.slug)
    if (!list) throw new NotFoundError(msg("sets.unknownList"))
    try {
      res.json({ set: saveSet(db, list, await fetchSourceList(list, fetchImpl)) })
    } catch (err) {
      if (!(err instanceof CatalogSourceError)) throw err
      res.status(502).json({ error: err.message })
    }
  })
  // ?retry=1 : les titres restés sans fiche repassent une fois.
  app.post("/api/sets/:slug/covers", async (req, res) => {
    const igdb = services.igdb()
    if (!igdb) throw new IgdbError(msg("sets.igdbNotConfigured"))
    const result = await linkSetCovers(db, String(req.params.slug), igdb, 40, Boolean(req.query.retry))
    if (!result) throw new NotFoundError(msg("sets.unknownList"))
    res.json(result)
  })
  app.post("/api/sets/:slug/romm", async (req, res) => {
    const romm = services.romm()
    if (!romm) throw new ValidationError(msg("sets.rommNotConfigured"))
    const result = await markRomm(db, String(req.params.slug), romm)
    if (!result) throw new NotFoundError(msg("sets.unknownList"))
    res.json(result)
  })
  // Liste venue d'un fichier (un `.nfo` de pack de ROM, ou un titre par ligne).
  app.post("/api/sets/import", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("sets.needFile"))
    const name = String(req.body?.name ?? "").trim()
    const platform = String(req.body?.platform ?? "").trim()
    if (!name) throw new ValidationError(msg("sets.needName"))
    if (!platform) throw new ValidationError(msg("sets.needPlatform"))
    const { items: parsed, skipped } = parseRomsetList(req.file.buffer.toString("utf8"))
    if (!parsed.length) throw new ValidationError(msg("sets.noTitles"))
    // Console absente du catalogue : elle y entre, comme à la saisie d'un jeu ou d'un matériel.
    const chosen = canonicalPlatform(platform)
    rememberPlatform(db, chosen)
    const list = { slug: fileSlug(name), name, platform: chosen, region: null }
    const items = parsed.map((item, i) => ({ position: i + 1, title: item.title, url: null, price_cents: item.price_cents }))
    res.status(201).json({ set: saveSet(db, list, items, msg("sets.fileSource")), skipped })
  })
  // Tous les manquants d'un coup : dans les souhaits, ou dans un CSV à emporter en bourse.
  app.post("/api/sets/:slug/wishlist", (req, res) => {
    const result = wishMissing(db, String(req.params.slug))
    if (!result) throw new NotFoundError(msg("sets.unknownList"))
    res.status(201).json(result)
  })
  app.get("/api/sets/:slug/manquants.csv", (req, res) => {
    const slug = String(req.params.slug)
    const csv = missingCsv(db, slug)
    if (csv === null) throw new NotFoundError(msg("sets.unknownList"))
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="manquants-${slug}.csv"`)
    res.send(csv)
  })
  app.delete("/api/sets/:slug", (req, res) => {
    if (!deleteSet(db, String(req.params.slug))) throw new NotFoundError(msg("sets.unknownList"))
    res.json({ ok: true })
  })

  // --- Codes-barres ---
  // ?details=1 : la liste à gérer (jeu, console, date) ; sans, la forme compacte gardée hors ligne.
  app.get("/api/barcodes", (req, res) => res.json(req.query.details ? { rows: barcodeRows(db) } : { codes: listBarcodes(db) }))
  app.delete("/api/barcodes/:ean", (req, res) => {
    deleteBarcode(db, req.params.ean)
    res.json({ ok: true })
  })
  app.get("/api/barcodes/:ean", (req, res) => res.json(lookupBarcode(db, req.params.ean)))
  // Code inconnu : ScanDex propose un jeu ; on dit si le jeu est déjà là (même fiche IGDB), sur quelle console.
  app.get("/api/barcodes/:ean/identify", async (req, res) => {
    const ean = normalizeEan(req.params.ean)
    let suggestion = null
    try {
      suggestion = await identifyBarcode(db, services.scandex(), ean)
    } catch (err) {
      if (!(err instanceof ScandexError)) throw err
      console.warn(err.message)
    }
    const owned = suggestion
      ? (db.prepare("SELECT id, platform FROM games WHERE igdb_id = ? ORDER BY platform = ? DESC, id").all(suggestion.igdb_id, suggestion.platform) as Array<{ id: number; platform: string }>)
      : []
    // Ce que les listes de référence disent de ce jeu : « il te manque pour le full set… ».
    const sets = suggestion ? setsForGame(db, { igdb_id: suggestion.igdb_id, title: suggestion.name, platform: suggestion.platform }) : []
    res.json({ ean, configured: services.scandex() !== null, suggestion, owned, sets })
  })
  app.post("/api/barcodes", (req, res) => {
    res.json(linkBarcode(db, req.body?.ean, req.body?.game_id, req.body?.edition))
  })

  // --- Listes de valeurs ---
  const listKey = (req: Request) => {
    const k = String(req.params.list)
    if (!isListKey(k)) throw new NotFoundError(msg("app.unknownList"))
    return k
  }
  app.get("/api/lists", (_req, res) => res.json(listValues(db)))
  app.post("/api/lists/:list", (req, res) => {
    res.status(201).json(addValue(db, listKey(req), req.body?.value))
  })
  app.put("/api/lists/:list/:id", (req, res) => {
    res.json(renameValue(db, listKey(req), id(req), req.body?.value))
  })
  app.delete("/api/lists/:list/:id", (req, res) => {
    deleteValue(db, listKey(req), id(req))
    res.json({ ok: true })
  })

  // --- Affichage par défaut ---
  app.get("/api/preferences", (_req, res) => res.json(getPreferences(db)))
  app.put("/api/preferences", (req, res) => res.json(setPreferences(db, req.body)))

  // --- Services externes : état (secrets masqués), enregistrement, essai réel ---
  app.get("/api/services", (_req, res) => res.json(servicesStatus(db)))
  app.put("/api/services/:name", (req, res) => {
    saveService(db, String(req.params.name), req.body ?? {})
    res.json(servicesStatus(db))
  })
  app.post("/api/services/:name/test", async (req, res) => res.json(await testService(services, String(req.params.name))))

  // La sonde lit la base : un process vivant sur une base illisible doit tomber en 503,
  // pas rester vert dans la supervision. Le détail de l'erreur reste dans les journaux.
  app.get("/api/health", (_req, res) => {
    try {
      db.prepare("SELECT value FROM meta WHERE key = 'created_at'").get()
      res.json({
        ok: true,
        version: APP_VERSION,
        schema: schemaVersion(db),
        igdb: services.igdb() !== null,
        romm: services.romm() !== null,
        time: new Date().toLocaleString("fr-FR", { timeZone: process.env.TZ || undefined }),
      })
    } catch (err) {
      console.error(`Sonde : base illisible (${(err as Error).message})`)
      res.status(503).json({ ok: false })
    }
  })

  const id = (req: Request, name = "id") => {
    const n = Number(req.params[name])
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError(msg("common.invalidId"))
    return n
  }
  const needIgdb = () => {
    const igdb = services.igdb()
    if (!igdb) throw new IgdbError(msg("app.igdbNotConfigured"))
    return igdb
  }

  app.get("/api/stats/summary", (_req, res) => res.json(summary(db)))
  app.get("/api/stats", (_req, res) => res.json(stats(db)))

  // --- Export / import ---
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: process.env.TZ || undefined })
  app.get("/api/export.csv", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="fullset-${today()}.csv"`)
    res.send(exportCsv(db))
  })
  app.get("/api/export.json", (_req, res) => {
    res.setHeader("Content-Disposition", `attachment; filename="fullset-${today()}.json"`)
    res.type("application/json").send(JSON.stringify(exportJson(db), null, 2))
  })

  // Sauvegarde complète : l'export JSON et les images dans une archive à ranger quelque part.
  app.get("/api/export.zip", (_req, res) => {
    res.setHeader("Content-Type", "application/zip")
    res.setHeader("Content-Disposition", `attachment; filename="fullset-${today()}.zip"`)
    res.send(buildBackup(db, dataDir))
  })
  // Restauration : remplace la collection actuelle, d'où la confirmation explicite.
  app.post("/api/restore", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noFile"))
    if (String(req.body?.confirm ?? "") !== "remplacer") throw new ValidationError(msg("transfer.restoreNeedsConfirm"))
    res.json(restoreBackup(db, dataDir, req.file.buffer))
  })

  // Accepte un export Fullset (CSV ou JSON) ou le collection.json de départ (un tableau).
  app.post("/api/import", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noFile"))
    const content = req.file.buffer.toString("utf8")
    const body = content.replace(/^﻿/, "").trimStart()
    let report: { games: number; copies: number; totalCents: number }
    if (body.startsWith("[")) {
      let entries: unknown
      try {
        entries = JSON.parse(body)
      } catch {
        throw new ImportFormatError(msg("common.unreadableJson"))
      }
      report = importCollection(db, entries as Parameters<typeof importCollection>[1])
    } else {
      report = importExport(db, content)
    }
    // Les jaquettes se téléchargent ensuite, sans faire attendre la réponse.
    downloadMissingCovers(db, dataDir, fetchImpl).then(
      (r) => r.failed.length && console.warn(`Import : ${r.failed.length} jaquettes en échec`),
      () => {},
    )
    res.status(201).json({ games: report.games, copies: report.copies, totalCents: report.totalCents })
  })
  app.get("/api/library", (_req, res) => res.json({ games: listLibrary(db) }))

  // --- IGDB ---
  app.get("/api/igdb/search", async (req, res) => {
    res.json({ results: await needIgdb().search(String(req.query.q ?? "")) })
  })

  // --- Jeux ---
  app.get("/api/games/:id", async (req, res) => {
    const game = getGame(db, id(req))
    if (!game) throw new NotFoundError(msg("common.gameNotFound"))
    const romm = services.romm()
    if (romm && game.igdb_id !== null) {
      try {
        game.romm = await romm.romFor(game.igdb_id)
      } catch {
        game.romm = null // RomM en panne ne doit pas empêcher d'ouvrir la fiche.
      }
    }
    res.json(game)
  })

  // Un jeu naît toujours avec son premier exemplaire : pas de jeu orphelin si la saisie est abandonnée.
  app.post("/api/games", async (req, res) => {
    const { igdb_id, platform, title, copy } = req.body ?? {}
    const igdbId = igdb_id === null || igdb_id === undefined ? null : Number(igdb_id)
    if (igdbId !== null && !Number.isInteger(igdbId)) throw new ValidationError(msg("common.invalidIgdbId"))
    const p = canonicalPlatform(String(platform ?? ""))
    if (!p) throw new ValidationError(msg("common.platformRequired"))

    let gameId = igdbId === null ? null : findGame(db, igdbId, p)
    const existed = gameId !== null
    if (gameId === null) {
      const meta = igdbId === null ? { title: String(title ?? "") } : await needIgdb().game(igdbId, p)
      validateCopy(copy ?? {}, meta.title || "")
      gameId = await createGame(db, dataDir, p, meta, fetchImpl)
    }
    const copyId = createCopy(db, gameId, copy ?? {})
    learnFromCopy(db, copyId)
    res.status(201).json({ gameId, copyId, existed })

    // Scan à l'ajout : un jeu arrivé sans jaquette (pas de fiche IGDB, ou IGDB n'en a pas) la
    // cherche aussitôt chez les autres sources, sans faire attendre la réponse.
    const jeu = db.prepare("SELECT id, igdb_id, platform, title FROM games WHERE id = ? AND cover_file IS NULL").get(gameId) as
      | { id: number; igdb_id: number | null; platform: string; title: string }
      | undefined
    if (jeu) {
      coverOneGame(db, dataDir, services, jeu, fetchImpl).catch((err) =>
        console.warn(`Jaquette non trouvée pour « ${jeu.title} » : ${(err as Error).message}`),
      )
    }
  })

  app.put("/api/games/:id", (req, res) => {
    updateGame(db, id(req), req.body ?? {})
    res.json(getGame(db, id(req)))
  })

  app.post("/api/games/:id/igdb", async (req, res) => {
    const gameId = id(req)
    const game = getGame(db, gameId)
    if (!game) throw new NotFoundError(msg("common.gameNotFound"))
    const igdbId = Number(req.body?.igdb_id)
    if (!Number.isInteger(igdbId) || igdbId <= 0) throw new ValidationError(msg("common.invalidIgdbId"))
    await relinkGame(db, dataDir, gameId, await needIgdb().game(igdbId, game.platform), fetchImpl)
    res.json(getGame(db, gameId))
  })

  // Les jaquettes proposées par toutes les sources branchées : à toi de choisir.
  app.get("/api/games/:id/cover-options", async (req, res) => {
    const game = getGame(db, id(req))
    if (!game) throw new NotFoundError(msg("common.gameNotFound"))
    res.json({ covers: await gameCoverOptions(services, game) })
  })

  // Vignette ScreenScraper : son adresse porte des identifiants, le serveur va la chercher.
  app.get("/api/screenscraper/media", async (req, res) => {
    const client = services.screenscraper()
    if (!client) throw new ValidationError(msg("screenscraper.notConfigured"))
    const width = Math.min(Math.max(Number(req.query.w) || 300, 40), 1000)
    const { bytes, mime } = await client.media(String(req.query.key ?? ""), width)
    res.setHeader("Content-Type", mime)
    res.setHeader("Cache-Control", "private, max-age=86400")
    res.send(bytes)
  })

  app.post("/api/games/:id/cover", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noImage"))
    res.json({ cover: setCover(db, dataDir, id(req), req.file.buffer, req.file.mimetype, "photo") })
  })

  app.post("/api/games/:id/cover/url", async (req, res) => {
    const url = String(req.body?.url ?? "")
    // Seules les images IGDB : le serveur ne va pas chercher n'importe quelle adresse pour le compte du client.
    if (!url.startsWith(IGDB_IMAGES)) throw new ValidationError(msg("common.igdbCoversOnly"))
    res.json({ cover: await setCoverFromUrl(db, dataDir, id(req), url, "igdb", fetchImpl) })
  })

  /**
   * Pose une jaquette choisie parmi les propositions. Chaque source a sa façon : une adresse
   * pour IGDB et SteamGridDB (dont l'hôte est vérifié, le serveur ne va pas chercher n'importe
   * quelle adresse), un repère pour ScreenScraper, dont les adresses portent des mots de passe.
   */
  app.post("/api/games/:id/cover/source", async (req, res) => {
    const gameId = id(req)
    const source = String(req.body?.source ?? "")
    if (source === "screenscraper") {
      const client = services.screenscraper()
      if (!client) throw new ValidationError(msg("screenscraper.notConfigured"))
      const { bytes, mime } = await client.media(String(req.body?.key ?? ""), 800)
      res.json({ cover: setCover(db, dataDir, gameId, bytes, mime, "screenscraper") })
      return
    }
    const url = String(req.body?.url ?? "")
    if (source === "igdb" && !url.startsWith(IGDB_IMAGES)) throw new ValidationError(msg("common.igdbCoversOnly"))
    if (source === "steamgriddb" && !STEAMGRID_IMAGES.some((host) => url.startsWith(host))) throw new ValidationError(msg("common.steamgridCoversOnly"))
    if (source !== "igdb" && source !== "steamgriddb") throw new ValidationError(msg("common.unknownCoverSource"))
    res.json({ cover: await setCoverFromUrl(db, dataDir, gameId, url, source, fetchImpl) })
  })

  // --- Exemplaires ---
  app.post("/api/games/:id/copies", (req, res) => {
    const copyId = createCopy(db, id(req), req.body ?? {})
    learnFromCopy(db, copyId)
    res.status(201).json({ copyId })
  })

  app.put("/api/copies/:id", (req, res) => {
    const gameId = updateCopy(db, id(req), req.body ?? {})
    learnFromCopy(db, id(req))
    res.json({ gameId })
  })

  app.delete("/api/copies/:id", (req, res) => {
    res.json(deleteCopy(db, dataDir, id(req)))
  })

  // --- Vie d'un exemplaire : vendu, donné, prêté, en panne… Une sortie le retire de la bibliothèque ---
  app.post("/api/copies/:id/events", (req, res) => {
    res.status(201).json({ event: addEvent(db, id(req), req.body ?? {}) })
  })
  app.delete("/api/events/:id", (req, res) => res.json(deleteEvent(db, id(req))))
  app.post("/api/hardware/:id/events", (req, res) => {
    res.status(201).json({ event: addHardwareEvent(db, id(req), req.body ?? {}) })
  })
  app.delete("/api/hardware-events/:id", (req, res) => res.json(deleteHardwareEvent(db, id(req))))
  app.get("/api/journal", (req, res) => res.json({ entries: journal(db, Number(req.query.limit) || 200) }))
  // Ce qui est sorti et n'est pas revenu : prêts en cours, ventes, pannes.
  app.get("/api/exits", (_req, res) => res.json({ entries: currentExits(db) }))

  app.post("/api/copies/:id/photos", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noImage"))
    res.status(201).json(addPhoto(db, dataDir, id(req), req.file.buffer, req.file.mimetype))
  })

  // --- Import de l'ancienne application : analyse (rien n'est écrit), puis import des lignes retenues ---
  app.post("/api/import/legacy/analyze", upload.single("file"), async (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noFile"))
    const igdb = services.igdb()
    res.json({ igdb: igdb !== null, rows: await analyzeLegacy(db, igdb, req.file.buffer.toString("utf8")) })
  })
  app.post("/api/import/legacy/commit", async (req, res) => {
    const rows = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError(msg("app.noRowsToImport"))
    res.status(201).json(await commitLegacy(db, dataDir, services.igdb(), rows as LegacyDecision[], fetchImpl))
  })

  // --- Matériel : consoles, manettes, accessoires ---
  app.get("/api/hardware", (_req, res) => res.json({ items: listHardware(db) }))
  app.get("/api/platforms", (_req, res) => res.json({ platforms: listPlatforms(db) }))
  // Télécharge la version réduite d'une image Commons ; seuls les serveurs d'images de Wikimedia sont acceptés.
  const downloadCommons = async (image: CommonsImage) => {
    if (!isCommonsMedia(image.url)) throw new CommonsError(msg("commons.unexpectedUrl"))
    const res = await fetchImpl(image.url, { headers: { "User-Agent": COMMONS_UA }, signal: AbortSignal.timeout(20_000) })
    const mime = res.headers.get("content-type")?.split(";")[0] ?? ""
    if (!res.ok || !["image/jpeg", "image/png"].includes(mime)) throw new CommonsError(msg("commons.unreadable", { status: res.status }))
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_IMAGE_BYTES) throw new CommonsError(msg("commons.tooLarge"))
    const credit = [image.artist, image.license].filter(Boolean).join(", ") || null
    return { bytes, mime, credit, page: image.page }
  }
  const applyImage = async (id: number, image: CommonsImage) => {
    const { bytes, mime, credit, page } = await downloadCommons(image)
    return setHardwareImage(db, dataDir, id, bytes, mime, credit, page)
  }

  app.post("/api/hardware", (req, res) => {
    const hwId = createHardware(db, req.body ?? {})
    res.status(201).json({ id: hwId })
    // Sans photo, une image par défaut est cherchée aussitôt, sans faire attendre la réponse.
    const item = getHardware(db, hwId)
    imageOptions(item, fetchImpl)
      .then(async ({ options }) => {
        const pick = pickAutomatic(item, options)
        if (pick) return applyImage(hwId, pick)
        // Commons n'a rien de cette console : les autres sources prennent le relais.
        const [autre] = await hardwareCoverOptions(services, String(item.platform ?? ""))
        const client = services.screenscraper()
        if (!autre?.key || !client) return undefined
        const { bytes, mime } = await client.media(autre.key, 800)
        return setHardwareImage(db, dataDir, hwId, bytes, mime, "ScreenScraper", null)
      })
      .catch((err) => console.warn(`Image par défaut non trouvée pour le matériel ${hwId} : ${(err as Error).message}`))
  })
  app.get("/api/hardware/:id/image-options", async (req, res) => {
    const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim().slice(0, 120) : undefined
    const item = getHardware(db, id(req))
    const commons = await imageOptions(item, fetchImpl, q)
    // Commons d'abord (libre, avec son crédit), puis ce que les autres sources ont de cette console.
    res.json({ ...commons, others: await hardwareCoverOptions(services, String(item.platform ?? "")) })
  })
  app.post("/api/hardware/:id/image", async (req, res) => {
    const hwId = id(req)
    getHardware(db, hwId)
    // Image choisie chez ScreenScraper : elle arrive par son repère, jamais par son adresse.
    const key = typeof req.body?.key === "string" ? req.body.key : null
    if (key) {
      const client = services.screenscraper()
      if (!client) throw new ValidationError(msg("screenscraper.notConfigured"))
      const { bytes, mime } = await client.media(key, 800)
      res.json({ image: setHardwareImage(db, dataDir, hwId, bytes, mime, "ScreenScraper", null) })
      return
    }
    res.json({ image: await applyImage(hwId, await commonsFile(String(req.body?.title ?? ""), fetchImpl)) })
  })
  app.delete("/api/hardware/:id/image", (req, res) => {
    clearHardwareImage(db, dataDir, id(req))
    res.json({ ok: true })
  })
  app.get("/api/hardware/:id", (req, res) => res.json(getHardware(db, id(req))))
  app.put("/api/hardware/:id", (req, res) => {
    updateHardware(db, id(req), req.body ?? {})
    res.json(getHardware(db, id(req)))
  })
  app.delete("/api/hardware/:id", (req, res) => {
    deleteHardware(db, dataDir, id(req))
    res.json({ ok: true })
  })
  app.post("/api/hardware/:id/photos", upload.single("file"), (req, res) => {
    if (!req.file) throw new ValidationError(msg("common.noImage"))
    res.status(201).json(addHardwarePhoto(db, dataDir, id(req), req.file.buffer, req.file.mimetype))
  })
  app.delete("/api/hardware-photos/:id", (req, res) => {
    deleteHardwarePhoto(db, dataDir, id(req))
    res.json({ ok: true })
  })
  app.post("/api/hardware/:id/valuations", (req, res) => {
    res.status(201).json({ id: addHardwareValuation(db, id(req), req.body ?? {}) })
  })
  app.delete("/api/hardware-valuations/:id", (req, res) => {
    deleteHardwareValuation(db, id(req))
    res.json({ ok: true })
  })
  app.get("/api/export-codes.csv", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="fullset-codes-barres-${today()}.csv"`)
    res.send(exportBarcodesCsv(db))
  })
  app.get("/api/export-materiel.csv", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="fullset-materiel-${today()}.csv"`)
    res.send(exportHardwareCsv(db))
  })

  // --- Valeur estimée ---
  app.post("/api/copies/:id/valuations", (req, res) => {
    res.status(201).json({ id: addValuation(db, id(req), req.body ?? {}) })
  })
  app.delete("/api/valuations/:id", (req, res) => {
    deleteValuation(db, id(req))
    res.json({ ok: true })
  })

  // --- Liste de souhaits ---
  app.get("/api/wishlist", (_req, res) => res.json({ items: listWishlist(db) }))
  app.post("/api/wishlist", (req, res) => {
    res.status(201).json({ id: addWish(db, req.body ?? {}) })
  })
  app.put("/api/wishlist/:id", (req, res) => {
    updateWish(db, id(req), req.body ?? {})
    res.json({ ok: true })
  })
  app.delete("/api/wishlist/:id", (req, res) => {
    deleteWish(db, id(req))
    res.json({ ok: true })
  })

  app.delete("/api/photos/:id", (req, res) => {
    deletePhoto(db, dataDir, id(req))
    res.json({ ok: true })
  })

  app.all(/^\/api\/.*/, (_req, res) => res.status(404).json({ error: msg("common.unknownRoute") }))

  // Jaquettes officielles publiques ; photos des exemplaires derrière la session (requireAuth).
  app.use("/covers", express.static(path.join(dataDir, COVERS_DIR), { maxAge: "7d", fallthrough: false }))
  app.use("/photos", express.static(path.join(dataDir, PHOTOS_DIR), { maxAge: "7d", fallthrough: false }))

  const webDist = path.resolve(import.meta.dirname, "../../web/dist")
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }))
    app.get(/.*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")))
  }

  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError || err instanceof ImportFormatError) return res.status(400).json({ error: err.message })
    if (err instanceof CollectionNotEmptyError || err instanceof ConflictError) return res.status(409).json({ error: err.message })
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message })
    if (err instanceof CommonsError && err.invalid) return res.status(400).json({ error: err.message })
    if (err instanceof IgdbError || err instanceof CommonsError || err instanceof SteamError) return res.status(502).json({ error: err.message })
    if (err instanceof multer.MulterError) {
      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? msg("common.imageTooLarge") : err.message })
    }
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
    console.error(err)
    res.status(500).json({ error: msg("common.internalError") })
  })

  return app
}
