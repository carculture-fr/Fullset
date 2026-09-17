import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import path from "node:path"

import { CATALOG_2026_09 } from "./catalog-2026-09.js"

export type Db = Database.Database

export const DB_FILE = "fullset.db"

// Éditions proposées d'office par la migration 3 (figées comme elle) : rééditions économiques
// par constructeur et par région, puis éditions enrichies. Les suivantes s'ajoutent par « Autre ».
const EDITIONS_2026_09 = [
  "Standard",
  "Platinum",
  "Essentials",
  "Classics",
  "Le Choix des Joueurs",
  "Player's Choice",
  "Nintendo Selects",
  "PlayStation Hits",
  "Greatest Hits",
  "The Best",
  "Réédition",
  "Collector",
  "Édition limitée",
  "Édition spéciale",
  "Deluxe",
  "Gold",
  "Premium",
  "Ultimate",
  "Complète",
  "Game of the Year (GOTY)",
  "Définitive",
  "Director's Cut",
  "Day One",
  "Édition de lancement",
  "Anniversaire",
  "Remastered",
  "Steelbook",
  "Big Box",
  "Signature",
  "Bundle",
  "Compilation",
  "Promo (Not for resale)",
  "Démo",
]

// Migration 4 : éditions de jeux complémentaires, puis modèles et couleurs du matériel.
const MORE_EDITIONS_2026_09 = [
  "Édition légendaire",
  "Prestige",
  "Double pack",
  "Classics HD",
  "Best Seller",
  "Ubisoft Exclusive",
  "EA Classics",
  "Big Hits",
]

const HW_EDITIONS_2026_09 = [
  "Standard",
  "Modèle d'origine (Fat)",
  "Slim",
  "Super Slim",
  "Lite",
  "Mini",
  "XL",
  "Pro",
  "OLED",
  "Elite",
  "Édition limitée",
  "Édition spéciale",
  "Collector",
  "Bundle (pack avec jeux)",
  "Édition de lancement",
  "Reconditionnée",
  "Kit de développement (DevKit)",
  "Kit de test (TestKit)",
]

const HW_COLORS_2026_09 = ["Noir", "Blanc", "Gris", "Argent", "Rouge", "Bleu", "Violet", "Orange", "Rose", "Vert", "Jaune", "Or", "Transparent"]

// Une migration par version de schéma, jamais modifiée une fois livrée :
// PRAGMA user_version porte le numéro de la dernière appliquée.
const MIGRATIONS: string[] = [
  `CREATE TABLE meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   INSERT INTO meta (key, value) VALUES ('created_at', datetime('now'));`,

  // Le jeu (l'œuvre sur une plateforme, décrite par IGDB) et l'exemplaire possédé.
  // Montants en centimes : une somme de flottants ne retombe pas juste.
  `CREATE TABLE games (
     id INTEGER PRIMARY KEY,
     igdb_id INTEGER,
     platform TEXT NOT NULL,
     title TEXT NOT NULL,
     summary TEXT,
     developer TEXT,
     publisher TEXT,
     release_date TEXT,
     genres TEXT,
     game_modes TEXT,
     perspective TEXT,
     series TEXT,
     pegi TEXT,
     igdb_rating INTEGER,
     igdb_url TEXT,
     cover_url TEXT,
     cover_file TEXT,
     cover_source TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (igdb_id, platform)
   );

   CREATE TABLE copies (
     id INTEGER PRIMARY KEY,
     game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
     title_as_entered TEXT NOT NULL,
     support TEXT NOT NULL,
     region TEXT,
     edition TEXT,
     content TEXT,
     condition_game TEXT,
     condition_box TEXT,
     condition_manual TEXT,
     play_status TEXT,
     goal TEXT,
     quantity INTEGER NOT NULL DEFAULT 1,
     price_cents INTEGER,
     purchase_date TEXT,
     purchase_place TEXT,
     completion_date TEXT,
     play_time_hours REAL,
     completion_pct INTEGER,
     rating INTEGER,
     tags TEXT,
     barcode TEXT,
     comment TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_copies_game ON copies(game_id);

   CREATE TABLE copy_photos (
     id INTEGER PRIMARY KEY,
     copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
     file TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE valuations (
     id INTEGER PRIMARY KEY,
     copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
     amount_cents INTEGER NOT NULL,
     valued_on TEXT NOT NULL,
     source TEXT NOT NULL DEFAULT 'manuel',
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_valuations_copy ON valuations(copy_id, valued_on);

   CREATE TABLE wishlist (
     id INTEGER PRIMARY KEY,
     igdb_id INTEGER,
     platform TEXT,
     title TEXT NOT NULL,
     cover_url TEXT,
     target_price_cents INTEGER,
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Compte unique en base (le mot de passe se change dans l'application), jetons de
  // réinitialisation, et listes de valeurs gérables (lieux d'achat, éditions, tags).
  `CREATE TABLE account (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     username TEXT NOT NULL,
     display_name TEXT,
     email TEXT,
     password_hash TEXT NOT NULL,
     session_version INTEGER NOT NULL DEFAULT 1,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE password_resets (
     token_hash TEXT PRIMARY KEY,
     expires_at INTEGER NOT NULL,
     used INTEGER NOT NULL DEFAULT 0
   );

   CREATE TABLE list_values (
     id INTEGER PRIMARY KEY,
     list TEXT NOT NULL,
     value TEXT NOT NULL,
     sort_order INTEGER,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (list, value COLLATE NOCASE)
   );

   INSERT INTO list_values (list, value, sort_order) VALUES ${EDITIONS_2026_09.map((e, i) => `('edition', '${e.replace(/'/g, "''")}', ${i + 1})`).join(", ")};`,

  // Matériel (consoles, manettes, accessoires), ses photos et ses estimations ; éditions et
  // couleurs proposées d'office ; éditions de jeux complétées.
  `CREATE TABLE hardware (
     id INTEGER PRIMARY KEY,
     kind TEXT NOT NULL,
     platform TEXT NOT NULL,
     model TEXT,
     edition TEXT,
     color TEXT,
     region TEXT,
     content TEXT,
     condition_item TEXT,
     condition_box TEXT,
     condition_manual TEXT,
     working TEXT,
     price_cents INTEGER,
     purchase_date TEXT,
     purchase_place TEXT,
     serial_number TEXT,
     comment TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE hardware_photos (
     id INTEGER PRIMARY KEY,
     hardware_id INTEGER NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
     file TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE hardware_valuations (
     id INTEGER PRIMARY KEY,
     hardware_id INTEGER NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
     amount_cents INTEGER NOT NULL,
     valued_on TEXT NOT NULL,
     source TEXT NOT NULL DEFAULT 'manuel',
     note TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_hardware_valuations ON hardware_valuations(hardware_id, valued_on);

   INSERT OR IGNORE INTO list_values (list, value, sort_order) VALUES
     ${[
       ...HW_EDITIONS_2026_09.map((e, i) => `('hw_edition', '${e.replace(/'/g, "''")}', ${i + 1})`),
       ...HW_COLORS_2026_09.map((e, i) => `('hw_color', '${e.replace(/'/g, "''")}', ${i + 1})`),
       ...MORE_EDITIONS_2026_09.map((e, i) => `('edition', '${e.replace(/'/g, "''")}', ${EDITIONS_2026_09.length + i + 1})`),
     ].join(",\n     ")};`,

  // Codes-barres appris au premier scan, et jetons de connexion de secours (commande dans le
  // conteneur) depuis que la connexion passe par un lien envoyé par GoTrue.
  `CREATE TABLE barcodes (
     ean TEXT PRIMARY KEY,
     game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
     edition TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE login_tokens (
     token_hash TEXT PRIMARY KEY,
     expires_at INTEGER NOT NULL,
     used INTEGER NOT NULL DEFAULT 0
   );`,

  // Image par défaut du matériel (Wikimedia Commons), montrée tant qu'aucune photo n'est prise.
  // Le fichier vit dans covers/ comme les jaquettes ; crédit et page source pour la licence.
  `ALTER TABLE hardware ADD COLUMN image_file TEXT;
   ALTER TABLE hardware ADD COLUMN image_credit TEXT;
   ALTER TABLE hardware ADD COLUMN image_page TEXT;`,

  // Catalogue des consoles (RomM + variantes IGDB) : la console et son modèle se choisissent en
  // pastilles. Les noms suivent RomM / IGDB : « GameCube » devient « Nintendo GameCube » partout.
  `CREATE TABLE platforms (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE,
     kind TEXT,
     family TEXT,
     generation INTEGER,
     igdb_id INTEGER,
     romm_slug TEXT,
     position INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE platform_models (
     id INTEGER PRIMARY KEY,
     platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
     name TEXT NOT NULL COLLATE NOCASE,
     position INTEGER NOT NULL DEFAULT 0,
     UNIQUE (platform_id, name)
   );
   ${CATALOG_2026_09.map(
     ([name, kind, family, generation, igdb, slug, models], i) =>
       `INSERT INTO platforms (name, kind, family, generation, igdb_id, romm_slug, position) VALUES (${sql(name)}, ${sql(kind)}, ${sql(family)}, ${generation ?? "NULL"}, ${igdb ?? "NULL"}, ${sql(slug)}, ${i + 1});` +
       models.map((m, j) => `INSERT INTO platform_models (platform_id, name, position) VALUES ((SELECT id FROM platforms WHERE name = ${sql(name)}), ${sql(m)}, ${j + 1});`).join(""),
   ).join("\n   ")}
   UPDATE games SET platform = 'Nintendo GameCube' WHERE platform = 'GameCube';
   UPDATE hardware SET platform = 'Nintendo GameCube' WHERE platform = 'GameCube';
   UPDATE wishlist SET platform = 'Nintendo GameCube' WHERE platform = 'GameCube';`,

  // Les variantes (Slim, Lite, Fat…) vivent désormais dans « Modèle », d'après le catalogue :
  // « Édition » garde Standard, Collector, Bundle, Édition limitée… Seules les valeurs inutilisées partent.
  `DELETE FROM list_values
   WHERE list = 'hw_edition'
     AND value IN ('Modèle d''origine (Fat)', 'Slim', 'Super Slim', 'Lite', 'Mini', 'XL', 'Pro', 'OLED', 'Elite')
     AND NOT EXISTS (SELECT 1 FROM hardware h WHERE h.edition = list_values.value COLLATE NOCASE);`,

  // Réponses de ScanDex (code-barres → jeu IGDB), gardées pour ne pas redemander le même code.
  `CREATE TABLE barcode_lookups (
     ean TEXT PRIMARY KEY,
     igdb_id INTEGER,
     name TEXT,
     platform TEXT,
     looked_up_at INTEGER NOT NULL
   );`,

  // Bibliothèque Steam du compte, telle que lue au dernier « Synchroniser », et lien jeu ↔ appid.
  `ALTER TABLE games ADD COLUMN steam_appid INTEGER;
   CREATE TABLE steam_library (
     appid INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     playtime_minutes INTEGER NOT NULL DEFAULT 0,
     last_played INTEGER,
     igdb_id INTEGER,
     synced_at TEXT NOT NULL
   );`,

  // Connexion par mot de passe : les sessions vivent en base (se déconnecter les supprime), et
  // les jetons des anciennes connexions par lien disparaissent. Un compte venu d'une base plus
  // ancienne n'a pas de mot de passe utilisable : la commande reset-password lui en donne un.
  `CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     user_agent TEXT
   );
   DROP TABLE IF EXISTS login_tokens;
   DROP TABLE IF EXISTS password_resets;`,

  // Services externes (IGDB, Steam, ScanDex, RomM) réglés dans l'appli : une ligne par champ,
  // « service.champ ». Les variables d'environnement passent devant (services.ts).
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Mode Fullset : une liste de référence par console (ce qui existe à collectionner), récupérée
  // sur demande chez une source, et gardée ici. Le lien avec la collection se calcule à la lecture.
  `CREATE TABLE sets (
     slug TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     name TEXT NOT NULL,
     platform TEXT NOT NULL,
     region TEXT,
     fetched_at TEXT NOT NULL
   );

   CREATE TABLE set_items (
     id INTEGER PRIMARY KEY,
     set_slug TEXT NOT NULL REFERENCES sets(slug) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     title TEXT NOT NULL,
     norm_title TEXT NOT NULL,
     url TEXT,
     price_cents INTEGER,
     igdb_id INTEGER,
     cover_url TEXT,
     UNIQUE (set_slug, position)
   );

   CREATE INDEX set_items_set ON set_items(set_slug);`,

  // Mode Fullset : « je l'ai en ROM », d'après RomM, mis à jour au bouton console par console.
  `ALTER TABLE set_items ADD COLUMN in_romm INTEGER NOT NULL DEFAULT 0;`,

  // La vie d'un exemplaire : vente, don, prêt, panne… Une sortie le retire de la collection
  // (`copies.status`) sans rien effacer : son journal reste, et un retour le fait revenir.
  `ALTER TABLE copies ADD COLUMN status TEXT;
   ALTER TABLE copies ADD COLUMN left_on TEXT;

   CREATE TABLE copy_events (
     id INTEGER PRIMARY KEY,
     copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     happened_on TEXT NOT NULL,
     amount_cents INTEGER,
     person TEXT,
     comment TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE INDEX copy_events_copy ON copy_events(copy_id);`,

  // Mode Fullset : jeu déjà cherché chez IGDB (trouvé ou non). Sans cette marque, la recherche
  // par paquets repasse indéfiniment sur les mêmes titres introuvables et n'avance plus.
  `ALTER TABLE set_items ADD COLUMN igdb_tried INTEGER NOT NULL DEFAULT 0;`,
]

function sql(v: string | null) {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`
}

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const db = new Database(path.join(dataDir, DB_FILE))
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  migrate(db)
  return db
}

function migrate(db: Db) {
  const current = db.pragma("user_version", { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export const schemaVersion = (db: Db) => db.pragma("user_version", { simple: true }) as number
