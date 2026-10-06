import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
EXAMPLE_CONFIG_FILE = BASE_DIR / "config.example.json"

def get_default_config():
    """Generates clean, user-agnostic default configuration paths."""
    return {
        "output_dir": "./output",
        "source_root": "./songs",
        "exclude_mp4": True,
        "compression_level": 6
    }

def load_config():
    """Loads config from config.json with fallback to defaults."""
    config = get_default_config()

    if CONFIG_FILE.is_file():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                user_conf = json.load(f)
                if isinstance(user_conf, dict):
                    config.update(user_conf)
        except Exception as e:
            print(f"[WARN] Failed to read {CONFIG_FILE}: {e}")
    elif EXAMPLE_CONFIG_FILE.is_file():
        try:
            with open(EXAMPLE_CONFIG_FILE, "r", encoding="utf-8") as f:
                ex_conf = json.load(f)
                if isinstance(ex_conf, dict):
                    config.update(ex_conf)
        except Exception:
            pass

    return config

def save_config(updates):
    """Updates config.json with new values and writes to disk."""
    current = load_config()
    if isinstance(updates, dict):
        current.update(updates)

    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[ERROR] Failed to save {CONFIG_FILE}: {e}")

    return current

# Ensure config.json exists locally on import
if not CONFIG_FILE.is_file():
    try:
        save_config(get_default_config())
    except Exception:
        pass
