# Installing Fullset with an AI agent

Fullset is a self-hosted inventory for a video game collection (physical and digital copies,
consoles and accessories). This file is written for a coding agent — Claude Code, or any other —
asked to install it on someone's machine or server. A human can follow it too.

> [Version française plus bas.](#installer-fullset-avec-un-agent-ia)

## What to ask for

> "Install Fullset on this server, following AGENTS.md in the repository."

## Before you start

Check these, and tell the person if something is missing instead of working around it:

- **Docker** with the Compose plugin: `docker compose version`.
- **A free port.** The default is 3110: `ss -ltn | grep 3110` must return nothing. If it is taken,
  set `FULLSET_PORT` in a `.env` file next to `compose.yaml`.
- **Disk space**: the image is about 450 MB, the data starts near zero and grows with covers and
  photos (a few MB per hundred games).
- **Ask where the data should live.** By default it goes into the `fullset-data` Docker volume.
  Many self-hosters prefer a bind mount they already back up — replace the volume with a path in
  `compose.yaml` if that is the case, and say so.

## Install

```sh
git clone https://github.com/carculture-fr/Fullset.git && cd Fullset
docker compose up -d
```

The published image is pulled when available, otherwise Compose builds it from source (a few
minutes). Then check the service answers:

```sh
curl -s http://localhost:3110/api/health
```

A healthy answer looks like `{"ok":true,"version":"…","schema":…,"igdb":false,"romm":false}`.
`igdb:false` is expected at this point: no service key has been given yet.

## First run — leave this to the person

Open `http://<server>:3110`. The first screen creates **the** account: one account per
installation, and sign-up closes for good once it exists.

**Do not create the account yourself and do not invent a password.** Let the owner choose it, or
ask them for it. If they lose it later:

```sh
docker exec fullset node server/dist/cli/reset-password.js
```

## Optional service keys

Everything works without them — games can be added by hand. They are set in the app
(*Settings → Services*, with a *Test* button), or as environment variables, which take precedence
and become read-only in the app. See `.env.example`.

| Service | What it brings | Where to get it |
|---|---|---|
| IGDB | game search, metadata, covers | free Twitch developer account |
| ScreenScraper | covers and localised titles, console by console | free account **and** developer credentials (asked on their forum, free applications only) |
| SteamGridDB | community covers, when IGDB has none | free key in your profile preferences |
| Steam | your Steam library and play time | Steam Web API key + SteamID64 |
| ScanDex | suggests the game behind an unknown barcode | token on their site |
| RomM | link from a game to its ROM | your RomM address and API token |

**Never put these keys in `compose.yaml`** (it often ends up in a git repository): use the app or
a `.env` file that stays out of version control.

## Behind a reverse proxy

The barcode scanner needs the camera, which browsers only allow over HTTPS. Put Fullset behind the
existing reverse proxy, and set `TRUST_PROXY` to the proxy address so that login rate limits see
the real client IP and not the proxy's. If the proxy does not forward `X-Forwarded-Host`, also set
`ALLOWED_ORIGINS` to the public address, otherwise writes are refused.

## Backups — say this out loud

All the state is in `/data` inside the container (SQLite database, covers, photos). Back up the
volume or the bind mount you chose. The app also offers a full `.zip` backup and its restore in
*Settings → Data*; mention it, it is the simplest route for someone without a backup system.

## What a successful install looks like

- `docker compose ps` shows the container `healthy`.
- `curl http://localhost:<port>/api/health` answers `{"ok":true,…}`.
- The owner has created their account and sees an empty library.
- You have told them: where the data lives, how to back it up, and that service keys are optional.

---

# Installer Fullset avec un agent IA

Fullset est un inventaire auto-hébergé pour une collection de jeux vidéo (exemplaires physiques et
dématérialisés, consoles et accessoires). Ce fichier s'adresse à un agent — Claude Code ou un
autre — à qui l'on demande de l'installer. Un humain peut le suivre aussi.

## Ce qu'on te demande

> « Installe Fullset sur ce serveur, en suivant AGENTS.md du dépôt. »

## Avant de commencer

Vérifie ces points, et signale ce qui manque plutôt que de le contourner :

- **Docker** avec le greffon Compose : `docker compose version`.
- **Un port libre.** 3110 par défaut : `ss -ltn | grep 3110` ne doit rien rendre. S'il est pris,
  pose `FULLSET_PORT` dans un fichier `.env` à côté de `compose.yaml`.
- **De la place** : l'image fait environ 450 Mo, les données partent de presque rien et grossissent
  avec les jaquettes et les photos (quelques Mo par centaine de jeux).
- **Demande où ranger les données.** Par défaut, dans le volume Docker `fullset-data`. Beaucoup
  préfèrent un dossier qu'ils sauvegardent déjà : remplace alors le volume par un chemin dans
  `compose.yaml`, et dis-le.

## Installation

```sh
git clone https://github.com/carculture-fr/Fullset.git && cd Fullset
docker compose up -d
```

L'image publiée est récupérée si elle est disponible, sinon Compose la construit depuis les
sources (quelques minutes). Vérifie ensuite que le service répond :

```sh
curl -s http://localhost:3110/api/health
```

Une réponse saine ressemble à `{"ok":true,"version":"…","schema":…,"igdb":false,"romm":false}`.
`igdb:false` est normal ici : aucune clé de service n'a encore été donnée.

## Premier lancement — laisse-le à la personne

Ouvre `http://<serveur>:3110`. Le premier écran crée **le** compte : un seul par installation, et
l'inscription se ferme définitivement une fois qu'il existe.

**Ne crée pas le compte toi-même et n'invente pas de mot de passe.** Laisse le propriétaire le
choisir, ou demande-le-lui. S'il le perd :

```sh
docker exec fullset node server/dist/cli/reset-password.js
```

## Clés de services, facultatives

Tout fonctionne sans elles — les jeux s'ajoutent à la main. Elles se règlent dans l'appli
(*Réglages → Services*, avec un bouton *Tester*), ou en variables d'environnement, qui passent
devant et deviennent non modifiables dans l'appli. Voir `.env.example`.

| Service | Ce qu'il apporte | Où l'obtenir |
|---|---|---|
| IGDB | recherche des jeux, fiches, jaquettes | compte développeur Twitch gratuit |
| ScreenScraper | jaquettes et titres français, console par console | compte gratuit **et** identifiants développeur (demandés sur leur forum, applications gratuites seulement) |
| SteamGridDB | jaquettes de la communauté, quand IGDB n'a rien | clé gratuite dans les préférences du profil |
| Steam | ta bibliothèque Steam et le temps de jeu | clé API Steam + SteamID64 |
| ScanDex | propose le jeu derrière un code-barres inconnu | jeton sur leur site |
| RomM | lien d'un jeu vers sa ROM | adresse de ton RomM et jeton d'API |

**Ne mets jamais ces clés dans `compose.yaml`** (il finit souvent dans un dépôt git) : passe par
l'appli ou par un `.env` qui reste hors du suivi de version.

## Derrière un proxy inverse

Le lecteur de codes-barres a besoin de la caméra, que les navigateurs n'autorisent qu'en HTTPS.
Place Fullset derrière le proxy inverse existant et pose `TRUST_PROXY` à l'adresse du proxy, pour
que les limites d'essais de connexion voient la vraie adresse du client et non celle du proxy. Si
le proxy ne transmet pas `X-Forwarded-Host`, pose aussi `ALLOWED_ORIGINS` à l'adresse publique,
sinon les écritures sont refusées.

## Les sauvegardes — dis-le à voix haute

Tout l'état est dans `/data` à l'intérieur du conteneur (base SQLite, jaquettes, photos).
Sauvegarde le volume ou le dossier choisi. L'appli propose aussi une sauvegarde complète en `.zip`
et sa restauration dans *Réglages → Données* : mentionne-la, c'est le plus simple pour quelqu'un
qui n'a pas de système de sauvegarde.

## À quoi ressemble une installation réussie

- `docker compose ps` montre le conteneur `healthy`.
- `curl http://localhost:<port>/api/health` répond `{"ok":true,…}`.
- Le propriétaire a créé son compte et voit une bibliothèque vide.
- Tu lui as dit : où vivent les données, comment les sauvegarder, et que les clés de services sont
  facultatives.
