"""Données de démonstration : les jeux (server/test/fixtures/collection.json) si la collection
est vide, le matériel (server/test/fixtures/materiel.json) s'il n'y en a pas.
    python3 scripts/demo.py <url> <identifiant> <mot-de-passe> [--remplacer-jeux]
--remplacer-jeux supprime d'abord tous les jeux de l'installation (irréversible : faire une copie
de la base avant).
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE, USER, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
REPLACE = "--remplacer-jeux" in sys.argv[4:]
FIXTURES = pathlib.Path(__file__).parent.parent / "server/test/fixtures"
GAMES = (FIXTURES / "collection.json").read_text()
HARDWARE = json.loads((FIXTURES / "materiel.json").read_text())
WRITE = {"Origin": BASE}

with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input[autocomplete='current-password']")
    page.fill("input[autocomplete='username']", USER)
    page.fill("input[autocomplete='current-password']", PASSWORD)
    page.locator("form button").last.click()
    page.wait_for_selector("input[type=search], a[href='/ajouter']")

    games = page.request.get(f"{BASE}/api/library").json()["games"]
    if games and REPLACE:
        # Supprimer le dernier exemplaire d'un jeu supprime le jeu, sa jaquette et ses photos.
        copies = [c["id"] for g in games for c in g["copies"]]
        failed = [c for c in copies if not page.request.delete(f"{BASE}/api/copies/{c}", headers=WRITE).ok]
        print(f"{len(games)} jeux supprimés ({len(copies) - len(failed)} exemplaires)" + (f", échecs : {failed}" if failed else ""))
        games = page.request.get(f"{BASE}/api/library").json()["games"]
    if games:
        print(f"{len(games)} jeux déjà présents : jeux de démonstration non importés (--remplacer-jeux pour les remplacer).")
    else:
        r = page.request.post(
            f"{BASE}/api/import",
            multipart={"file": {"name": "collection.json", "mimeType": "application/json", "buffer": GAMES.encode()}},
            headers=WRITE,
        )
        print("jeux de démonstration :", r.status, r.text()[:200])

    if page.request.get(f"{BASE}/api/hardware").json()["items"]:
        print("Matériel déjà présent : matériel de démonstration non ajouté.")
    else:
        for item in HARDWARE:
            r = page.request.post(f"{BASE}/api/hardware", data=item, headers=WRITE)
            label = " ".join(v for v in (item["platform"], item.get("model") or item.get("edition")) if v)
            print(f"{r.status} {item['kind']} {label}")
