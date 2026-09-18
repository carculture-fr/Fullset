# Fullset

Self-hosted inventory for your video game collection: physical and digital copies, condition of the game, box and manual, what you paid, what it is worth, and your consoles and accessories. Built for collectors, phone first.

> **Status: early development.** The interface is available in English and French (Settings → Default display → Language; before sign-in, the browser language).
> [Version française plus bas.](#français)

## Features

- Library with covers, grid or list, grouped by console, filters and sorting
- Add a game in seconds: IGDB search (European titles included) or scan the box barcode
- Per-copy details: condition, content, edition, region, price, purchase date and place, photos
- Estimated value with history, wishlist, statistics, CSV and JSON export and import
- Consoles, controllers and accessories, with a reference picture from Wikimedia Commons
- "Do I already own it?" barcode check, made for flea markets, and offline browsing (PWA)
- Steam library: link your PC games and bring back play time
- Optional link to a [RomM](https://github.com/rommapp/romm) instance

## Quick start

```sh
git clone https://github.com/carculture-fr/Fullset.git && cd Fullset
docker compose up -d
```

Open `http://<your-server>:3110` and create your account: there is one account per installation, and sign-up closes once it exists.

### Backup and restore

All data (SQLite database, covers, photos) lives in the `fullset-data` volume, mounted on `/data`: back it up.

From the app, *Statistiques → Données* also gives a **full backup** as a single `.zip` (the JSON export plus every cover and photo), and puts one back with **Restaurer une sauvegarde**. Restoring replaces the current collection — games, hardware, wishlist and images — so it is asked for confirmation first. The reference lists of the Fullset mode and your service keys are left untouched.

### Optional services

The first-run setup asks for them, and they can be changed any time in *Réglages → Services*, with a *Test* button. Keys are stored in the database and never sent back to the browser (only their last 4 characters are shown). Environment variables, if set (see `.env.example`), take precedence and are read-only in the app.

| Service | What for | Variables |
|---|---|---|
| IGDB (free Twitch developer account) | game search, metadata and covers | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` |
| Steam | your Steam library and play time | `STEAM_API_KEY`, `STEAM_ID` |
| ScanDex | suggests the game behind an unknown barcode | `SCANDEX_TOKEN` |
| RomM | link from a game to its ROM | `ROMM_URL`, `ROMM_API_TOKEN` |

Without IGDB, games can still be added by hand.

### Behind a reverse proxy

The barcode scanner needs the camera, so HTTPS. Put Fullset behind your usual reverse proxy and set `TRUST_PROXY` to the proxy address so login rate limits see real client IPs.

### Forgot your password

```sh
docker exec fullset node server/dist/cli/reset-password.js
```

It sets a new random password, prints it once and closes every session.

## Development

Node 22. `npm install`, then `npm run dev` (API on :3110, Vite on :5176), `npm test`, `npm run typecheck`.

## Security

Please report vulnerabilities privately: see [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE). Game data comes from [IGDB](https://www.igdb.com), console pictures from [Wikimedia Commons](https://commons.wikimedia.org) (credited in the app), and the console list was built from IGDB and [RomM](https://github.com/rommapp/romm).

---

## Français

Inventaire auto-hébergé de ta collection de jeux vidéo : exemplaires physiques et dématérialisés, état du jeu, de la boîte et de la notice, prix payé, valeur estimée, consoles et accessoires. Pensé pour les collectionneurs, d'abord sur téléphone.

**Installation :** `docker compose up -d`, puis ouvre `http://<ton-serveur>:3110` et crée ton compte (un seul par installation). Les services facultatifs (IGDB, Steam, ScanDex, RomM) se règlent dans `.env` (voir `.env.example`). Mot de passe oublié : `docker exec fullset node server/dist/cli/reset-password.js`.

Les services (IGDB, Steam, ScanDex, RomM) se règlent à l'installation puis dans Réglages → Services, avec un bouton « Tester ».

L'interface existe en français et en anglais : Réglages → Affichage par défaut → Langue (avant connexion, celle du navigateur). Les traductions sont dans `web/src/locales/` et `server/src/locales/` (le français fait référence).

Toutes les données sont dans le volume `fullset-data` (`/data`) : pense à le sauvegarder.

Depuis l'appli, **Statistiques → Données** propose aussi une **sauvegarde complète** en un seul `.zip` (l'export JSON, toutes les jaquettes et toutes les photos), et sait la remettre en place avec **Restaurer une sauvegarde**. La restauration remplace la collection en cours — jeux, matériel, souhaits et images — d'où la confirmation demandée ; les listes du mode Fullset et les clés des services ne sont pas touchées.
