<#
.SYNOPSIS
    AstroDX Song Package Compiler (.adx)
.DESCRIPTION
    Scans song folders in a maimai version directory, compresses all chart files
    (maidata.txt, track.mp3/ogg, bg.jpg/png, etc.) while skipping .mp4 videos,
    and moves [SongName].adx directly into [OutputPath]\[version folder]\
.PARAMETER TargetPath
    Path to the maimai version directory (e.g. '01. maimai')
.PARAMETER OutputPath
    Root destination directory where version folders will be created. Default is "$HOME\Downloads\AstroDX".
#>

param(
    [string]$TargetPath = ".",
    [string]$OutputPath = "$HOME\Downloads\AstroDX"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resolvedSource = (Resolve-Path $TargetPath).Path
$versionName = Split-Path $resolvedSource -Leaf
$versionOutputPath = Join-Path $OutputPath $versionName

if (-not (Test-Path -LiteralPath $versionOutputPath)) {
    Write-Host "Creating output directory: $versionOutputPath" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $versionOutputPath -Force | Out-Null
}

$resolvedOutput = (Resolve-Path $versionOutputPath).Path

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " AstroDX Song Package Compiler (.adx)" -ForegroundColor Cyan
Write-Host " Source:      $resolvedSource" -ForegroundColor Yellow
Write-Host " Destination: $resolvedOutput" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Cyan

Get-ChildItem -LiteralPath $resolvedSource -Directory | ForEach-Object {
    $folder = $_
    $adxPath = Join-Path $resolvedOutput ($folder.Name + ".adx")

    Write-Host "Compressing: $($folder.Name)" -ForegroundColor Yellow

    # Remove existing ADX if present in destination
    if (Test-Path -LiteralPath $adxPath) {
        Remove-Item -LiteralPath $adxPath -Force
    }

    # Create temporary ZIP
    $tempZip = Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString() + ".zip")

    # Get everything except MP4 files
    $files = Get-ChildItem -LiteralPath $folder.FullName -File -Recurse |
        Where-Object { $_.Extension -ne ".mp4" }

    # Create the ZIP
    $zip = [System.IO.Compression.ZipFile]::Open(
        $tempZip,
        [System.IO.Compression.ZipArchiveMode]::Create
    )

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($folder.FullName.Length + 1)

        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $file.FullName,
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        )
    }

    $zip.Dispose()

    # Move directly to the AstroDX version destination folder as .adx
    Move-Item -LiteralPath $tempZip -Destination $adxPath -Force

    $sizeMb = [math]::Round((Get-Item -LiteralPath $adxPath).Length / 1MB, 2)
    Write-Host "  -> Moved to: $versionName\$($folder.Name).adx ($sizeMb MB)" -ForegroundColor Green
}

Write-Host "`nDone! All compiled .adx packages moved to: $resolvedOutput" -ForegroundColor Cyan
