"""Ajoute le matériel de démonstration (server/test/fixtures/materiel.json) à une installation
dont le matériel est vide ; ne touche à rien sinon.
    python3 scripts/demo-materiel.py http://localhost:5176 <identifiant> <mot-de-passe>
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE, USER, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
ITEMS = json.loads((pathlib.Path(__file__).parent.parent / "server/test/fixtures/materiel.json").read_text())

with sync_playwright() as p:
    page = p.chromium.launch().new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input[autocomplete='current-password']")
    page.fill("input[autocomplete='username']", USER)
    page.fill("input[autocomplete='current-password']", PASSWORD)
    page.locator("form button").last.click()
    page.wait_for_selector("input[type=search]")
    existing = page.request.get(f"{BASE}/api/hardware").json()
    if (existing.get("items") if isinstance(existing, dict) else existing):
        sys.exit("Du matériel est déjà enregistré : rien n'est ajouté.")
    for item in ITEMS:
        r = page.request.post(f"{BASE}/api/hardware", data=item, headers={"Origin": BASE})
        label = " ".join(v for v in (item["platform"], item.get("model") or item.get("edition")) if v)
        print(f"{r.status} {item['kind']} {label}")
        if not r.ok:
            print("  ", r.text())
