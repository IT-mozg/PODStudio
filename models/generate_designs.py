# -*- coding: utf-8 -*-
"""
POD pipeline: a saved Etsy search page -> finished designs.

How to use:
  1. pip3 install openai beautifulsoup4 pillow
  2. Put your API key in API_KEY below (or the OPENAI_API_KEY env var)
  3. Save Etsy search page(s) (Chrome: Cmd+S -> "Webpage, Complete")
     into the pages/ folder (the html file together with its "..._files" folder)
  4. python3 generate_designs.py --dry-run  -> show what was parsed (no cost)
     python3 generate_designs.py           -> generate

What the script does:
  - parses every html file in pages/: listing id, title, image
  - skips listings already generated before (history.json)
  - downloads a large version of the reference image into refs/ (fallback: local thumbnail)
  - figures out the background itself: a dark shirt -> black, a light one -> white
  - asks how many listings to generate
  - generates 1 design per listing, saves it into output/ named after the listing title
  - records every success into history.json
"""

import argparse
import base64
import html as html_lib
import json
import os
import re
import ssl
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from threading import Lock
from urllib.parse import unquote

# ================== SETTINGS ==================
API_KEY = os.getenv("OPENAI_API_KEY", "")  # or paste your key here: "sk-..." (do not commit it!)

MODEL = "gpt-image-2"   # options: "gpt-image-1.5", "gpt-image-1-mini" (cheap, for testing)
QUALITY = "medium"        # "low" / "medium" / "high"
SIZE = "auto"           # "auto" / "1024x1024" / "1024x1536" / "1536x1024"

WORKERS = 2             # how many images to generate in parallel
MAX_RETRIES = 3         # retry attempts on error/rate limit
DARK_THRESHOLD = 110    # brightness (0-255) below which a shirt is considered dark

PAGES_DIR = Path("pages")
REFS_DIR = Path("refs")
OUT_DIR = Path("output")
HISTORY_FILE = Path("history.json")

PROMPT_TEMPLATE = """це абсолютно нова концепція і новий арт, який не пов'язаний із жодним іншим дизайном
є ось такий референсний дизайн (зображення)
згенеруй аналогічний дизайн, схожий за стилем і темою, але абсолютно унікальний та інший
тема/заголовок лістингу: {theme}
в результаті має бути унікальний дизайн, не схожий на референс
текст має бути такий самий, як на референсі
фон має бути {background}
не має бути футболки, мокапу чи текстури тканини
по стилю має бути 1 в 1 як на референсі
всі істоти та об'єкти анатомічно правильно згенеровані, з правильною кількістю кінцівок
без ШІ-дефектів
згенеруй зображення"""
# ==================================================

# Honest identification, no spoofed browser User-Agent or fake Referer -
# this fetches a public static image by its own URL (the same one already
# shown to the user by their own browser), not a disguised page-scrape.
HEADERS = {"User-Agent": "PODStudio/1.0 (personal design-research tool; "
                        "fetches a public reference image by URL)"}
MIN_REF_WIDTH = 600  # a reference narrower than this is treated as small and re-downloaded

def _ssl_context():
    """Proper certificates (the system Python on Mac often lacks them)."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

SSL_CTX = _ssl_context()
history_lock = Lock()


# ---------- PARSING SAVED PAGES ----------

def parse_page(html_path: Path) -> dict:
    """Returns {listing_id: {title, local_img, remote_img}} for one page."""
    from bs4 import BeautifulSoup
    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    listings = {}

    # 1) product cards in the search results
    for a in soup.select('a[href*="/listing/"]'):
        m = re.search(r"/listing/(\d+)", a.get("href", ""))
        img = a.find("img")
        if not m or img is None:
            continue
        lid = m.group(1)
        title = html_lib.unescape((img.get("alt") or "").strip())
        if not title or lid in listings:
            continue
        src = img.get("src") or ""
        srcset = img.get("srcset") or img.get("data-srcset") or ""
        remote = largest_from_srcset(srcset, src)
        local = ""
        if src and not src.startswith("http"):
            candidate = html_path.parent / unquote(src)
            if candidate.exists():
                local = str(candidate)
        listings[lid] = {"title": title, "local_img": local, "remote_img": remote}

    # 2) the json-ld block: full titles + full-quality images
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data.get("itemListElement", []) if isinstance(data, dict) else []
        for el in items:
            item = el.get("item", {}) if isinstance(el, dict) else {}
            m = re.search(r"/listing/(\d+)", item.get("url", "") or "")
            if not m:
                continue
            lid = m.group(1)
            entry = listings.setdefault(lid, {"title": "", "local_img": "",
                                              "remote_img": ""})
            if item.get("name"):
                entry["title"] = html_lib.unescape(item["name"].strip())
            if item.get("image"):
                entry["remote_img"] = item["image"]

    return listings


def collect_listings() -> dict:
    html_files = sorted(list(PAGES_DIR.glob("*.html")) + list(PAGES_DIR.glob("*.htm")))
    webarchives = list(PAGES_DIR.glob("*.webarchive"))
    if webarchives:
        print("[!] Знайдено .webarchive (Safari) - такий формат не читається.")
        print("    Збережи сторінку через Chrome: Cmd+S -> 'Веб-сторінка повністю'.")
    if not html_files:
        print(f"У папці {PAGES_DIR}/ немає html-файлів. Збережи туди сторінку Etsy.")
        sys.exit(1)

    all_listings = {}
    for f in html_files:
        found = parse_page(f)
        print(f"  {f.name}: {len(found)} лістингів")
        for lid, data in found.items():
            all_listings.setdefault(lid, data)
    return all_listings


# ---------- REFERENCES AND BACKGROUND COLOR ----------

def largest_from_srcset(srcset: str, src: str) -> str:
    """Picks the URL with the largest width from srcset (tokens like 'url 765w')."""
    best_url, best_w = "", -1
    for part in srcset.split(","):
        bits = part.strip().split()
        if not bits or not bits[0].startswith("http"):
            continue
        w = 0
        if len(bits) > 1 and bits[1].endswith("w") and bits[1][:-1].isdigit():
            w = int(bits[1][:-1])
        if w > best_w:
            best_url, best_w = bits[0], w
    if not best_url and src.startswith("http") and "etsystatic" in src:
        best_url = src
    return best_url


def candidate_urls(url: str):
    """Candidates from largest to smallest: fullxfull -> 1588 -> as-is -> 794."""
    size_pat = r"il_(?:\d+x\d+|\d+xN|fullxfull)"
    urls = [re.sub(size_pat, "il_fullxfull", url),
            re.sub(size_pat, "il_1588xN", url),
            url,
            re.sub(size_pat, "il_794xN", url)]
    seen = []
    for u in urls:
        if u not in seen:
            seen.append(u)
    return seen


def image_width(path) -> int:
    from PIL import Image
    try:
        with Image.open(path) as im:
            return im.size[0]
    except Exception:
        return 0


def get_reference(lid: str, info: dict) -> str:
    """Downloads a large reference into refs/. A small existing one gets re-downloaded."""
    out = REFS_DIR / f"{lid}.jpg"
    if out.exists() and image_width(out) >= MIN_REF_WIDTH:
        return str(out)
    reason = "нема адреси картинки"
    if info["remote_img"]:
        for url in candidate_urls(info["remote_img"]):
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=25,
                                            context=SSL_CTX) as r:
                    data = r.read()
                if len(data) > 5000:
                    out.write_bytes(data)
                    return str(out)
                reason = "порожня відповідь сервера"
            except Exception as e:
                reason = str(e)[:90]
    if out.exists():
        print(f"    [!] [{lid}] велику скачати не вдалося ({reason}) - "
              f"лишаю наявний референс")
        return str(out)
    if info["local_img"]:
        print(f"    [!] [{lid}] велику скачати не вдалося ({reason}) - "
              f"беру мініатюру зі збереженої сторінки")
        out.write_bytes(Path(info["local_img"]).read_bytes())
        return str(out)
    return ""


def shirt_background(img_path: str) -> str:
    """A dark shirt -> 'чорний' (black), a light one -> 'білий' (white)
    (median brightness of the center crop)."""
    from PIL import Image
    im = Image.open(img_path).convert("L")
    w, h = im.size
    zone = im.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)))
    median = statistics.median(zone.tobytes())
    return "чорний" if median < DARK_THRESHOLD else "білий"


# ---------- HISTORY AND FILE NAMES ----------

def load_history() -> dict:
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("[!] history.json пошкоджений, починаю нову історію")
    return {}


def save_history_entry(history: dict, lid: str, entry: dict):
    with history_lock:
        history[lid] = entry
        HISTORY_FILE.write_text(
            json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def title_to_filename(title: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]', "", title)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    return (name[:100].rstrip(" .") or "design") + ".png"


# ---------- GENERATION ----------

def generate_one(client, task: dict) -> tuple:
    prompt = PROMPT_TEMPLATE.format(theme=task["title"], background=task["background"])
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with open(task["reference"], "rb") as img_file:
                result = client.images.edit(
                    model=MODEL, image=img_file, prompt=prompt,
                    size=SIZE, quality=QUALITY)
            Path(task["out_path"]).write_bytes(
                base64.b64decode(result.data[0].b64_json))
            return task, None
        except Exception as e:
            last_err = e
            wait = 20 * attempt
            print(f"[..] {task['title'][:50]}: помилка "
                  f"(спроба {attempt}/{MAX_RETRIES}): {e}. Чекаю {wait} с...")
            time.sleep(wait)
    return task, last_err


def ask_count(available: int) -> int:
    while True:
        raw = input(f"\nСкільки лістингів генерувати? "
                    f"(1-{available}, Enter = всі): ").strip()
        if not raw:
            return available
        if raw.isdigit() and 1 <= int(raw) <= available:
            return int(raw)
        print(f"Введи число від 1 до {available} або просто Enter.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="показати напарсене без генерації і витрат")
    args = parser.parse_args()

    for d in (PAGES_DIR, REFS_DIR, OUT_DIR):
        d.mkdir(exist_ok=True)

    print("Читаю збережені сторінки...")
    all_listings = collect_listings()
    history = load_history()

    new = {lid: v for lid, v in all_listings.items() if lid not in history}
    print(f"\nВсього знайдено: {len(all_listings)} | "
          f"вже було згенеровано раніше: {len(all_listings) - len(new)} | "
          f"нових: {len(new)}")
    if not new:
        print("Нових лістингів немає - все вже згенеровано.")
        return

    if args.dry_run:
        for i, (lid, v) in enumerate(new.items(), 1):
            print(f"  {i:2}. [{lid}] {v['title'][:75]}")
        print("\nЦе був dry-run: нічого не скачано, не згенеровано і не витрачено.")
        return

    count = ask_count(len(new))
    selected = dict(list(new.items())[:count])

    print("\nГотую референси (скачування великих картинок)...")
    tasks = []
    for lid, info in selected.items():
        ref = get_reference(lid, info)
        if not ref:
            print(f"[!] [{lid}] нема картинки - пропускаю: {info['title'][:60]}")
            continue
        bg = shirt_background(ref)
        out_path = OUT_DIR / title_to_filename(info["title"])
        n = 2
        while out_path.exists():  # don't overwrite if titles collide
            out_path = OUT_DIR / (title_to_filename(info["title"])[:-4] + f"_{n}.png")
            n += 1
        tasks.append({"lid": lid, "title": info["title"], "reference": ref,
                      "background": bg, "out_path": str(out_path)})
        print(f"  [{lid}] фон: {bg} | реф: {image_width(ref)}px | "
              f"{info['title'][:60]}")

    if not tasks:
        print("Нема що генерувати.")
        return

    est = {"low": 0.02, "medium": 0.06, "high": 0.25}.get(QUALITY, 0.25)
    print(f"\nДо генерації: {len(tasks)} дизайнів | модель {MODEL}, "
          f"якість {QUALITY} | орієнтовно ~${len(tasks) * est:.2f}")
    if input("Enter - почати генерацію, n - вийти: ").strip().lower() == "n":
        print("Скасовано, нічого не витрачено.")
        return

    if not API_KEY:
        print("\nНе знайдено API-ключ. Встав його в API_KEY у скрипті "
              "або задай змінну середовища OPENAI_API_KEY.")
        sys.exit(1)

    from openai import OpenAI
    client = OpenAI(api_key=API_KEY)

    ok, fail = 0, 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(generate_one, client, t) for t in tasks]
        for i, fut in enumerate(as_completed(futures), 1):
            task, err = fut.result()
            if err is None:
                ok += 1
                save_history_entry(history, task["lid"], {
                    "title": task["title"], "date": date.today().isoformat(),
                    "file": task["out_path"], "background": task["background"]})
                print(f"({i}/{len(tasks)}) [OK] {Path(task['out_path']).name}")
            else:
                fail += 1
                print(f"({i}/{len(tasks)}) [FAIL] {task['title'][:55]}: {err}")

    print(f"\nГотово за {(time.time() - start) / 60:.1f} хв. "
          f"Успішно: {ok} | помилок: {fail}")
    print(f"Дизайни у папці: {OUT_DIR.resolve()}")
    if fail:
        print("Невдалі лістинги НЕ записані в історію - "
              "запусти скрипт ще раз, і він догенерує тільки їх.")


if __name__ == "__main__":
    main()
