# Extract every product photo from Optimo's cat01.pdf and save it once per SKU
# it belongs to (DER/IZQ variants share the shot). Output feeds the existing
# subir-fotos-ruli.mjs pipeline by folder convention: <SKU>.png.
import pdfplumber, re, sys
from pathlib import Path

BASE = Path("/private/tmp/claude-501/-Users-antoniogonzalez-Sites-e-commerce--claude-worktrees-fervent-babbage-22d54a/e96eb6b3-0d2b-44e1-89ab-2ed90355c3b0/scratchpad/cat01")
OUT = Path("/Users/antoniogonzalez/MEGA/Optimo cat01")
OUT.mkdir(exist_ok=True)
SKU = re.compile(r"[A-Z]{2,6}-?\d{3,}[A-Z]?")
RES = 300
ESCALA = RES / 72.0

pdf = pdfplumber.open(BASE / "cat01.pdf")
vistos = set()
total = 0
for page in pdf.pages:
    try:
        words = page.extract_words()
        imgs = [im for im in page.images
                if im["x1"] - im["x0"] > 80 and im["bottom"] - im["top"] > 80
                and im["top"] > 75 and im["bottom"] < page.height - 30
                and im["x1"] - im["x0"] < 300]
        if not imgs:
            continue
        raster = page.to_image(resolution=RES).original  # one render per page
        for im in imgs:
            col_izq = im["x0"] < 306
            zona = [w for w in words
                    if w["top"] >= im["top"] - 12 and w["bottom"] <= im["bottom"] + 12
                    and (w["x0"] < 306 if col_izq else w["x0"] >= 306)
                    and w["x0"] >= im["x1"] - 5]
            skus = []
            for w in zona:
                for m in SKU.findall(w["text"]):
                    if not re.fullmatch(r"\d+", m) and m not in skus:
                        skus.append(m)
            if not skus:
                continue
            caja = (int(im["x0"] * ESCALA), int(im["top"] * ESCALA),
                    int(im["x1"] * ESCALA), int(im["bottom"] * ESCALA))
            recorte = None
            for sku in skus:
                if sku in vistos:
                    continue
                vistos.add(sku)
                if recorte is None:
                    recorte = raster.crop(caja)
                recorte.save(OUT / f"{sku}.png")
                total += 1
    except Exception as e:
        print(f"pag {page.page_number}: {e}", flush=True)
    if page.page_number % 25 == 0:
        print(f"pag {page.page_number}/573 · fotos {total}", flush=True)
print(f"LISTO · {total} archivos, {len(vistos)} skus", flush=True)
