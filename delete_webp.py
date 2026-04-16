#!/usr/bin/env python3
"""
Suppresseur de fichiers WebP
Usage :
  python delete_webp.py                        # supprime dans ~/Downloads/aectra-portrait
  python delete_webp.py /chemin/vers/dossier   # supprime dans un dossier specifique
  python delete_webp.py -r                     # parcourt les sous-dossiers
  python delete_webp.py --dry-run              # apercu sans supprimer
"""

import argparse
import sys
from pathlib import Path


def fmt_size(bytes_count):
    if bytes_count < 1024:
        return f"{bytes_count} o"
    if bytes_count < 1_048_576:
        return f"{bytes_count / 1024:.0f} Ko"
    return f"{bytes_count / 1_048_576:.1f} Mo"


def main():
    parser = argparse.ArgumentParser(description="Supprime les fichiers WebP d'un dossier.")
    parser.add_argument("folder", nargs="?",
                        default=str(Path.home() / "Downloads" / "aectra-portrait"),
                        help="Dossier cible (defaut : ~/Downloads/aectra-portrait)")
    parser.add_argument("-r", "--recursive", action="store_true", help="Parcourt les sous-dossiers")
    parser.add_argument("--dry-run", action="store_true", help="Affiche les fichiers sans les supprimer")
    args = parser.parse_args()

    folder = Path(args.folder).resolve()
    if not folder.is_dir():
        print(f"Dossier introuvable : {folder}")
        sys.exit(1)

    pattern = "**/*.webp" if args.recursive else "*.webp"
    files = sorted(folder.glob(pattern))

    if not files:
        print(f"Aucun fichier .webp trouve dans {folder}")
        sys.exit(0)

    label = "[DRY-RUN] " if args.dry_run else ""
    print(f"\n{len(files)} fichier(s) .webp trouve(s) dans {folder}\n")

    total_size = 0
    ok = err = 0

    for f in files:
        size = f.stat().st_size
        total_size += size
        if args.dry_run:
            print(f"  --  {f.name:<50}  {fmt_size(size):>8}")
            ok += 1
        else:
            try:
                f.unlink()
                print(f"  OK  {f.name:<50}  {fmt_size(size):>8}  supprime")
                ok += 1
            except Exception as e:
                print(f"  ERR {f.name:<50}  Erreur : {e}")
                err += 1

    print()
    action = "a supprimer" if args.dry_run else "supprime(s)"
    print(f"{ok} fichier(s) {action}  |  {fmt_size(total_size)} liberes")
    if err:
        print(f"{err} echec(s)")
    print()


if __name__ == "__main__":
    main()
