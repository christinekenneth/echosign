"""
move_category_folders.py
Moves ASL training video folders from Downloads into
ai-model/data/asl_recordings/ subfolders.
"""

import shutil
from pathlib import Path

SOURCE    = Path("C:/Users/USER/Downloads")
DEST_BASE = Path("C:/Users/USER/OneDrive/Desktop/echosign/ai-model/data/asl_recordings")

# Maps source folder name (lowercase) -> destination subfolder name.
# Add aliases here for any non-standard folder names in Downloads.
FOLDER_MAP: dict[str, str] = {
    # exact names
    "greetings":        "greetings",
    "card":             "card",
    "transfer":         "transfer",
    "account":          "account",
    "fraud":            "fraud",
    "atm":              "atm",
    "numbers":          "numbers",
    "banking_words":    "banking_words",
    "status":           "status",
    "confirmation":     "confirmation",
    # aliases / alternate names
    "greet_navigation": "greetings",
    "greet":            "greetings",
    "cards":            "card",
    "transfers":        "transfer",
    "accounts":         "account",
    "banking words":    "banking_words",
    "banking_word":     "banking_words",
    "confirm":          "confirmation",
    "confirmations":    "confirmation",
    "number":           "numbers",
    "num":              "numbers",
}


def dest_path(dest_dir: Path, filename: str) -> Path:
    """Return destination path, appending _dup if the file already exists."""
    dest = dest_dir / filename
    if dest.exists():
        stem = Path(filename).stem
        suffix = Path(filename).suffix
        dest = dest_dir / f"{stem}_dup{suffix}"
    return dest


def main() -> None:
    # 1. Discover folders in Downloads that contain .mp4 files
    folders_with_mp4: dict[str, list[Path]] = {}
    for item in sorted(SOURCE.iterdir()):
        if item.is_dir():
            mp4s = sorted(item.glob("*.mp4"))
            if mp4s:
                folders_with_mp4[item.name] = mp4s

    if not folders_with_mp4:
        print("No subfolders containing .mp4 files found in", SOURCE)
        return

    print("Found these folders with MP4 files:")
    for name, files in folders_with_mp4.items():
        dest = FOLDER_MAP.get(name.lower())
        marker = f"  -> asl_recordings/{dest}/" if dest else "  (no match)"
        print(f"  - {name}/ ({len(files)} files){marker}")
    print()

    # 2-6. Move matching folders
    counts: dict[str, int] = {}
    errors: list[str] = []
    total = 0

    for folder_name, mp4s in folders_with_mp4.items():
        key = FOLDER_MAP.get(folder_name.lower())
        if key is None:
            print(f"SKIP: {folder_name}/ does not match any known category")
            continue

        dest_dir = DEST_BASE / key
        dest_dir.mkdir(parents=True, exist_ok=True)
        counts[key] = 0

        for src in mp4s:
            dst = dest_path(dest_dir, src.name)
            try:
                shutil.move(str(src), str(dst))
                print(f"Moved {folder_name}/{src.name} -> asl_recordings/{key}/{dst.name}")
                counts[key] += 1
                total += 1
            except Exception as exc:
                msg = f"ERROR: {folder_name}/{src.name} — {exc}"
                print(msg)
                errors.append(msg)

    # 6. Summary
    print()
    print(f"Total files moved: {total}")
    for folder, n in sorted(counts.items()):
        print(f"  {folder}/: {n} files")

    # 7. Errors
    if errors:
        print()
        print(f"{len(errors)} file(s) could not be moved:")
        for e in errors:
            print(f"  {e}")


if __name__ == "__main__":
    main()
