import os
import sys
import json
import zipfile
import shutil
import tempfile
import mimetypes
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

# Ensure UTF-8 stdout/stderr on Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import auto_compile_live
import config_manager

HOST = '127.0.0.1'
PORT = 5173

def sync_runtime_paths():
    """Synchronizes auto_compile_live paths with active config.json values."""
    conf = config_manager.load_config()
    out_dir = Path(conf.get("output_dir", "./output"))
    
    src_conf = conf.get("source_root", "./songs")
    src_dir = Path(src_conf)
    if not (src_dir.exists() and src_dir.is_dir()):
        home_downloads = Path.home() / "Downloads"
        for cand in [
            Path("./songs"),
            Path("./maisquared"),
            home_downloads / "maimai" / "maisquared",
            home_downloads / "maimai"
        ]:
            if cand.exists() and cand.is_dir():
                src_dir = cand
                break

    auto_compile_live.DEST_ROOT = out_dir
    auto_compile_live.SOURCE_ROOT = src_dir
    return conf

def get_candidate_search_roots():
    """Returns candidate library folders where maimai versions might be located."""
    conf = config_manager.load_config()
    roots = []
    src = conf.get("source_root")
    if src and os.path.isdir(src):
        roots.append(src)
    
    # Generic relative roots
    for rel in ["./songs", "./maisquared", "."]:
        if os.path.isdir(rel) and rel not in roots:
            roots.append(rel)

    # Local user downloads discovery (purely internal for finding charts)
    home_downloads = Path.home() / "Downloads"
    for cand in [
        str(home_downloads / "maimai" / "maisquared"),
        str(home_downloads / "maimai"),
        str(home_downloads),
    ]:
        if os.path.isdir(cand) and cand not in roots:
            roots.append(cand)
    return roots

def resolve_song_folder(source_folder, song_name, explicit_root=None):
    """
    Intelligently finds the exact song directory on disk.
    """
    candidate_roots = []
    if explicit_root and os.path.isdir(explicit_root):
        candidate_roots.append(explicit_root)
    candidate_roots.extend(get_candidate_search_roots())

    # 1. Direct absolute path check
    if source_folder and os.path.isabs(source_folder):
        candidate = os.path.join(source_folder, song_name)
        if os.path.isdir(candidate):
            return candidate

    # 2. Search within candidate library roots
    for root in candidate_roots:
        if not os.path.isdir(root):
            continue

        if source_folder:
            candidate = os.path.join(root, source_folder, song_name)
            if os.path.isdir(candidate):
                return candidate

        candidate = os.path.join(root, song_name)
        if os.path.isdir(candidate):
            return candidate

    # 3. Normalized / fuzzy search
    norm_song = song_name.replace(" ", "").lower()
    for root in candidate_roots:
        if not os.path.isdir(root):
            continue

        if source_folder:
            vdir = os.path.join(root, source_folder)
            if os.path.isdir(vdir):
                for item in os.listdir(vdir):
                    item_path = os.path.join(vdir, item)
                    if os.path.isdir(item_path) and item.replace(" ", "").lower() == norm_song:
                        return item_path

        for item in os.listdir(root):
            item_path = os.path.join(root, item)
            if os.path.isdir(item_path):
                for sub in os.listdir(item_path):
                    sub_path = os.path.join(item_path, sub)
                    if os.path.isdir(sub_path) and sub.replace(" ", "").lower() == norm_song:
                        return sub_path

    return None

def parse_maidata_file(maidata_path):
    """Extract metadata from maidata.txt if present."""
    meta = {"title": "", "artist": "", "bpm": "", "levels": {}}
    if not os.path.isfile(maidata_path):
        return meta
    try:
        with open(maidata_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            if content.startswith('\ufeff'):
                content = content[1:]
            for line in content.splitlines():
                line = line.strip()
                if line.startswith('&title='):
                    meta['title'] = line[7:].strip()
                elif line.startswith('&artist='):
                    meta['artist'] = line[8:].strip()
                elif line.startswith('&bpm='):
                    meta['bpm'] = line[5:].strip()
                elif line.startswith('&lv_1='):
                    meta['levels']['basic'] = line[6:].strip()
                elif line.startswith('&lv_2='):
                    meta['levels']['advanced'] = line[6:].strip()
                elif line.startswith('&lv_3='):
                    meta['levels']['expert'] = line[6:].strip()
                elif line.startswith('&lv_4='):
                    meta['levels']['master'] = line[6:].strip()
                elif line.startswith('&lv_5='):
                    meta['levels']['remaster'] = line[6:].strip()
    except Exception:
        pass
    return meta

class CompilerHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        # 0. API: Get active configuration
        if parsed.path == '/api/config':
            conf = sync_runtime_paths()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "config": conf}, ensure_ascii=False).encode('utf-8'))
            return

        # 1. API: List all versions and their SEGA Live vs Compiled statistics
        elif parsed.path == '/api/versions-summary':
            try:
                sync_runtime_paths()
                sega_data = auto_compile_live.fetch_sega_songs()
                summary = []
                
                # Scan all folders present in SOURCE_ROOT
                discovered_folders = [d.name for d in auto_compile_live.SOURCE_ROOT.iterdir() if d.is_dir()]
                known_names = list(auto_compile_live.VERSION_MAP.keys())
                all_vnames = [k for k in known_names if k in discovered_folders] + [f for f in sorted(discovered_folders) if f not in known_names]

                for vname in all_vnames:
                    vdir = auto_compile_live.SOURCE_ROOT / vname
                    vid = auto_compile_live.VERSION_MAP.get(vname)
                    sega_songs = auto_compile_live.get_sega_songs_for_version(sega_data, vid) if vid else []
                    matched_pairs, skipped_dirs, missing_sega = auto_compile_live.match_local_songs(vdir, sega_songs)
                    local_total = len([d for d in vdir.iterdir() if d.is_dir()])
                    dest_vdir = auto_compile_live.DEST_ROOT / vname
                    compiled_count = len(list(dest_vdir.glob("*.adx"))) if dest_vdir.exists() else 0

                    summary.append({
                        "name": vname,
                        "versionId": vid,
                        "segaLiveCount": len(sega_songs),
                        "matchedCount": len(matched_pairs),
                        "missingCount": len(missing_sega),
                        "compiledCount": compiled_count,
                        "localTotal": local_total,
                        "percent": round((compiled_count / len(matched_pairs) * 100) if matched_pairs else 0, 1)
                    })

                resp = {"success": True, "versions": summary}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                return

        # 2. API: Load songs for a specific version folder directly from disk
        elif parsed.path == '/api/version-songs':
            version_name = qs.get('version', [''])[0]
            if not version_name:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Missing 'version' param"}).encode('utf-8'))
                return

            sync_runtime_paths()
            vdir = auto_compile_live.SOURCE_ROOT / version_name
            if not vdir.exists():
                self.send_response(404)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": f"Folder not found: {version_name}"}).encode('utf-8'))
                return

            try:
                sega_data = auto_compile_live.fetch_sega_songs()
                vid = auto_compile_live.VERSION_MAP.get(version_name)
                sega_songs = auto_compile_live.get_sega_songs_for_version(sega_data, vid) if vid else []
                matched_pairs, skipped_dirs, missing_sega = auto_compile_live.match_local_songs(vdir, sega_songs)
                matched_dict = {pair[0].name: pair[1] for pair in matched_pairs}
                sega_to_local_folder = {pair[1].get("title"): pair[0].name for pair in matched_pairs}

                sega_catalog = []
                for s in sega_songs:
                    s_title = s.get("title", "")
                    matched_folder = sega_to_local_folder.get(s_title)
                    sega_catalog.append({
                        "title": s_title,
                        "artist": s.get("artist", ""),
                        "catcode": s.get("catcode", ""),
                        "version": s.get("version", ""),
                        "levels": {
                            "basic": s.get("lev_bas", ""),
                            "advanced": s.get("lev_adv", ""),
                            "expert": s.get("lev_exp", ""),
                            "master": s.get("lev_mas", ""),
                            "remaster": s.get("lev_remas", "")
                        },
                        "isMatched": matched_folder is not None,
                        "matchedFolder": matched_folder
                    })

                missing_songs = [s for s in sega_catalog if not s["isMatched"]]
                dest_vdir = auto_compile_live.DEST_ROOT / version_name

                songs = []
                for d in sorted(vdir.iterdir(), key=lambda p: p.name):
                    if not d.is_dir():
                        continue
                    
                    is_live = d.name in matched_dict
                    sega_info = matched_dict.get(d.name)
                    adx_path = dest_vdir / f"{d.name}.adx"
                    is_compiled = adx_path.exists()
                    adx_size = adx_path.stat().st_size if is_compiled else 0

                    maidata_path = d / "maidata.txt"
                    meta = parse_maidata_file(str(maidata_path))

                    has_video = any(f.suffix.lower() == '.mp4' for f in d.iterdir() if f.is_file())
                    has_audio = any(f.suffix.lower() in ('.mp3', '.ogg', '.wav') for f in d.iterdir() if f.is_file())
                    total_size = sum(f.stat().st_size for f in d.iterdir() if f.is_file())

                    is_utage = d.name.startswith("[")
                    is_deleted = not is_live and not is_utage

                    songs.append({
                        "name": d.name,
                        "title": meta.get("title") or (sega_info.get("title") if sega_info else d.name),
                        "artist": meta.get("artist") or (sega_info.get("artist") if sega_info else "Unknown Artist"),
                        "levels": meta.get("levels", {}),
                        "bpm": meta.get("bpm", ""),
                        "isLive": is_live,
                        "isCompiled": is_compiled,
                        "isDeleted": is_deleted,
                        "isUtage": is_utage,
                        "adxSize": adx_size,
                        "totalSize": total_size,
                        "hasVideo": has_video,
                        "hasAudio": has_audio,
                        "segaCategory": sega_info.get("catcode") if sega_info else None,
                        "coverUrl": f"/api/song-cover?version={version_name}&song={d.name}"
                    })

                resp = {
                    "success": True,
                    "version": version_name,
                    "versionId": vid,
                    "totalSongs": len(songs),
                    "liveCount": len(matched_pairs),
                    "officialTotal": len(sega_songs),
                    "missingCount": len(missing_songs),
                    "compiledCount": sum(1 for s in songs if s["isCompiled"]),
                    "songs": songs,
                    "segaCatalog": sega_catalog,
                    "missingSongs": missing_songs
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                return

        # 3. API: Serve song cover art from local folder
        elif parsed.path == '/api/song-cover':
            version_name = qs.get('version', [''])[0]
            song_name = qs.get('song', [''])[0]
            if version_name and song_name:
                song_dir = auto_compile_live.SOURCE_ROOT / version_name / song_name
                if song_dir.is_dir():
                    cover_candidates = ["bg.png", "bg.jpg", "bg.jpeg", "cover.png", "cover.jpg"]
                    target_file = None
                    for c in cover_candidates:
                        cand = song_dir / c
                        if cand.is_file():
                            target_file = cand
                            break
                    if not target_file:
                        for f in song_dir.iterdir():
                            if f.is_file() and f.suffix.lower() in ('.png', '.jpg', '.jpeg'):
                                target_file = f
                                break

                    if target_file and target_file.is_file():
                        mime_type, _ = mimetypes.guess_type(str(target_file))
                        self.send_response(200)
                        self.send_header('Content-Type', mime_type or 'image/png')
                        self.send_header('Content-Length', str(target_file.stat().st_size))
                        self.end_headers()
                        with open(target_file, 'rb') as f:
                            self.wfile.write(f.read())
                        return

            self.send_response(404)
            self.end_headers()
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # 1. API: Update active configuration (output_dir, source_root)
        if parsed.path == '/api/config':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            try:
                data = json.loads(post_body.decode('utf-8'))
                updates = {}
                if 'output_dir' in data and data['output_dir']:
                    out_p = data['output_dir'].strip()
                    updates['output_dir'] = out_p
                    try:
                        os.makedirs(out_p, exist_ok=True)
                    except Exception:
                        pass
                if 'source_root' in data and data['source_root']:
                    updates['source_root'] = data['source_root'].strip()

                updated_conf = config_manager.save_config(updates)
                sync_runtime_paths()

                print(f"[CONFIG] Updated: output_dir={updated_conf.get('output_dir')}, source_root={updated_conf.get('source_root')}")
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "config": updated_conf}, ensure_ascii=False).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                return

        elif parsed.path == '/api/compile-song':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            try:
                active_conf = sync_runtime_paths()
                data = json.loads(post_body.decode('utf-8'))
                source_folder = data.get('sourceFolder')
                song_name = data.get('songName')
                source_root = data.get('sourceRoot') or active_conf.get('source_root')
                output_dir = data.get('outputDir') or active_conf.get('output_dir') or str(auto_compile_live.DEST_ROOT)
                exclude_mp4 = data.get('excludeMp4', True)

                if not os.path.isdir(output_dir):
                    os.makedirs(output_dir, exist_ok=True)

                song_folder_path = resolve_song_folder(source_folder, song_name, source_root)

                if not song_folder_path or not os.path.isdir(song_folder_path):
                    err_msg = f"Folder not found on disk for '{source_folder}\\{song_name}'."
                    print(f"[ERROR] {err_msg}")
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": err_msg}, ensure_ascii=False).encode('utf-8'))
                    return

                version_folder_name = os.path.basename(os.path.dirname(song_folder_path)) if song_folder_path else (source_folder or 'Unknown')
                version_output_dir = os.path.join(output_dir, version_folder_name)
                os.makedirs(version_output_dir, exist_ok=True)

                actual_folder_name = os.path.basename(song_folder_path)
                target_adx = os.path.join(version_output_dir, f"{actual_folder_name}.adx")
                if os.path.exists(target_adx):
                    os.remove(target_adx)

                fd, temp_zip = tempfile.mkstemp(suffix='.zip')
                os.close(fd)

                with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                    for root_dir, dirs, files in os.walk(song_folder_path):
                        for f in files:
                            if exclude_mp4 and f.lower().endswith('.mp4'):
                                continue
                            full_file = os.path.join(root_dir, f)
                            rel_path = os.path.relpath(full_file, song_folder_path)
                            zf.write(full_file, arcname=rel_path)

                shutil.move(temp_zip, target_adx)
                file_size = os.path.getsize(target_adx)

                print(f"[COMPILE] {actual_folder_name} -> {target_adx} ({round(file_size / (1024 * 1024), 2)} MB)")

                resp = {
                    "success": True,
                    "songName": actual_folder_name,
                    "targetPath": target_adx,
                    "sizeBytes": file_size,
                    "message": f"Successfully compiled and moved {actual_folder_name}.adx to {version_output_dir}"
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode('utf-8'))
                return

            except Exception as e:
                err_str = str(e)
                print(f"[SERVER ERROR] {err_str}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": err_str}, ensure_ascii=False).encode('utf-8'))
                return

        super().do_POST()

def run():
    active_conf = sync_runtime_paths()
    server_address = (HOST, PORT)
    httpd = HTTPServer(server_address, CompilerHandler)
    print("=" * 60)
    print(f" AstroDX Compiler Server running on http://{HOST}:{PORT}")
    print(f" Source Library: {active_conf.get('source_root')}")
    print(f" Target Output:  {active_conf.get('output_dir')}")
    print(" Press Ctrl+C in terminal to stop.")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    run()
