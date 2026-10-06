import os
import sys
import ssl
import json
import time
import re
import zipfile
import argparse
import unicodedata
import urllib.request
from pathlib import Path

# Ensure UTF-8 output in Windows PowerShell / terminal
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import config_manager

CONFIG = config_manager.load_config()

def resolve_source_root():
    src_conf = CONFIG.get("source_root", "./songs")
    p = Path(src_conf)
    if p.exists() and p.is_dir():
        return p
    home_downloads = Path.home() / "Downloads"
    for candidate in [
        Path("./songs"),
        Path("./maisquared"),
        home_downloads / "maimai" / "maisquared",
        home_downloads / "maimai"
    ]:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return p

SOURCE_ROOT = resolve_source_root()
DEST_ROOT = Path(CONFIG.get("output_dir", "./output"))
CACHE_FILE = Path(__file__).parent / "sega_songs_cache.json"
DATA_URL = "https://maimai.sega.jp/data/maimai_songs.json"

# Version mapping from local folder name to SEGA versionId prefix
# (Based on arcade-songs-fetch/src/maimai/fetch-songs.ts versionMap)
VERSION_MAP = {
    "01. maimai": 100,
    "02. maimai PLUS": 110,
    "03. GreeN": 120,
    "04. GreeN PLUS": 130,
    "05. ORANGE": 140,
    "06. ORANGE PLUS": 150,
    "07. PiNK": 160,
    "08. PiNK PLUS": 170,
    "09. MURASAKi": 180,
    "10. MURASAKi PLUS": 185,
    "11. MiLK": 190,
    "12. MiLK PLUS": 195,
    "13. FiNALE": 199,
    "14. DX": 200,
    "15. DX PLUS": 205,
    "16. Splash": 210,
    "17. Splash PLUS": 215,
    "18. UNiVERSE": 220,
    "19. UNiVERSE PLUS": 225,
    "20. FESTiVAL": 230,
    "21. FESTiVAL PLUS": 235,
    "22. BUDDiES": 240,
    "23. BUDDiES PLUS": 245,
    "24. PRiSM": 250,
    "25. PRiSM PLUS": 255,
    "26. CiRCLE": 260,
    "27. CiRCLE PLUS": 265,
    "28. MAGiCAL": 270,
}

def fetch_sega_songs(force_refresh=False):
    """Fetch master song list from SEGA official endpoint or load from cache."""
    if not force_refresh and CACHE_FILE.exists():
        # Check cache age (valid for 24 hours)
        mtime = CACHE_FILE.stat().st_mtime
        if (time.time() - mtime) < 86400:
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    print(f"[SEGA Data] Loaded {len(data)} songs from local cache ({CACHE_FILE.name})")
                    return data
            except Exception as e:
                print(f"[SEGA Data] Cache read error ({e}), fetching fresh data...")

    print(f"[SEGA Data] Fetching master catalog from {DATA_URL} ...")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        DATA_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
        }
    )

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as res:
            content = res.read().decode("utf-8")
            data = json.loads(content)
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[SEGA Data] Successfully fetched and cached {len(data)} songs!")
            return data
    except Exception as e:
        if CACHE_FILE.exists():
            print(f"[SEGA Data] Online fetch failed ({e}). Falling back to cached data.")
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        raise RuntimeError(f"Failed to fetch SEGA song data: {e}")

def normalize_title(s: str) -> str:
    """Normalize string for standard comparison across unicode variants."""
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("･", "・").replace("~", "〜").replace("’", "'").replace("”", '"')
    s = s.replace(":", "").replace("：", "")
    s = s.replace(" ", "").replace("　", "").lower()
    return s

def fuzzy_key(s: str) -> str:
    """Aggressive punctuation-stripped fuzzy key for resilient matching."""
    s = unicodedata.normalize("NFKC", str(s))
    # Strip dots, exclamations, quotes, underscores, hyphens, colons, brackets, spaces, slashes, symbols
    for ch in [".", ",", "!", "！", "?", "？", "'", "’", '"', "”", "`", ":", "：", ";", ";",
               "-", "—", "–", "_", "~", "〜", "･", "・", " ", "\u3000", "(", ")", "（", "）",
               "[", "]", "【", "】", "/", "／", "\\", "*", "★", "☆", "†", "‡", "\ufffd"]:
        s = s.replace(ch, "")
    return s.lower()

def get_sega_songs_for_version(sega_data, version_id: int):
    """Filter SEGA data for songs belonging to the specified version."""
    v_prefix = str(version_id)
    matched = []
    for s in sega_data:
        ver_str = str(s.get("version", ""))
        if ver_str.startswith(v_prefix):
            matched.append(s)
    return matched

def match_local_songs(local_version_dir: Path, sega_version_songs):
    """
    Match local song directories against official SEGA live songs for that version.
    Returns: (matched_pairs, skipped_local_dirs, missing_sega_songs)
    matched_pairs: list of (local_dir_path, sega_song_dict)
    """
    if not local_version_dir.exists():
        return [], [], []

    local_dirs = [d for d in local_version_dir.iterdir() if d.is_dir()]

    # Build candidate lookup: fuzzy_key -> list of directory candidates
    lookup = {}
    for d in local_dirs:
        m_title = ""
        m_artist = ""
        m_file = d / "maidata.txt"
        if m_file.is_file():
            try:
                with open(m_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("&title="):
                            m_title = line[7:].strip()
                        elif line.startswith("&artist="):
                            m_artist = line[8:].strip()
            except Exception:
                pass

        keys = set()
        # 1. Folder name
        keys.add(fuzzy_key(d.name))
        # 2. Folder name without trailing suffixes like (2), (1), [DX], [ST]
        clean_folder = re.sub(r"\s*[\(\[](\d+|dx|st|tano_c)[\)\]]\s*$", "", d.name, flags=re.IGNORECASE)
        keys.add(fuzzy_key(clean_folder))

        # 3. Title from maidata.txt
        if m_title:
            keys.add(fuzzy_key(m_title))
            clean_title = re.sub(r"\s*[\(\[](\d+|dx|st|tano_c)[\)\]]\s*$", "", m_title, flags=re.IGNORECASE)
            keys.add(fuzzy_key(clean_title))

        for k in keys:
            if not k:
                continue
            if k not in lookup:
                lookup[k] = []
            lookup[k].append({
                "dir": d,
                "maidata_title": m_title,
                "maidata_artist": m_artist,
                "folder_name": d.name
            })

    matched_pairs = []
    matched_local_paths = set()
    missing_sega = []

    for sega_song in sega_version_songs:
        title = sega_song.get("title", "")
        fk = fuzzy_key(title)
        candidates = lookup.get(fk, [])

        # Filter out already matched dirs if possible
        available = [c for c in candidates if c["dir"] not in matched_local_paths]
        if not available:
            available = candidates

        chosen = None
        if len(available) == 1:
            chosen = available[0]["dir"]
        elif len(available) > 1:
            # Disambiguate by artist
            s_artist = fuzzy_key(sega_song.get("artist", ""))
            for c in available:
                c_art = fuzzy_key(c["maidata_artist"])
                if s_artist and c_art and (c_art in s_artist or s_artist in c_art):
                    chosen = c["dir"]
                    break
            if not chosen:
                chosen = available[0]["dir"]

        if chosen and chosen not in matched_local_paths:
            matched_pairs.append((chosen, sega_song))
            matched_local_paths.add(chosen)
        else:
            missing_sega.append(sega_song)

    skipped_dirs = [d for d in local_dirs if d not in matched_local_paths]
    return matched_pairs, skipped_dirs, missing_sega

def compile_folder_to_adx(source_folder: Path, dest_adx_path: Path) -> int:
    """
    Compress a song folder into an .adx file (ZIP format), excluding .mp4 files.
    Returns number of bytes written.
    """
    dest_adx_path.parent.mkdir(parents=True, exist_ok=True)
    temp_zip = dest_adx_path.with_suffix(".tmp_adx")

    if temp_zip.exists():
        temp_zip.unlink()

    file_count = 0
    with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(source_folder):
            for file in files:
                if file.lower().endswith(".mp4"):
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(source_folder)
                zf.write(full_path, arcname=str(rel_path))
                file_count += 1

    if file_count == 0:
        if temp_zip.exists():
            temp_zip.unlink()
        raise ValueError(f"No playable files found in {source_folder.name} (only mp4 or empty)")

    if dest_adx_path.exists():
        dest_adx_path.unlink()
    temp_zip.replace(dest_adx_path)
    return dest_adx_path.stat().st_size

def process_version(version_folder_name: str, sega_data, dry_run=False, force=False):
    """Process a single version folder: match and compile."""
    version_id = VERSION_MAP.get(version_folder_name)
    if not version_id:
        print(f"[!] Unknown version mapping for: '{version_folder_name}', skipping.")
        return

    local_vdir = SOURCE_ROOT / version_folder_name
    if not local_vdir.exists():
        print(f"[!] Local folder does not exist: {local_vdir}, skipping.")
        return

    sega_songs = get_sega_songs_for_version(sega_data, version_id)
    matched_pairs, skipped_dirs, missing_sega = match_local_songs(local_vdir, sega_songs)

    print("\n" + "="*70)
    print(f" VERSION: {version_folder_name} (SEGA ver code: {version_id})")
    print(f" Source:      {local_vdir}")
    print(f" Destination: {DEST_ROOT / version_folder_name}")
    print(f" Official Live Songs: {len(sega_songs)} | Matched Locally: {len(matched_pairs)} | Skipped Folders: {len(skipped_dirs)}")
    print("="*70)

    if skipped_dirs:
        deleted_licenses = [d.name for d in skipped_dirs if not d.name.startswith("[")]
        utage_charts = [d.name for d in skipped_dirs if d.name.startswith("[")]
        if deleted_licenses:
            print(f"  [Skipped - Deleted/Expired Licenses]: {len(deleted_licenses)}")
            for d in deleted_licenses:
                print(f"    - {d}")
        if utage_charts:
            print(f"  [Skipped - Utage/Special Charts]: {len(utage_charts)}")

    if missing_sega:
        print(f"  [Missing in Local Folder]: {len(missing_sega)}")
        for ms in missing_sega:
            print(f"    - {ms.get('title')} ({ms.get('catcode')})")

    out_dir = DEST_ROOT / version_folder_name
    out_dir.mkdir(parents=True, exist_ok=True)

    compiled_count = 0
    skipped_existing = 0

    for idx, (song_dir, sega_info) in enumerate(matched_pairs, 1):
        adx_name = f"{song_dir.name}.adx"
        adx_dest = out_dir / adx_name

        if adx_dest.exists() and not force:
            skipped_existing += 1
            print(f"  [{idx:2d}/{len(matched_pairs):2d}] (Exists, Skipped) {adx_name}")
            continue

        if dry_run:
            print(f"  [{idx:2d}/{len(matched_pairs):2d}] [DRY-RUN] Would compile: '{song_dir.name}' -> {adx_name}")
        else:
            t0 = time.time()
            size = compile_folder_to_adx(song_dir, adx_dest)
            elapsed = time.time() - t0
            compiled_count += 1
            print(f"  [{idx:2d}/{len(matched_pairs):2d}] [COMPILED] {adx_name} ({size / (1024*1024):.2f} MB, {elapsed:.2f}s)")

    print(f"\n Finished {version_folder_name}: {compiled_count} compiled, {skipped_existing} already existed.\n")

def main():
    global SOURCE_ROOT, DEST_ROOT
    parser = argparse.ArgumentParser(description="Automate matching and compiling of live maimai songs for AstroDX.")
    parser.add_argument("--version", "-v", help="Specific version folder name (e.g. '01. maimai' or '02. maimai PLUS')")
    parser.add_argument("--all", "-a", action="store_true", help="Process ALL version folders")
    parser.add_argument("--dry-run", "-d", action="store_true", help="Preview matches and actions without compressing")
    parser.add_argument("--force", "-f", action="store_true", help="Recompile even if .adx already exists")
    parser.add_argument("--refresh", "-r", action="store_true", help="Force refresh SEGA official catalog cache")
    parser.add_argument("--status", "-s", action="store_true", help="Show summary report across all versions")
    parser.add_argument("--output", "-o", help="Custom output directory for .adx packages (overrides config)")
    parser.add_argument("--source", "--src", help="Custom source library root containing version folders (overrides config)")

    args = parser.parse_args()

    if args.output:
        DEST_ROOT = Path(args.output)
    if args.source:
        SOURCE_ROOT = Path(args.source)

    sega_data = fetch_sega_songs(force_refresh=args.refresh)

    if args.status:
        print("\n" + "="*80)
        print(f"{'Version Folder':<25} | {'SEGA Live':<10} | {'Matched':<10} | {'Already .adx':<12} | {'Local Total':<10}")
        print("="*80)
        for vname, vid in VERSION_MAP.items():
            vdir = SOURCE_ROOT / vname
            if not vdir.exists():
                continue
            sega_songs = get_sega_songs_for_version(sega_data, vid)
            matched_pairs, skipped_dirs, _ = match_local_songs(vdir, sega_songs)
            local_total = len([d for d in vdir.iterdir() if d.is_dir()])
            
            # Count existing compiled adx
            dest_vdir = DEST_ROOT / vname
            existing_adx = len(list(dest_vdir.glob("*.adx"))) if dest_vdir.exists() else 0
            
            print(f"{vname:<25} | {len(sega_songs):<10} | {len(matched_pairs):<10} | {existing_adx:<12} | {local_total:<10}")
        print("="*80 + "\n")
        return

    if args.version:
        # Match partial name if user types "02" or "PLUS"
        target_vname = None
        for vname in VERSION_MAP:
            if args.version.lower() == vname.lower() or args.version.lower() in vname.lower():
                target_vname = vname
                break
        if not target_vname:
            print(f"[!] Could not find version matching: {args.version}")
            print(f"Available versions:\n" + "\n".join(f"  - {v}" for v in VERSION_MAP))
            return
        process_version(target_vname, sega_data, dry_run=args.dry_run, force=args.force)

    elif args.all:
        for vname in VERSION_MAP:
            vdir = SOURCE_ROOT / vname
            if vdir.exists():
                process_version(vname, sega_data, dry_run=args.dry_run, force=args.force)

    else:
        # Default: show status and instructions
        print("\n[!] No action specified. Use:")
        print("  python auto_compile_live.py --status                    (View summary of all versions)")
        print("  python auto_compile_live.py --version \"02. maimai PLUS\" (Compile live songs for 1 version)")
        print("  python auto_compile_live.py --version \"02. maimai PLUS\" --dry-run (Preview without writing)")
        print("  python auto_compile_live.py --all                       (Compile live songs across all versions)\n")

if __name__ == "__main__":
    main()
