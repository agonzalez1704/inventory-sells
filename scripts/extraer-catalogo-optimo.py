# Extract product photos from Yokomitsu/Optimo PDF catalogs (cat01.pdf …
# cat13.pdf) and save one per SKU it belongs to (DER/IZQ variants share the
# shot). Output feeds subir-fotos-ruli.mjs by folder convention: <SKU>.png.
#
#   python3 scripts/extraer-catalogo-optimo.py <salida> <skus.txt|-> cat01.pdf cat02.pdf …
#
# skus.txt (one per line) limits the work to pages that mention one of those
# SKUs — the ones still without a photo — so a re-run renders a few pages
# instead of 1,600. "-" processes every page.
import pdfplumber, re, sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
QUIERO = None if sys.argv[2] == "-" else set(Path(sys.argv[2]).read_text().split())
PDFS = sys.argv[3:]
SKU = re.compile(r"[A-Z]{2,6}-?\d{3,}[A-Z]?")
RES = 300
ESCALA = RES / 72.0

def unir_partidos(words):
    """cat09 sometimes splits a code across two words ("CBTK11" "01")."""
    out = []
    for w in words:
        prev = out[-1] if out else None
        if (prev and re.fullmatch(r"\d{1,3}", w["text"])
                and re.fullmatch(r"(?:[A-Z]{3}\.)?[A-Z]{4}\d{1,3}", prev["text"])
                and abs(prev["top"] - w["top"]) < 3 and 0 <= w["x0"] - prev["x1"] < 8):
            out[-1] = {**prev, "text": prev["text"] + w["text"], "x1": w["x1"]}
        else:
            out.append(w)
    return out


vistos = set()
total = 0
for ruta in PDFS:
    pdf = pdfplumber.open(ruta)
    n = len(pdf.pages)
    for page in pdf.pages:
        try:
            words = unir_partidos(page.extract_words())
            if QUIERO is not None and not any(m in QUIERO for w in words for m in SKU.findall(w["text"])):
                continue
            imgs = [im for im in page.images
                    if im["x1"] - im["x0"] > 80 and im["bottom"] - im["top"] > 80
                    and im["top"] > 75 and im["bottom"] < page.height - 30
                    and im["x1"] - im["x0"] < 300]
            if not imgs:
                continue
            raster = page.to_image(resolution=RES).original  # one render per page
            for im in imgs:
                col_izq = im["x0"] < 306
                # The SKUs printed to the right of the photo, in its column.
                zona = [w for w in words
                        if w["top"] >= im["top"] - 12 and w["bottom"] <= im["bottom"] + 12
                        and (w["x0"] < 306 if col_izq else w["x0"] >= 306)
                        and w["x0"] >= im["x1"] - 5]
                # Card layout (steering racks, cat01 p.196+): the code follows
                # "COD." on a line ABOVE the photo, in the same column; the
                # "ORIG." line between them is the OEM number, not ours.
                # A whole-word code only: the OEM line beside a photo
                # ("52713-BZ520") holds a code-shaped tail that is not ours.
                zona = [w for w in zona if SKU.fullmatch(w["text"].strip(".,;:"))]
                if not zona:
                    # cat09 labels the pair "DER. CODE  IZQ. CODE" instead, and
                    # both sides share the one photo. Often the label and the
                    # code come out as one word ("COD.CFTC0201"), so the label
                    # may be the code's own word, not one to its left.
                    cods = [c for c in words if c["text"].upper().startswith(("COD", "DER", "IZQ"))]
                    arriba = [w for w in words
                              if w["bottom"] <= im["top"] + 2 and im["top"] - w["bottom"] < 70
                              and (w["x0"] < 306 if col_izq else w["x0"] >= 306)
                              and SKU.search(w["text"])
                              and any(abs(c["top"] - w["top"]) < 4 and c["x0"] <= w["x0"] for c in cods)]
                    arriba.sort(key=lambda w: im["top"] - w["bottom"])
                    zona = [w for w in arriba if abs(w["top"] - arriba[0]["top"]) < 4] if arriba else []
                skus = []
                for w in zona:
                    for m in SKU.findall(w["text"]):
                        if not re.fullmatch(r"\d+", m) and m not in skus:
                            skus.append(m)
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
            print(f"{Path(ruta).name} pag {page.page_number}: {e}", flush=True)
        if page.page_number % 50 == 0:
            print(f"{Path(ruta).name} pag {page.page_number}/{n} · fotos {total}", flush=True)
    pdf.close()
print(f"LISTO · {total} archivos, {len(vistos)} skus", flush=True)
