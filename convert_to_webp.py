#!/usr/bin/env python3
"""
Convertisseur JPEG/PNG → WebP
Usage :
  python convert_to_webp.py                        # convertit le dossier courant
  python convert_to_webp.py /chemin/vers/images    # convertit un dossier spécifique
  python convert_to_webp.py -q 75                  # qualité personnalisée (défaut : 80)
  python convert_to_webp.py /dossier -q 85 -o /sortie  # dossier de sortie séparé
"""

import argparse
import sys
from pathlib import Path
from PIL import Image

EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif"}


def fmt_size(bytes_count):
    if bytes_count < 1024:
        return f"{bytes_count} o"
    if bytes_count < 1_048_576:
        return f"{bytes_count / 1024:.0f} Ko"
    return f"{bytes_count / 1_048_576:.1f} Mo"


def convert_image(src: Path, dst: Path, quality: int) -> tuple[int, int]:
    with Image.open(src) as img:
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.save(dst, "WEBP", quality=quality, method=6)
    return src.stat().st_size, dst.stat().st_size


def main():
    parser = argparse.ArgumentParser(description="Convertit des images JPEG/PNG en WebP compressé.")
    parser.add_argument("folder", nargs="?", default=".", help="Dossier source (défaut : dossier courant)")
    parser.add_argument("-q", "--quality", type=int, default=80, help="Qualité WebP 1-100 (défaut : 80)")
    parser.add_argument("-o", "--output", default=None, help="Dossier de sortie (défaut : même dossier)")
    parser.add_argument("-r", "--recursive", action="store_true", help="Parcourt les sous-dossiers")
    args = parser.parse_args()

    src_folder = Path(args.folder).resolve()
    if not src_folder.is_dir():
        print(f"Dossier introuvable : {src_folder}")
        sys.exit(1)

    quality = max(1, min(100, args.quality))
    out_folder = Path(args.output).resolve() if args.output else None
    if out_folder:
        out_folder.mkdir(parents=True, exist_ok=True)

    pattern = "**/*" if args.recursive else "*"
    images = [p for p in src_folder.glob(pattern) if p.suffix.lower() in EXTENSIONS]

    if not images:
        print(f"Aucune image trouvee dans {src_folder}")
        sys.exit(0)

    print(f"\n{len(images)} image(s) trouvee(s) - qualite WebP : {quality}%\n")

    total_orig = total_new = 0
    ok = err = 0

    for img_path in sorted(images):
        dest_dir = out_folder if out_folder else img_path.parent
        dest = dest_dir / (img_path.stem + ".webp")
        try:
            orig_size, new_size = convert_image(img_path, dest, quality)
            gain = (1 - new_size / orig_size) * 100
            arrow = "-" if gain > 0 else "+"
            print(f"  OK  {img_path.name:<40}  {fmt_size(orig_size):>8} -> {fmt_size(new_size):>8}  ({arrow}{abs(gain):.0f}%)")
            total_orig += orig_size
            total_new += new_size
            ok += 1
            if dest != img_path:
                img_path.unlink()
        except Exception as e:
            print(f"  ERR {img_path.name:<40}  Erreur : {e}")
            err += 1

    print()
    if ok:
        total_gain = (1 - total_new / total_orig) * 100
        print(f"{ok} converti(s)  |  {fmt_size(total_orig)} -> {fmt_size(total_new)}  (gain total : {total_gain:.0f}%)")
    if err:
        print(f"{err} echec(s)")
    print()


if __name__ == "__main__":
    main()
