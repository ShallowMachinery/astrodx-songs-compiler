# AstroDX Song Package Compiler

A batch compiler and archiver that converts maimai chart folders into `.adx` packages for AstroDX. It cross-references songs against official SEGA International servers to identify live songs, missing charts, and compiled statuses.

## Features

- Compiles song directories containing `maidata.txt`, audio, and background images into `.adx` archives.
- Automatically excludes background `.mp4` video files to optimize file size and performance.
- Cross-references local charts with SEGA's official song catalog to match international live releases.
- Offers both an interactive web dashboard and a command-line interface.
- Configurable source library and output package destinations.

## Prerequisites

- Python 3.8 or higher.
- A modern web browser (Google Chrome, Microsoft Edge, Brave, etc.).

## Quick Start (Web Interface)

1. Start the local server:
   - On Windows: double-click `launch.bat` or run:
     ```bash
     python server.py
     ```
2. Open `http://localhost:5173` in your browser.
3. Select your chart library:
   - Click "Open Folder..." and choose your maimai version folder (e.g. `01. maimai`) or the root folder containing all version subdirectories.
4. Set the destination folder:
   - By default, compiled `.adx` files are saved to `./output`.
   - Enter a custom folder path in the destination input or click "Browse Folder...".
5. Compile songs:
   - Click "Compile" next to any song in the list.
   - Click "Compile All Live" to compile only currently active international songs.
   - Click "All Versions Status" to view the global dashboard and run batch compilation across all game versions.

## Command-Line Usage

You can also run batch tasks directly from the terminal using `auto_compile_live.py`:

- Check the live match status across all game versions:
  ```bash
  python auto_compile_live.py --status
  ```

- Compile live songs for a specific version:
  ```bash
  python auto_compile_live.py --version "02. maimai PLUS"
  ```

- Compile live songs across all available versions:
  ```bash
  python auto_compile_live.py --all
  ```

- Preview matching without writing files:
  ```bash
  python auto_compile_live.py --version "02. maimai PLUS" --dry-run
  ```

- Specify custom source and output folders:
  ```bash
  python auto_compile_live.py --version "02. maimai PLUS" --source "./songs" --output "./output"
  ```

- Force re-compilation of existing `.adx` files:
  ```bash
  python auto_compile_live.py --all --force
  ```

## Configuration

Default settings can be defined in `config.json`. You can copy `config.example.json` to get started:

```json
{
  "output_dir": "./output",
  "source_root": "./songs",
  "exclude_mp4": true,
  "compression_level": 6
}
```

- `output_dir`: Path where compiled `.adx` packages are stored.
- `source_root`: Root path containing maimai version folders.
- `exclude_mp4`: When set to `true`, video files are skipped during packaging.
- `compression_level`: Zip compression level from 1 (fastest) to 9 (maximum compression). Default is 6.

## Output Structure

Compiled packages are organized into version subfolders within the output directory:

```
output/
  01. maimai/
    Song_A.adx
    Song_B.adx
  02. maimai PLUS/
    Song_C.adx
```
