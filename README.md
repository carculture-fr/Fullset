# Fullset

Self-hosted inventory for your video game collection: physical and digital copies, condition of the game, box and manual, what you paid, what it is worth, and your consoles and accessories. Built for collectors, phone first.

> **Status: early development.** The interface is in French for now; English is on the way.
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

All data (SQLite database, covers, photos) lives in the `fullset-data` volume, mounted on `/data`: back it up.

### Optional services

Copy `.env.example` to `.env` and fill in what you want, then `docker compose up -d` again:

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

Toutes les données sont dans le volume `fullset-data` (`/data`) : pense à le sauvegarder.
