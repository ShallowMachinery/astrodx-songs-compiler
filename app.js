/**
 * AstroDX Song Package Compiler (.adx)
 * High-performance batch compressor for maimai chart packages.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    isNativeFSAccess: false,
    parentDirHandle: null,
    outputDirHandle: null,
    outputFolderName: '',
    sourceRoot: '',
    currentFolderName: '',
    songs: [], // Array of Song objects
    selectedSongNames: new Set(),
    isCompiling: false,
    shouldCancel: false,
    filter: 'all',
    searchQuery: '',
    logEntries: [],
    savedSpaceBytes: 0,
    compressionLevel: 6,
    viewMode: localStorage.getItem('astrodx_view_mode') || 'list',
    versionsSummary: [],
    currentVersionInfo: null,
    segaCatalog: [],
    missingSongs: [],
    catalogFilter: 'all',
    catalogSearchQuery: ''
  };

  // DOM Elements
  const elements = {
    btnOpenDashboard: document.getElementById('btn-open-dashboard'),
    selectVersionQuick: document.getElementById('select-version-quick'),
    btnSelectDir: document.getElementById('btn-select-directory'),
    btnSelectOutputDir: document.getElementById('btn-select-output-directory'),
    inputOutputPath: document.getElementById('input-output-path'),
    btnSaveOutputPath: document.getElementById('btn-save-output-path'),
    outputSaveBadge: document.getElementById('output-save-badge'),
    currentOutputPath: document.getElementById('current-output-path'),
    outputFolderBox: document.getElementById('output-folder-box'),
    btnBrowseFallback: document.getElementById('btn-browse-fallback'),
    inputFolderPicker: document.getElementById('input-folder-picker'),
    folderDropZone: document.getElementById('folder-drop-zone'),
    currentFolderPath: document.getElementById('current-folder-path'),
    folderLabelText: document.getElementById('folder-label-text'),
    systemStatusDot: document.getElementById('system-status-dot'),
    systemStatusText: document.getElementById('system-status-text'),

    folderSelectionCard: document.getElementById('folder-selection-card'),
    statsRibbonCard: document.getElementById('stats-ribbon-card'),
    btnViewList: document.getElementById('btn-view-list'),
    btnViewGrid: document.getElementById('btn-view-grid'),
    btnToggleCompact: document.getElementById('btn-toggle-compact'),
    compactToggleIcon: document.getElementById('compact-toggle-icon'),
    compactToggleText: document.getElementById('compact-toggle-text'),

    chkExcludeMp4: document.getElementById('chk-exclude-mp4'),
    chkOverwrite: document.getElementById('chk-overwrite'),
    selectCompression: document.getElementById('select-compression'),
    btnShowPsScript: document.getElementById('btn-show-ps-script'),

    statTotalSongs: document.getElementById('stat-total-songs'),
    statTotalFiles: document.getElementById('stat-total-files'),
    statCompiledCount: document.getElementById('stat-compiled-count'),
    statCompiledDesc: document.getElementById('stat-compiled-desc'),
    statPendingCount: document.getElementById('stat-pending-count'),
    statSavedSpace: document.getElementById('stat-saved-space'),
    statVideoCount: document.getElementById('stat-video-count'),

    masterProgressContainer: document.getElementById('master-progress-container'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressPercentageLabel: document.getElementById('progress-percentage-label'),
    progressMainTitle: document.getElementById('progress-main-title'),
    btnCancelCompilation: document.getElementById('btn-cancel-compilation'),

    inputSearch: document.getElementById('input-search'),
    filterButtons: document.querySelectorAll('.filter-pill'),
    countAll: document.getElementById('count-all'),
    countLive: document.getElementById('count-live'),
    countPending: document.getElementById('count-pending'),
    countCompiled: document.getElementById('count-compiled'),
    countDeleted: document.getElementById('count-deleted'),
    countUtage: document.getElementById('count-utage'),

    btnSelectAll: document.getElementById('btn-select-all'),
    btnSelectLive: document.getElementById('btn-select-live'),
    liveSelectableCount: document.getElementById('live-selectable-count'),
    btnCompileSelected: document.getElementById('btn-compile-selected'),
    selectedCount: document.getElementById('selected-count'),
    btnCompileAllLive: document.getElementById('btn-compile-all-live'),
    btnCompileAll: document.getElementById('btn-compile-all'),

    songsGridContainer: document.getElementById('songs-grid-container'),
    emptyStateView: document.getElementById('empty-state-view'),
    btnEmptySelect: document.getElementById('btn-empty-select'),

    terminalBodyOutput: document.getElementById('terminal-body-output'),
    btnClearLog: document.getElementById('btn-clear-log'),
    btnCopyLog: document.getElementById('btn-copy-log'),

    dashboardModalOverlay: document.getElementById('dashboard-modal-overlay'),
    btnCloseDashboard: document.getElementById('btn-close-dashboard'),
    btnCloseDashboardBottom: document.getElementById('btn-close-dashboard-bottom'),
    btnDashCompileAll: document.getElementById('btn-dash-compile-all'),
    btnDashRefresh: document.getElementById('btn-dash-refresh'),
    dashboardTableBody: document.getElementById('dashboard-table-body'),
    dashTotalVersions: document.getElementById('dash-total-versions'),
    dashTotalLive: document.getElementById('dash-total-live'),
    dashTotalCompiled: document.getElementById('dash-total-compiled'),
    dashTotalPending: document.getElementById('dash-total-pending'),
    dashActionStatus: document.getElementById('dash-action-status'),

    scriptModalOverlay: document.getElementById('script-modal-overlay'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCloseModalBottom: document.getElementById('btn-close-modal-bottom'),
    btnCopyPsCode: document.getElementById('btn-copy-ps-code'),
    modalPsCode: document.getElementById('modal-ps-code'),

    btnOpenCatalog: document.getElementById('btn-open-catalog'),
    btnCatalogCount: document.getElementById('btn-catalog-count'),
    filterMissing: document.getElementById('filter-missing'),
    countMissing: document.getElementById('count-missing'),

    catalogModalOverlay: document.getElementById('catalog-modal-overlay'),
    btnCloseCatalog: document.getElementById('btn-close-catalog'),
    btnCloseCatalogBottom: document.getElementById('btn-close-catalog-bottom'),
    catalogVersionTitle: document.getElementById('catalog-version-title'),
    catStatTotal: document.getElementById('cat-stat-total'),
    catStatMatched: document.getElementById('cat-stat-matched'),
    catStatMissing: document.getElementById('cat-stat-missing'),
    inputCatalogSearch: document.getElementById('input-catalog-search'),
    catalogTableBody: document.getElementById('catalog-table-body'),
    catalogAlertBanner: document.getElementById('catalog-alert-banner'),
    catFilterButtons: document.querySelectorAll('[data-catfilter]'),
    catCountAll: document.getElementById('cat-count-all'),
    catCountMatched: document.getElementById('cat-count-matched'),
    catCountMissing: document.getElementById('cat-count-missing')
  };

  // Check File System Access API support
  const hasDirectoryPicker = typeof window.showDirectoryPicker === 'function';

  // Load configuration from local storage and backend API
  async function initAppConfig() {
    const cachedOutput = localStorage.getItem('astrodx_output_path');
    const isPersonalUserPath = (p) => p && (/\\users\\[^\\]+/i.test(p) || /\/home\/[^\/]+/i.test(p));

    if (cachedOutput && !isPersonalUserPath(cachedOutput)) {
      state.outputFolderName = cachedOutput;
      if (elements.inputOutputPath) elements.inputOutputPath.value = cachedOutput;
      if (elements.currentOutputPath) elements.currentOutputPath.textContent = cachedOutput;
    } else {
      localStorage.removeItem('astrodx_output_path');
      state.outputFolderName = './output';
      if (elements.inputOutputPath) elements.inputOutputPath.value = './output';
      if (elements.currentOutputPath) elements.currentOutputPath.textContent = './output';
    }

    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.config) {
          const conf = json.config;
          let out = conf.output_dir || './output';
          if (isPersonalUserPath(out)) {
            out = './output';
          }
          state.outputFolderName = out;
          if (elements.inputOutputPath) elements.inputOutputPath.value = out;
          if (elements.currentOutputPath) elements.currentOutputPath.textContent = out;
          if (conf.source_root && !isPersonalUserPath(conf.source_root)) {
            state.sourceRoot = conf.source_root;
          }
        }
      }
    } catch (e) {
      if (!state.outputFolderName) {
        state.outputFolderName = './output';
        if (elements.inputOutputPath) elements.inputOutputPath.value = './output';
        if (elements.currentOutputPath) elements.currentOutputPath.textContent = './output';
      }
    }
  }

  // Save new output path to state, localStorage, and backend config
  async function saveOutputLocation(customPath) {
    const newPath = (customPath !== undefined ? customPath : (elements.inputOutputPath ? elements.inputOutputPath.value : '')).trim();
    if (!newPath) return;

    state.outputFolderName = newPath;
    if (elements.inputOutputPath) elements.inputOutputPath.value = newPath;
    if (elements.currentOutputPath) {
      elements.currentOutputPath.textContent = `${newPath}${state.currentFolderName ? '\\' + state.currentFolderName : ''}`;
    }
    localStorage.setItem('astrodx_output_path', newPath);

    if (elements.outputSaveBadge) {
      elements.outputSaveBadge.style.display = 'inline-flex';
      setTimeout(() => {
        if (elements.outputSaveBadge) elements.outputSaveBadge.style.display = 'none';
      }, 2500);
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_dir: newPath })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          log(`Output destination saved: ${newPath}`, 'accent');
        }
      }
    } catch (e) {
      // Local server not responding
    }

    updatePSModalScript();

    // Reload active version view or summary if currently rendered
    if (state.currentVersionInfo && state.currentVersionInfo.name) {
      loadVersionDirectly(state.currentVersionInfo.name);
    }
    if (state.versionsSummary && state.versionsSummary.length > 0) {
      loadVersionsSummary();
    }
  }

  // Initialize
  async function init() {
    await initAppConfig();
    setupEventListeners();
    updatePSModalScript();
    setViewMode(state.viewMode, false);

    if (!hasDirectoryPicker) {
      elements.btnSelectDir.innerHTML = '<span>📂 Open via Dialog</span>';
    }

    // Load available versions summary from server and pre-load 02. maimai PLUS or 01. maimai
    await loadVersionsSummary();
    if (state.versionsSummary && state.versionsSummary.length > 0) {
      // Default to 02. maimai PLUS if available, otherwise first
      const defaultVer = state.versionsSummary.find(v => v.name.includes('PLUS')) || state.versionsSummary[0];
      if (defaultVer) {
        if (elements.selectVersionQuick) elements.selectVersionQuick.value = defaultVer.name;
        await loadVersionDirectly(defaultVer.name);
      }
    }
  }

  // Event Listeners
  function setupEventListeners() {
    // Quick Version Dropdown (Server Direct Load)
    if (elements.selectVersionQuick) {
      elements.selectVersionQuick.addEventListener('change', (e) => {
        if (e.target.value) loadVersionDirectly(e.target.value);
      });
    }

    // Dashboard Modal Buttons
    if (elements.btnOpenDashboard) elements.btnOpenDashboard.addEventListener('click', openDashboard);
    if (elements.btnCloseDashboard) elements.btnCloseDashboard.addEventListener('click', closeDashboard);
    if (elements.btnCloseDashboardBottom) elements.btnCloseDashboardBottom.addEventListener('click', closeDashboard);
    if (elements.dashboardModalOverlay) {
      elements.dashboardModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.dashboardModalOverlay) closeDashboard();
      });
    }
    if (elements.btnDashRefresh) elements.btnDashRefresh.addEventListener('click', loadVersionsSummary);
    if (elements.btnDashCompileAll) elements.btnDashCompileAll.addEventListener('click', startBatchCompileAllVersions);

    // Live Select & Compile Actions
    if (elements.btnSelectLive) elements.btnSelectLive.addEventListener('click', selectLiveOnly);
    if (elements.btnCompileAllLive) elements.btnCompileAllLive.addEventListener('click', compileLiveOnly);

    // Catalog Modal Listeners
    if (elements.btnOpenCatalog) elements.btnOpenCatalog.addEventListener('click', openCatalogModal);
    if (elements.btnCloseCatalog) elements.btnCloseCatalog.addEventListener('click', closeCatalogModal);
    if (elements.btnCloseCatalogBottom) elements.btnCloseCatalogBottom.addEventListener('click', closeCatalogModal);
    if (elements.catalogModalOverlay) {
      elements.catalogModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.catalogModalOverlay) closeCatalogModal();
      });
    }

    if (elements.inputCatalogSearch) {
      elements.inputCatalogSearch.addEventListener('input', (e) => {
        state.catalogSearchQuery = e.target.value;
        renderCatalogTable();
      });
    }

    if (elements.catFilterButtons) {
      elements.catFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          elements.catFilterButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.catalogFilter = btn.dataset.catfilter;
          renderCatalogTable();
        });
      });
    }

    // Select Folder Buttons
    elements.btnSelectDir.addEventListener('click', handleSelectFolder);
    elements.btnEmptySelect.addEventListener('click', handleSelectFolder);
    elements.btnSelectOutputDir.addEventListener('click', handleSelectOutputFolder);
    if (elements.btnSaveOutputPath) elements.btnSaveOutputPath.addEventListener('click', () => saveOutputLocation());
    if (elements.inputOutputPath) {
      elements.inputOutputPath.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveOutputLocation();
        }
      });
      elements.inputOutputPath.addEventListener('change', () => saveOutputLocation());
    }
    elements.btnBrowseFallback.addEventListener('click', () => elements.inputFolderPicker.click());
    elements.inputFolderPicker.addEventListener('change', handleFallbackFileSelect);

    // View Mode Switcher
    if (elements.btnViewList) elements.btnViewList.addEventListener('click', () => setViewMode('list'));
    if (elements.btnViewGrid) elements.btnViewGrid.addEventListener('click', () => setViewMode('grid'));

    // Compact Toggle Button
    let isCompact = false;
    if (elements.btnToggleCompact) {
      elements.btnToggleCompact.addEventListener('click', () => {
        isCompact = !isCompact;
        if (elements.folderSelectionCard) elements.folderSelectionCard.classList.toggle('is-collapsed', isCompact);
        if (elements.statsRibbonCard) elements.statsRibbonCard.classList.toggle('is-collapsed', isCompact);
        if (elements.compactToggleText) elements.compactToggleText.textContent = isCompact ? 'Expand' : 'Compact';
        if (elements.compactToggleIcon) elements.compactToggleIcon.textContent = isCompact ? '▼' : '↕';
      });
    }

    // Drag and Drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.folderDropZone.classList.add('active');
    });
    window.addEventListener('dragleave', () => elements.folderDropZone.classList.remove('active'));
    window.addEventListener('drop', handleWindowDrop);

    // Options
    elements.selectCompression.addEventListener('change', (e) => {
      state.compressionLevel = parseInt(e.target.value, 10);
    });

    // Compiling Actions
    if (elements.btnCompileAll) elements.btnCompileAll.addEventListener('click', () => startBatchCompilation(state.songs));
    elements.btnCompileSelected.addEventListener('click', () => {
      const selected = state.songs.filter(s => state.selectedSongNames.has(s.name));
      startBatchCompilation(selected);
    });
    elements.btnCancelCompilation.addEventListener('click', () => {
      state.shouldCancel = true;
      log('Stop requested. Finishing current song...', 'work');
    });

    // Selection Controls
    elements.btnSelectAll.addEventListener('click', toggleSelectAll);

    // Search and Filters
    elements.inputSearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderSongGrid();
    });

    elements.filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        renderSongGrid();
      });
    });

    // Terminal Controls
    elements.btnClearLog.addEventListener('click', () => {
      elements.terminalBodyOutput.innerHTML = '';
      state.logEntries = [];
    });
    elements.btnCopyLog.addEventListener('click', () => {
      const text = state.logEntries.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert('Terminal log copied to clipboard!');
      });
    });

    // Modal
    elements.btnShowPsScript.addEventListener('click', () => {
      updatePSModalScript();
      elements.scriptModalOverlay.classList.add('active');
    });
    elements.btnCloseModal.addEventListener('click', () => elements.scriptModalOverlay.classList.remove('active'));
    elements.btnCloseModalBottom.addEventListener('click', () => elements.scriptModalOverlay.classList.remove('active'));
    elements.scriptModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.scriptModalOverlay) elements.scriptModalOverlay.classList.remove('active');
    });
    elements.btnCopyPsCode.addEventListener('click', () => {
      navigator.clipboard.writeText(elements.modalPsCode.textContent).then(() => {
        elements.btnCopyPsCode.textContent = '✓ Copied!';
        setTimeout(() => elements.btnCopyPsCode.textContent = '📋 Copy PowerShell Code', 2000);
      });
    });
  }

  // Logging function matching PowerShell behavior
  function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    state.logEntries.push(line);

    const row = document.createElement('div');
    row.className = 'log-line';

    let colorClass = 'log-type-info';
    if (type === 'success') colorClass = 'log-type-success';
    else if (type === 'work') colorClass = 'log-type-work';
    else if (type === 'error') colorClass = 'log-type-error';
    else if (type === 'accent') colorClass = 'log-type-accent';

    row.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="${colorClass}">${escapeHtml(message)}</span>
    `;

    elements.terminalBodyOutput.appendChild(row);
    elements.terminalBodyOutput.scrollTop = elements.terminalBodyOutput.scrollHeight;
  }

  // Handle Directory Picker (Native File System Access)
  async function handleSelectFolder() {
    if (!hasDirectoryPicker) {
      elements.inputFolderPicker.click();
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      state.isNativeFSAccess = true;
      state.parentDirHandle = dirHandle;
      state.currentFolderName = dirHandle.name;

      elements.folderLabelText.textContent = `Active Folder: ${dirHandle.name}`;
      elements.currentFolderPath.textContent = `Direct Disk Access Enabled: ${dirHandle.name}`;
      elements.currentOutputPath.textContent = `${state.outputFolderName}\\${dirHandle.name}`;
      elements.folderDropZone.classList.add('active');

      log(`Opened folder: ${dirHandle.name}`, 'accent');
      await scanDirectoryHandle(dirHandle);

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Native picker failed or cancelled, falling back:', err);
      elements.inputFolderPicker.click();
    }
  }

  // Handle Output Directory Picker (AstroDX folder)
  async function handleSelectOutputFolder() {
    if (!hasDirectoryPicker) {
      alert('Directory picker requires a modern Chromium browser on http://localhost or https. Run launch.bat to enable direct folder access.');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      state.outputDirHandle = dirHandle;
      state.outputFolderName = dirHandle.name;
      if (elements.inputOutputPath) elements.inputOutputPath.value = dirHandle.name;
      elements.currentOutputPath.textContent = `${dirHandle.name}${state.currentFolderName ? '\\' + state.currentFolderName : ''}`;
      elements.outputFolderBox.classList.add('active');
      log(`Output destination set to: ${dirHandle.name}`, 'accent');
      saveOutputLocation(dirHandle.name);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Failed setting output directory:', err);
    }
  }

  // Scan folder via DirectoryHandle
  async function scanDirectoryHandle(dirHandle) {
    updateSystemStatus('Scanning folder...', true);

    const subDirs = [];
    const existingAdxFiles = new Set();

    // First pass: collect files and subdirectories
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.adx')) {
        existingAdxFiles.add(entry.name.toLowerCase());
      } else if (entry.kind === 'directory') {
        subDirs.push(entry);
      }
    }

    // Check if user selected the library root (e.g. "maisquared") containing version folders (e.g. "01. maimai")
    const isLibraryRoot = subDirs.some(d => /^\d{2}\./.test(d.name) || d.name.toLowerCase().includes('maimai'));
    if (isLibraryRoot) {
      log(`Opened library root: ${dirHandle.name} with ${subDirs.length} version folders.`, 'accent');
      state.libraryRootHandle = dirHandle;

      // Sort version folders (01, 02, ...)
      subDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      // Populate dropdown with all discovered version folders
      if (elements.selectVersionQuick) {
        elements.selectVersionQuick.innerHTML = '<option value="">-- Choose Maimai Version --</option>';
        for (const vFolder of subDirs) {
          const opt = document.createElement('option');
          opt.value = vFolder.name;
          opt.textContent = vFolder.name;
          elements.selectVersionQuick.appendChild(opt);
        }
      }

      elements.folderLabelText.textContent = `Library Root: ${dirHandle.name}`;
      elements.currentFolderPath.textContent = `Library Root: ${dirHandle.name} (${subDirs.length} version folders loaded into dropdown)`;

      // Auto-load first version
      const firstVer = subDirs.find(d => d.name.startsWith('01.')) || subDirs[0];
      if (firstVer) {
        if (elements.selectVersionQuick) elements.selectVersionQuick.value = firstVer.name;
        log(`Switching to: ${firstVer.name}...`, 'info');
        await loadVersionDirectly(firstVer.name);
      }
      return;
    }

    state.songs = [];
    state.selectedSongNames.clear();

    log(`Found ${subDirs.length} song folder(s) and ${existingAdxFiles.size} existing .adx file(s).`, 'info');

    let totalSavedSpace = 0;

    for (const songHandle of subDirs) {
      const songData = await inspectSongDirectoryHandle(songHandle, existingAdxFiles);
      state.songs.push(songData);
      totalSavedSpace += songData.videoSize;
    }

    // Sort alphabetically
    state.songs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    state.savedSpaceBytes = totalSavedSpace;
    updateStats();
    renderSongGrid();
    updateSystemStatus('Ready', false);
    log(`Scanned ${state.songs.length} song folders successfully.`, 'success');
  }

  // Inspect files within a song DirectoryHandle
  async function inspectSongDirectoryHandle(songHandle, existingAdxFiles) {
    const songName = songHandle.name;
    const adxExpected = `${songName}.adx`.toLowerCase();
    const isCompiled = existingAdxFiles.has(adxExpected);

    const files = [];
    let maidataText = null;
    let coverBlob = null;
    let totalSize = 0;
    let videoSize = 0;
    let hasAudio = false;
    let hasVideo = false;

    // Recursive file walker for song folder
    async function walk(handle, subPath = '') {
      for await (const entry of handle.values()) {
        const relPath = subPath ? `${subPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          files.push({ path: relPath, file, name: entry.name, size: file.size });
          totalSize += file.size;

          const ext = getExtension(entry.name);
          if (ext === '.mp4') {
            hasVideo = true;
            videoSize += file.size;
          } else if (['.mp3', '.ogg', '.wav'].includes(ext)) {
            hasAudio = true;
          }

          if (entry.name.toLowerCase() === 'maidata.txt' && !maidataText) {
            try {
              maidataText = await file.text();
            } catch (e) {
              console.error('Failed reading maidata.txt', e);
            }
          }

          if ((entry.name.toLowerCase().startsWith('bg.') || ext === '.png' || ext === '.jpg' || ext === '.jpeg') && !coverBlob) {
            coverBlob = file;
          }
        } else if (entry.kind === 'directory') {
          // Skip autosave or temp directories
          if (!entry.name.startsWith('.')) {
            await walk(entry, relPath);
          }
        }
      }
    }

    await walk(songHandle);

    const meta = parseMaidata(maidataText, songName);
    const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : null;

    return {
      name: songName,
      handle: songHandle,
      files: files,
      isCompiled: isCompiled,
      title: meta.title || songName,
      artist: meta.artist || 'Unknown Artist',
      levels: meta.levels,
      bpm: meta.bpm,
      totalSize: totalSize,
      videoSize: videoSize,
      effectiveSize: totalSize - videoSize,
      hasAudio: hasAudio,
      hasVideo: hasVideo,
      coverUrl: coverUrl,
      sourceType: 'handle'
    };
  }

  // Handle Drag & Drop
  async function handleWindowDrop(e) {
    e.preventDefault();
    elements.folderDropZone.classList.remove('active');

    // Check DataTransferItem for FileSystemHandle
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0];
      if (typeof item.getAsFileSystemHandle === 'function') {
        const handle = await item.getAsFileSystemHandle();
        if (handle && handle.kind === 'directory') {
          state.isNativeFSAccess = true;
          state.parentDirHandle = handle;
          state.currentFolderName = handle.name;
          elements.folderLabelText.textContent = `Active Folder: ${handle.name}`;
          elements.currentFolderPath.textContent = `Direct Disk Access Enabled: ${handle.name}`;
          await scanDirectoryHandle(handle);
          return;
        }
      }
    }

    // Fallback: parse File list
    const fileList = Array.from(e.dataTransfer.files);
    if (fileList.length > 0) {
      processFileList(fileList);
    }
  }

  // Handle Fallback file input change
  function handleFallbackFileSelect(e) {
    const fileList = Array.from(e.target.files);
    if (fileList.length > 0) {
      processFileList(fileList);
    }
  }

  // Process standard File[] from input or drop
  async function processFileList(fileList) {
    updateSystemStatus('Scanning files...', true);
    state.isNativeFSAccess = false;
    state.parentDirHandle = null;

    // Group files by top-level or song folder
    const songGroups = new Map();
    const existingAdxFiles = new Set();

    let rootName = 'Selected Folder';

    for (const file of fileList) {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.split('/');

      if (parts.length === 1) {
        // Direct file
        if (file.name.toLowerCase().endsWith('.adx')) {
          existingAdxFiles.add(file.name.toLowerCase());
        }
      } else if (parts.length >= 2) {
        rootName = parts[0];
        // If depth is root/song/file
        let songName = parts[1];
        let subPath = parts.slice(2).join('/');

        // Special case: if user selected a single song folder directly
        if (parts.length === 2) {
          songName = parts[0];
          subPath = parts[1];
        }

        if (subPath.toLowerCase().endsWith('.adx')) {
          existingAdxFiles.add(subPath.toLowerCase());
          continue;
        }

        if (!songGroups.has(songName)) {
          songGroups.set(songName, []);
        }

        songGroups.get(songName).push({
          path: subPath,
          file: file,
          name: file.name,
          size: file.size
        });
      }
    }

    state.currentFolderName = rootName;
    elements.folderLabelText.textContent = `Loaded Folder: ${rootName}`;
    elements.currentFolderPath.textContent = `Browser Memory Mode: ${rootName} (${songGroups.size} songs found)`;

    log(`Loaded folder via browser dialog: ${rootName} (${songGroups.size} songs)`, 'info');

    state.songs = [];
    state.selectedSongNames.clear();
    let totalSavedSpace = 0;

    for (const [songName, files] of songGroups.entries()) {
      let maidataText = null;
      let coverBlob = null;
      let totalSize = 0;
      let videoSize = 0;
      let hasAudio = false;
      let hasVideo = false;

      for (const item of files) {
        totalSize += item.size;
        const ext = getExtension(item.name);
        if (ext === '.mp4') {
          hasVideo = true;
          videoSize += item.size;
        } else if (['.mp3', '.ogg', '.wav'].includes(ext)) {
          hasAudio = true;
        }

        if (item.name.toLowerCase() === 'maidata.txt' && !maidataText) {
          try {
            maidataText = await item.file.text();
          } catch (e) {
            console.error('Failed reading maidata.txt', e);
          }
        }

        if ((item.name.toLowerCase().startsWith('bg.') || ext === '.png' || ext === '.jpg' || ext === '.jpeg') && !coverBlob) {
          coverBlob = item.file;
        }
      }

      const isCompiled = existingAdxFiles.has(`${songName}.adx`.toLowerCase());
      const meta = parseMaidata(maidataText, songName);
      const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : null;

      state.songs.push({
        name: songName,
        files: files,
        isCompiled: isCompiled,
        title: meta.title || songName,
        artist: meta.artist || 'Unknown Artist',
        levels: meta.levels,
        bpm: meta.bpm,
        totalSize: totalSize,
        videoSize: videoSize,
        effectiveSize: totalSize - videoSize,
        hasAudio: hasAudio,
        hasVideo: hasVideo,
        coverUrl: coverUrl,
        sourceType: 'filelist'
      });

      totalSavedSpace += videoSize;
    }

    state.songs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    state.savedSpaceBytes = totalSavedSpace;

    updateStats();
    renderSongGrid();
    updateSystemStatus('Ready', false);
    log(`Successfully loaded ${state.songs.length} song folders into memory.`, 'success');
  }

  // Parse maidata.txt for title, artist, BPM, difficulty levels
  function parseMaidata(content, fallbackName) {
    if (!content) return { title: fallbackName, artist: '', levels: {}, bpm: '' };

    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const lines = content.split(/\r?\n/);
    let title = fallbackName;
    let artist = '';
    let bpm = '';
    const levels = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('&') || !line.includes('=')) continue;

      const splitIdx = line.indexOf('=');
      const key = line.substring(1, splitIdx).trim().toLowerCase();
      const val = line.substring(splitIdx + 1).trim();

      if (key === 'title' && val) title = val;
      else if (key === 'artist' && val) artist = val;
      else if (key === 'first' || key === 'wholebpm') bpm = val;
      else if (key.startsWith('lv_') || key.startsWith('dx_lev_')) {
        const num = key.replace(/^(lv_|dx_lev_)/, '');
        levels[num] = val;
      }
    }

    return { title, artist, levels, bpm };
  }

  // Compiling a single song
  async function compileSong(song, onProgress) {
    const excludeMp4 = elements.chkExcludeMp4.checked;
    const compressionLevel = state.compressionLevel;

    log(`Compressing: ${song.name}`, 'work');

    // First: Check if local backend server is running (via launch.bat)
    let compiledViaServer = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/compile-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRoot: state.sourceRoot || undefined,
          sourceFolder: state.currentFolderName,
          songName: song.name,
          outputDir: state.outputFolderName || undefined,
          excludeMp4: excludeMp4
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          compiledViaServer = true;
          log(`  -> Moved to AstroDX: ${json.songName || song.name}.adx (${formatBytes(json.sizeBytes)})`, 'success');
        }
      }
    } catch (e) {
      // Local server not responding, fallback to client-side JSZip
    }

    if (!compiledViaServer) {
      if (!song.files || song.files.length === 0) {
        throw new Error(`Server compilation failed for ${song.name} and no browser file handles available.`);
      }
      const zip = new JSZip();
      let filesToInclude = song.files;

      if (excludeMp4) {
        filesToInclude = filesToInclude.filter(f => !f.name.toLowerCase().endsWith('.mp4'));
      }

      for (const item of filesToInclude) {
        // Use relative path within the song folder
        const archivePath = item.path || item.name;
        zip.file(archivePath, item.file);
      }

      // Generate ZIP blob
      const compressionType = compressionLevel === 0 ? 'STORE' : 'DEFLATE';
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: compressionType,
        compressionOptions: { level: compressionLevel }
      }, (meta) => {
        if (typeof onProgress === 'function') {
          onProgress(meta.percent);
        }
      });

      const adxFileName = `${song.name}.adx`;

      // Save directly to destination folder (AstroDX\[version]) if set, otherwise parent dir
      let targetDirHandle = state.outputDirHandle || state.parentDirHandle;

      if (state.isNativeFSAccess && targetDirHandle) {
        try {
          let destinationHandle = targetDirHandle;
          let targetLabel = state.outputFolderName || 'folder';
          if (state.outputDirHandle && state.currentFolderName) {
            destinationHandle = await state.outputDirHandle.getDirectoryHandle(state.currentFolderName, { create: true });
            targetLabel = `${state.outputFolderName}\\${state.currentFolderName}`;
          }

          const fileHandle = await destinationHandle.getFileHandle(adxFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          log(`  -> Moved to ${targetLabel}: ${adxFileName} (${formatBytes(blob.size)})`, 'success');
        } catch (err) {
          log(`  [Error saving ${adxFileName}]: ${err.message}`, 'error');
          throw err;
        }
      } else {
        // Fallback: Trigger download
        saveBlobLocally(blob, adxFileName);
        log(`  -> Created & Downloaded: ${adxFileName} (${formatBytes(blob.size)})`, 'success');
      }
    }

    song.isCompiled = true;
    updateStats();
    updateSongCardUI(song);
  }

  // Batch Compiling
  async function startBatchCompilation(songsToCompile) {
    if (state.isCompiling) return;
    if (!songsToCompile || songsToCompile.length === 0) {
      alert('No songs selected or available to compile.');
      return;
    }

    const overwrite = elements.chkOverwrite.checked;
    let queue = songsToCompile;
    if (!overwrite) {
      queue = queue.filter(s => !s.isCompiled);
      if (queue.length === 0) {
        alert('All selected songs are already compiled! Check "Overwrite existing .adx" if you want to recompile.');
        return;
      }
    }

    state.isCompiling = true;
    state.shouldCancel = false;

    if (elements.masterProgressContainer) elements.masterProgressContainer.style.display = 'flex';
    if (elements.btnCompileAll) elements.btnCompileAll.disabled = true;
    if (elements.btnCompileSelected) elements.btnCompileSelected.disabled = true;
    if (elements.btnCompileAllLive) elements.btnCompileAllLive.disabled = true;
    updateSystemStatus('Batch Compiling...', true);

    log(`\n========================================`, 'accent');
    log(`Starting batch compilation of ${queue.length} song(s)...`, 'accent');
    log(`========================================`, 'accent');

    let completed = 0;
    const total = queue.length;

    for (let i = 0; i < total; i++) {
      if (state.shouldCancel) {
        log('Batch compilation cancelled by user.', 'work');
        break;
      }

      const song = queue[i];
      const percent = Math.round(((i) / total) * 100);

      elements.progressBarFill.style.width = `${percent}%`;
      elements.progressPercentageLabel.textContent = `${percent}% (${i}/${total})`;
      elements.progressMainTitle.textContent = `Compiling: ${song.name}`;

      try {
        await compileSong(song, (songPercent) => {
          // Micro progress
        });
        completed++;
      } catch (err) {
        log(`Failed compiling ${song.name}: ${err.message}`, 'error');
      }

      const afterPercent = Math.round(((i + 1) / total) * 100);
      elements.progressBarFill.style.width = `${afterPercent}%`;
      elements.progressPercentageLabel.textContent = `${afterPercent}% (${i + 1}/${total})`;
    }

    state.isCompiling = false;
    if (elements.btnCompileAll) elements.btnCompileAll.disabled = false;
    if (elements.btnCompileAllLive) elements.btnCompileAllLive.disabled = false;
    updateSelectedButtons();
    updateSystemStatus('Ready', false);

    log(`\nDone! Successfully compiled ${completed}/${total} song packages.`, 'success');

    setTimeout(() => {
      elements.masterProgressContainer.style.display = 'none';
      elements.progressBarFill.style.width = '0%';
    }, 4000);
  }

  // Trigger browser download for a Blob
  function saveBlobLocally(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // Switch View Mode (list vs grid)
  function setViewMode(mode, triggerRender = true) {
    state.viewMode = mode;
    localStorage.setItem('astrodx_view_mode', mode);

    if (elements.btnViewList && elements.btnViewGrid) {
      if (mode === 'list') {
        elements.btnViewList.classList.add('active');
        elements.btnViewGrid.classList.remove('active');
      } else {
        elements.btnViewGrid.classList.add('active');
        elements.btnViewList.classList.remove('active');
      }
    }

    if (triggerRender) {
      renderSongGrid();
    }
  }

  // Render song grid according to filter and search query
  function renderSongGrid() {
    elements.songsGridContainer.innerHTML = '';
    const isList = state.viewMode === 'list';
    elements.songsGridContainer.className = `songs-container ${isList ? 'view-list' : 'view-grid'}`;

    const query = state.searchQuery;
    const filter = state.filter;

    // Special View: Missing official songs from disk
    if (filter === 'missing') {
      const missingFiltered = (state.missingSongs || []).filter(item => {
        if (query) {
          const matchTitle = (item.title || '').toLowerCase().includes(query);
          const matchArtist = (item.artist || '').toLowerCase().includes(query);
          const matchCategory = (item.catcode || '').toLowerCase().includes(query);
          return matchTitle || matchArtist || matchCategory;
        }
        return true;
      });

      if (missingFiltered.length === 0) {
        const noMatch = document.createElement('div');
        noMatch.className = 'empty-state-card';
        noMatch.innerHTML = `
          <div class="empty-icon">✓</div>
          <h3>All Live Songs Matched on Disk!</h3>
          <p>No missing official songs detected in <code>${escapeHtml(state.currentFolderName)}</code>.</p>
        `;
        elements.songsGridContainer.appendChild(noMatch);
        return;
      }

      const fragment = document.createDocumentFragment();
      if (isList) {
        const headerRow = document.createElement('div');
        headerRow.className = 'list-header-row';
        headerRow.innerHTML = `
          <div class="list-col-select" title="Select">-</div>
          <div class="list-col-jacket" title="Jacket Cover">Type</div>
          <div class="list-col-title-artist" title="Title & Artist">Official Title & Artist</div>
          <div class="list-col-folder col-folder" title="Folder Name">Status</div>
          <div class="list-col-diff col-diff" title="Difficulties">Levels</div>
          <div class="list-col-tags col-tags" title="Files">-</div>
          <div class="list-col-size col-size" title="Size">-</div>
          <div class="list-col-status" title="Status">Disk Match</div>
          <div class="list-col-actions" title="Action">Status</div>
        `;
        fragment.appendChild(headerRow);
        for (const song of missingFiltered) {
          fragment.appendChild(renderMissingSongRow(song));
        }
      } else {
        for (const song of missingFiltered) {
          fragment.appendChild(renderMissingSongCard(song));
        }
      }
      elements.songsGridContainer.appendChild(fragment);
      return;
    }

    const filtered = state.songs.filter(song => {
      if (filter === 'live' && !song.isLive) return false;
      if (filter === 'deleted' && !song.isDeleted) return false;
      if (filter === 'utage' && !song.isUtage) return false;
      if (filter === 'pending' && song.isCompiled) return false;
      if (filter === 'compiled' && !song.isCompiled) return false;
      if (filter === 'video' && !song.hasVideo) return false;

      if (query) {
        const matchTitle = (song.title || '').toLowerCase().includes(query);
        const matchArtist = (song.artist || '').toLowerCase().includes(query);
        const matchFolder = (song.name || '').toLowerCase().includes(query);
        const matchCategory = (song.segaCategory || '').toLowerCase().includes(query);
        return matchTitle || matchArtist || matchFolder || matchCategory;
      }
      return true;
    });

    if (filtered.length === 0) {
      if (state.songs.length === 0) {
        elements.songsGridContainer.appendChild(elements.emptyStateView);
      } else {
        const noMatch = document.createElement('div');
        noMatch.className = 'empty-state-card';
        noMatch.innerHTML = `
          <div class="empty-icon">🔍</div>
          <h3>No Matching Songs</h3>
          <p>No songs found matching query <code>"${escapeHtml(query)}"</code> with current filter.</p>
        `;
        elements.songsGridContainer.appendChild(noMatch);
      }
      return;
    }

    const fragment = document.createDocumentFragment();

    // If List view, prepend sticky header row
    if (isList) {
      const headerRow = document.createElement('div');
      headerRow.className = 'list-header-row';
      headerRow.innerHTML = `
        <div class="list-col-select" title="Select">✓</div>
        <div class="list-col-jacket" title="Jacket Cover">Cover</div>
        <div class="list-col-title-artist" title="Title & Artist">Title & Artist</div>
        <div class="list-col-folder col-folder" title="Folder Name">Folder</div>
        <div class="list-col-diff col-diff" title="Difficulties">Levels</div>
        <div class="list-col-tags col-tags" title="Files">Files</div>
        <div class="list-col-size col-size" title="Size">Size</div>
        <div class="list-col-status" title="Status">Status</div>
        <div class="list-col-actions" title="Action">Action</div>
      `;
      fragment.appendChild(headerRow);

      for (const song of filtered) {
        fragment.appendChild(createSongListRow(song));
      }
    } else {
      // Grid view
      for (const song of filtered) {
        fragment.appendChild(createSongCard(song));
      }
    }

    elements.songsGridContainer.appendChild(fragment);
  }

  // Create compact song row for List View
  function createSongListRow(song) {
    const row = document.createElement('div');
    row.className = `song-list-row ${song.isCompiled ? 'compiled' : ''} ${!song.isLive ? 'non-live-song' : ''}`;
    row.id = `song-card-${escapeCssId(song.name)}`;

    const isSelected = state.selectedSongNames.has(song.name);

    // Levels HTML
    let levelsHtml = '';
    const diffNames = { '1': 'BAS', '2': 'ADV', '3': 'EXP', '4': 'MAS', '5': 'REM' };
    const diffClasses = { '1': 'diff-bas', '2': 'diff-adv', '3': 'diff-exp', '4': 'diff-mas', '5': 'diff-rem' };

    for (let i = 1; i <= 5; i++) {
      if (song.levels && song.levels[i]) {
        const cls = diffClasses[i] || 'diff-mas';
        const label = diffNames[i] || `LV${i}`;
        levelsHtml += `<span class="diff-badge ${cls}">${label} ${song.levels[i]}</span>`;
      }
    }

    // Cover art HTML
    const coverHtml = song.coverUrl
      ? `<img src="${song.coverUrl}" alt="${escapeHtml(song.title)}" loading="lazy">`
      : '🎵';

    // Live Badge HTML
    let badgeHtml = '';
    if (song.isLive) {
      badgeHtml = `<span class="badge-live" title="Officially live on International maimai server">LIVE</span>`;
    } else if (song.isDeleted) {
      badgeHtml = `<span class="badge-deleted" title="License expired in live arcade versions">EXPIRED</span>`;
    } else if (song.isUtage) {
      badgeHtml = `<span class="badge-utage" title="Utage special gimmick chart">UTAGE</span>`;
    }

    row.innerHTML = `
      <div class="list-col-select">
        <input type="checkbox" class="chk-song-select" data-song="${escapeHtml(song.name)}" ${isSelected ? 'checked' : ''}>
      </div>

      <div class="list-col-jacket">
        ${coverHtml}
      </div>

      <div class="list-col-title-artist">
        <div class="song-title-list" title="${escapeHtml(song.title)}">
          ${escapeHtml(song.title)}
          ${badgeHtml}
        </div>
        <div class="song-artist-list" title="${escapeHtml(song.artist)}">
          ${escapeHtml(song.artist)}
          ${song.segaCategory ? `<span style="font-size:0.68rem; color:var(--neon-cyan); margin-left:6px;">[${escapeHtml(song.segaCategory)}]</span>` : ''}
        </div>
      </div>

      <div class="list-col-folder col-folder" title="${escapeHtml(song.name)}">
        📁 ${escapeHtml(song.name)}
      </div>

      <div class="list-col-diff col-diff">
        ${levelsHtml || '<span style="font-size:0.68rem; color:var(--text-muted)">Std</span>'}
      </div>

      <div class="list-col-tags col-tags">
        ${song.hasVideo ? `<span class="file-tag tag-video" title="Video: ${formatBytes(song.videoSize)}">MP4</span>` : ''}
        <span class="file-tag">${song.hasAudio ? 'MP3' : '-'}</span>
      </div>

      <div class="list-col-size col-size">
        ${formatBytes(song.effectiveSize)}
      </div>

      <div class="list-col-status">
        <span class="song-status-pill ${song.isCompiled ? 'status-compiled' : 'status-ready'}" id="status-pill-${escapeCssId(song.name)}">
          ${song.isCompiled ? '✓ Compiled' : 'Ready'}
        </span>
      </div>

      <div class="list-col-actions">
        <button type="button" class="btn btn-primary btn-sm btn-compile-single" data-song="${escapeHtml(song.name)}">
          ⚡ Compile
        </button>
      </div>
    `;

    // Event handlers for row
    const chk = row.querySelector('.chk-song-select');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) state.selectedSongNames.add(song.name);
      else state.selectedSongNames.delete(song.name);
      updateSelectedButtons();
    });

    const btnCompile = row.querySelector('.btn-compile-single');
    btnCompile.addEventListener('click', async () => {
      btnCompile.disabled = true;
      const statusPill = row.querySelector(`#status-pill-${escapeCssId(song.name)}`);
      statusPill.className = 'song-status-pill status-working';
      statusPill.textContent = 'Zipping...';

      try {
        await compileSong(song);
      } catch (err) {
        statusPill.className = 'song-status-pill';
        statusPill.style.color = '#ef4444';
        statusPill.textContent = 'Error';
      } finally {
        btnCompile.disabled = false;
      }
    });

    return row;
  }

  // Create single song card DOM element
  function createSongCard(song) {
    const card = document.createElement('div');
    card.className = `song-card ${song.isCompiled ? 'compiled' : ''} ${!song.isLive ? 'non-live-song' : ''}`;
    card.id = `song-card-${escapeCssId(song.name)}`;

    const isSelected = state.selectedSongNames.has(song.name);

    // Levels HTML
    let levelsHtml = '';
    const diffNames = { '1': 'BAS', '2': 'ADV', '3': 'EXP', '4': 'MAS', '5': 'REM' };
    const diffClasses = { '1': 'diff-bas', '2': 'diff-adv', '3': 'diff-exp', '4': 'diff-mas', '5': 'diff-rem' };

    for (let i = 1; i <= 5; i++) {
      if (song.levels && song.levels[i]) {
        const cls = diffClasses[i] || 'diff-mas';
        const label = diffNames[i] || `LV${i}`;
        levelsHtml += `<span class="diff-badge ${cls}">${label} ${song.levels[i]}</span>`;
      }
    }

    // Cover art HTML
    const coverHtml = song.coverUrl
      ? `<img src="${song.coverUrl}" alt="${escapeHtml(song.title)}" loading="lazy">`
      : '🎵';

    // Live Badge HTML
    let badgeHtml = '';
    if (song.isLive) {
      badgeHtml = `<span class="badge-live" title="Officially live on International maimai server">LIVE</span>`;
    } else if (song.isDeleted) {
      badgeHtml = `<span class="badge-deleted" title="License expired in live arcade versions">EXPIRED</span>`;
    } else if (song.isUtage) {
      badgeHtml = `<span class="badge-utage" title="Utage special gimmick chart">UTAGE</span>`;
    }

    card.innerHTML = `
      <div class="song-card-top">
        <div class="jacket-thumbnail">
          ${coverHtml}
        </div>
        <div class="song-meta-wrap">
          <div class="song-title-row">
            <span class="song-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</span>
            ${badgeHtml}
          </div>
          <span class="song-artist" title="${escapeHtml(song.artist)}">
            ${escapeHtml(song.artist)}
            ${song.segaCategory ? `<span style="font-size:0.68rem; color:var(--neon-cyan); margin-left:6px;">[${escapeHtml(song.segaCategory)}]</span>` : ''}
          </span>
          <span class="song-folder-name" title="${escapeHtml(song.name)}">📁 ${escapeHtml(song.name)}</span>
          <div class="difficulty-badges-row">
            ${levelsHtml || '<span style="font-size:0.7rem; color:var(--text-muted)">Standard Chart</span>'}
          </div>
        </div>
      </div>

      <div class="song-card-middle">
        <div class="file-tags-list">
          <span class="file-tag">${song.hasAudio ? 'MP3/OGG' : 'No Audio'}</span>
          <span class="file-tag">maidata</span>
          ${song.hasVideo ? `<span class="file-tag tag-video" title="Video size: ${formatBytes(song.videoSize)}">MP4 Video</span>` : ''}
        </div>
        <span class="song-size-tag">${formatBytes(song.effectiveSize)}</span>
      </div>

      <div class="song-card-actions">
        <label class="song-checkbox-wrap">
          <input type="checkbox" class="chk-song-select" data-song="${escapeHtml(song.name)}" ${isSelected ? 'checked' : ''}>
          <span>Select</span>
        </label>

        <div style="display:flex; align-items:center; gap:8px;">
          <span class="song-status-pill ${song.isCompiled ? 'status-compiled' : 'status-ready'}" id="status-pill-${escapeCssId(song.name)}">
            ${song.isCompiled ? '✓ Compiled' : 'Ready'}
          </span>
          <button type="button" class="btn btn-primary btn-sm btn-compile-single" data-song="${escapeHtml(song.name)}">
            ⚡ Compile
          </button>
        </div>
      </div>
    `;

    // Event handlers for card
    const chk = card.querySelector('.chk-song-select');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) state.selectedSongNames.add(song.name);
      else state.selectedSongNames.delete(song.name);
      updateSelectedButtons();
    });

    const btnCompile = card.querySelector('.btn-compile-single');
    btnCompile.addEventListener('click', async () => {
      btnCompile.disabled = true;
      const statusPill = card.querySelector(`#status-pill-${escapeCssId(song.name)}`);
      statusPill.className = 'song-status-pill status-working';
      statusPill.textContent = 'Zipping...';

      try {
        await compileSong(song);
      } catch (err) {
        statusPill.className = 'song-status-pill';
        statusPill.style.color = '#ef4444';
        statusPill.textContent = 'Error';
      } finally {
        btnCompile.disabled = false;
      }
    });

    return card;
  }

  // Render Missing Official Song Row (for missing filter)
  function renderMissingSongRow(item) {
    const row = document.createElement('div');
    row.className = 'song-list-row missing-song-row';
    const lev = item.levels || {};
    const levelsHtml = `
      <span class="diff-chip diff-bas" title="Basic: ${lev.basic || '-'}">${lev.basic || '-'}</span>
      <span class="diff-chip diff-adv" title="Advanced: ${lev.advanced || '-'}">${lev.advanced || '-'}</span>
      <span class="diff-chip diff-exp" title="Expert: ${lev.expert || '-'}">${lev.expert || '-'}</span>
      <span class="diff-chip diff-mas" title="Master: ${lev.master || '-'}">${lev.master || '-'}</span>
      ${lev.remaster ? `<span class="diff-chip diff-remas" title="Re:Master: ${lev.remaster}">${lev.remaster}</span>` : ''}
    `;

    row.innerHTML = `
      <div class="list-col-select">
        <span style="color:var(--text-muted)">-</span>
      </div>
      <div class="list-col-jacket">
        <div style="width:40px; height:40px; border-radius:6px; background:rgba(239,68,68,0.15); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">⚠️</div>
      </div>
      <div class="list-col-title-artist">
        <div class="song-title-list">
          ${escapeHtml(item.title)}
          <span class="badge-missing" style="margin-left:6px;">MISSING ON DISK</span>
        </div>
        <div class="song-artist-list">
          ${escapeHtml(item.artist)}
          ${item.catcode ? `<span style="font-size:0.68rem; color:var(--neon-cyan); margin-left:6px;">[${escapeHtml(item.catcode)}]</span>` : ''}
        </div>
      </div>
      <div class="list-col-folder col-folder" style="color:#ef4444; font-weight:600;">
        ⚠️ Not found in folder
      </div>
      <div class="list-col-diff col-diff">
        ${levelsHtml}
      </div>
      <div class="list-col-tags col-tags">-</div>
      <div class="list-col-size col-size">-</div>
      <div class="list-col-status">
        <span class="song-status-pill" style="border-color:rgba(239,68,68,0.5); color:#ef4444; background:rgba(239,68,68,0.1);">Unmatched</span>
      </div>
      <div class="list-col-actions">
        <button type="button" class="btn btn-secondary btn-sm" disabled style="opacity:0.6; cursor:not-allowed;">
          Not Available
        </button>
      </div>
    `;
    return row;
  }

  // Render Missing Official Song Card (for grid view)
  function renderMissingSongCard(item) {
    const card = document.createElement('div');
    card.className = 'song-card missing-song-card';
    const lev = item.levels || {};
    const levelsHtml = `
      <span class="diff-chip diff-bas" title="Basic: ${lev.basic || '-'}">${lev.basic || '-'}</span>
      <span class="diff-chip diff-adv" title="Advanced: ${lev.advanced || '-'}">${lev.advanced || '-'}</span>
      <span class="diff-chip diff-exp" title="Expert: ${lev.expert || '-'}">${lev.expert || '-'}</span>
      <span class="diff-chip diff-mas" title="Master: ${lev.master || '-'}">${lev.master || '-'}</span>
      ${lev.remaster ? `<span class="diff-chip diff-remas" title="Re:Master: ${lev.remaster}">${lev.remaster}</span>` : ''}
    `;

    card.innerHTML = `
      <div class="song-card-header">
        <div class="song-cover-wrap">
          <div style="width:100%; height:100%; min-height:80px; display:flex; align-items:center; justify-content:center; background:rgba(239,68,68,0.1); font-size:2rem;">⚠️</div>
          <span class="badge-missing" style="position:absolute; top:6px; left:6px;">MISSING ON DISK</span>
        </div>
        <div class="song-meta-wrap">
          <h4 class="song-title">${escapeHtml(item.title)}</h4>
          <p class="song-artist">${escapeHtml(item.artist)} ${item.catcode ? `[${escapeHtml(item.catcode)}]` : ''}</p>
          <div style="color:#ef4444; font-size:0.78rem; font-weight:600; margin-top:4px;">
            ⚠️ Not in local version directory
          </div>
        </div>
      </div>
      <div class="song-card-middle">
        <div class="song-levels-row">
          ${levelsHtml}
        </div>
      </div>
      <div class="song-card-actions">
        <span class="song-status-pill" style="border-color:rgba(239,68,68,0.5); color:#ef4444; background:rgba(239,68,68,0.1);">Unmatched</span>
        <button type="button" class="btn btn-secondary btn-sm" disabled style="opacity:0.6;">Not on Disk</button>
      </div>
    `;
    return card;
  }

  // Update card or list row UI when compiled
  function updateSongCardUI(song) {
    const id = escapeCssId(song.name);
    const card = document.getElementById(`song-card-${id}`);
    const row = document.getElementById(`song-row-${id}`);
    if (card) card.classList.add('compiled');
    if (row) row.classList.add('compiled');

    const statusPills = document.querySelectorAll(`#status-pill-${id}`);
    statusPills.forEach(pill => {
      pill.className = 'song-status-pill status-compiled';
      pill.textContent = '✓ Compiled';
    });
  }

  // Toggle Select All
  function toggleSelectAll() {
    const allSelected = state.selectedSongNames.size === state.songs.length;
    if (allSelected) {
      state.selectedSongNames.clear();
      elements.btnSelectAll.textContent = 'Select All';
    } else {
      state.songs.forEach(s => state.selectedSongNames.add(s.name));
      elements.btnSelectAll.textContent = 'Deselect All';
    }

    document.querySelectorAll('.chk-song-select').forEach(cb => {
      cb.checked = !allSelected;
    });

    updateSelectedButtons();
  }

  // Update batch selection buttons
  function updateSelectedButtons() {
    const count = state.selectedSongNames.size;
    elements.selectedCount.textContent = count;
    elements.btnCompileSelected.disabled = count === 0 || state.isCompiling;
    elements.btnSelectAll.textContent = count === state.songs.length && count > 0 ? 'Deselect All' : 'Select All';
  }

  // Update Statistics
  function updateStats() {
    const total = state.songs.length;
    const compiled = state.songs.filter(s => s.isCompiled).length;
    const pending = total - compiled;
    const liveCount = state.songs.filter(s => s.isLive).length;
    const deletedCount = state.songs.filter(s => s.isDeleted).length;
    const utageCount = state.songs.filter(s => s.isUtage).length;
    const videoCount = state.songs.filter(s => s.hasVideo).length;

    elements.statTotalSongs.textContent = total;
    elements.statTotalFiles.textContent = `${total} song packages discovered`;

    elements.statCompiledCount.textContent = compiled;
    elements.statCompiledDesc.textContent = `${Math.round(total ? (compiled / total) * 100 : 0)}% completed`;

    elements.statPendingCount.textContent = pending;
    elements.statSavedSpace.textContent = formatBytes(state.savedSpaceBytes);
    elements.statVideoCount.textContent = `${videoCount} videos excluded from .adx`;

    elements.countAll.textContent = total;
    if (elements.countLive) elements.countLive.textContent = liveCount;
    if (elements.countDeleted) elements.countDeleted.textContent = deletedCount;
    if (elements.countUtage) elements.countUtage.textContent = utageCount;
    if (elements.liveSelectableCount) elements.liveSelectableCount.textContent = liveCount;
    elements.countPending.textContent = pending;
    elements.countCompiled.textContent = compiled;

    if (elements.btnCompileAllLive) elements.btnCompileAllLive.disabled = liveCount === 0 || state.isCompiling;
    elements.btnCompileSelected.disabled = state.selectedSongNames.size === 0 || state.isCompiling;
    updateSelectedButtons();
  }

  // =========================================================================
  // Live International Server & Versions Dashboard Methods
  // =========================================================================

  // Load versions summary from server API
  async function loadVersionsSummary() {
    try {
      const res = await fetch('/api/versions-summary');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      state.versionsSummary = data.versions;

      // Populate quick select dropdown
      if (elements.selectVersionQuick) {
        const curVal = elements.selectVersionQuick.value;
        elements.selectVersionQuick.innerHTML = '<option value="">-- Choose Maimai Version --</option>';
        for (const v of data.versions) {
          const opt = document.createElement('option');
          opt.value = v.name;
          const pct = Math.round(v.percent);
          opt.textContent = `${v.name} (${v.compiledCount}/${v.matchedCount} Live - ${pct}%)`;
          elements.selectVersionQuick.appendChild(opt);
        }
        if (curVal) elements.selectVersionQuick.value = curVal;
      }

      // Populate dashboard stats and table
      renderDashboardTable(data.versions);
    } catch (e) {
      console.warn('Could not load versions summary from server', e);
    }
  }

  // Render Dashboard Table
  function renderDashboardTable(versions) {
    if (!elements.dashboardTableBody) return;
    elements.dashboardTableBody.innerHTML = '';

    let totalLive = 0;
    let totalCompiled = 0;
    let totalLocal = 0;

    for (const v of versions) {
      totalLive += v.matchedCount;
      totalCompiled += v.compiledCount;
      totalLocal += v.localTotal;

      const tr = document.createElement('tr');
      const pct = Math.round(v.percent);
      const isComplete = v.compiledCount >= v.matchedCount && v.matchedCount > 0;
      const segaTotal = v.segaLiveCount || v.matchedCount;
      const missingCnt = v.missingCount || 0;

      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-primary);">
          ${escapeHtml(v.name)}
        </td>
        <td>
          <span style="color: var(--neon-cyan); font-weight: 600;">${segaTotal} Live</span>
        </td>
        <td>
          ${missingCnt > 0 ? 
            `<span style="color: #ff9800; font-weight: 700;">⚠️ ${v.matchedCount}/${segaTotal} (${missingCnt} missing)</span>` : 
            `<span style="color: var(--neon-green); font-weight: 600;">✓ 100% (${v.matchedCount} matched)</span>`
          }
        </td>
        <td>
          <span style="color: ${v.compiledCount > 0 ? 'var(--neon-green)' : 'var(--text-muted)'}; font-weight: 700;">
            ${v.compiledCount} .adx
          </span>
        </td>
        <td>
          <div class="dash-progress-wrap">
            <div class="dash-progress-bar">
              <div class="dash-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <span class="dash-progress-label">${pct}%</span>
          </div>
        </td>
        <td>
          <button type="button" class="btn ${isComplete ? 'btn-secondary' : 'btn-primary'} btn-sm btn-dash-row-compile" data-version="${escapeHtml(v.name)}">
            ${isComplete ? '✓ Recompile' : '▶ Compile Live'}
          </button>
        </td>
      `;

      const btnRow = tr.querySelector('.btn-dash-row-compile');
      btnRow.addEventListener('click', async () => {
        closeDashboard();
        if (elements.selectVersionQuick) elements.selectVersionQuick.value = v.name;
        await loadVersionDirectly(v.name);
        compileLiveOnly();
      });

      elements.dashboardTableBody.appendChild(tr);
    }

    if (elements.dashTotalVersions) elements.dashTotalVersions.textContent = versions.length;
    if (elements.dashTotalLive) elements.dashTotalLive.textContent = totalLive.toLocaleString();
    if (elements.dashTotalCompiled) elements.dashTotalCompiled.textContent = totalCompiled.toLocaleString();
    if (elements.dashTotalPending) elements.dashTotalPending.textContent = Math.max(0, totalLive - totalCompiled).toLocaleString();
  }

  // Load a version folder directly from server API
  async function loadVersionDirectly(versionName) {
    if (!versionName) return;
    updateSystemStatus(`Loading ${versionName}...`, true);
    log(`\nLoading version: ${versionName}...`, 'accent');

    try {
      const res = await fetch(`/api/version-songs?version=${encodeURIComponent(versionName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Server error');

      state.currentFolderName = versionName;
      elements.currentFolderPath.textContent = `${versionName} (${data.liveCount} Live International / ${data.totalSongs} Total)`;
      elements.folderLabelText.textContent = `Version Folder: ${versionName}`;

      state.songs = data.songs.map(s => ({
        name: s.name,
        title: s.title || s.name,
        artist: s.artist || 'Unknown Artist',
        levels: s.levels || {},
        bpm: s.bpm || '',
        totalSize: s.totalSize || 0,
        videoSize: s.hasVideo ? 10 * 1024 * 1024 : 0,
        effectiveSize: s.adxSize || s.totalSize || 2 * 1024 * 1024,
        hasAudio: s.hasAudio,
        hasVideo: s.hasVideo,
        isCompiled: s.isCompiled,
        isLive: s.isLive,
        isDeleted: s.isDeleted,
        isUtage: s.isUtage,
        segaCategory: s.segaCategory,
        coverUrl: s.coverUrl,
        sourceType: 'server'
      }));

      // Sort: Live songs first, then alphabetical
      state.songs.sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      state.selectedSongNames.clear();
      state.filter = 'all';
      elements.filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

      state.segaCatalog = data.segaCatalog || [];
      state.missingSongs = data.missingSongs || [];

      if (elements.btnCatalogCount) {
        elements.btnCatalogCount.textContent = (data.officialTotal || data.liveCount || 0);
      }

      const missingCount = state.missingSongs.length;
      if (elements.countMissing) elements.countMissing.textContent = missingCount;
      if (elements.filterMissing) elements.filterMissing.style.display = missingCount > 0 ? 'inline-flex' : 'none';

      updateStats();
      renderSongGrid();
      updateSystemStatus('Ready', false);
      const missingLog = missingCount > 0 ? ` (${missingCount} live songs missing from disk!)` : '';
      log(`Successfully loaded ${state.songs.length} songs for ${versionName}. (${data.liveCount} live on International server)${missingLog}`, missingCount > 0 ? 'accent' : 'success');
    } catch (e) {
      log(`Failed loading ${versionName}: ${e.message}`, 'error');
      updateSystemStatus('Error', false);
    }
  }

  // Select Live Only
  function selectLiveOnly() {
    state.selectedSongNames.clear();
    const liveSongs = state.songs.filter(s => s.isLive);
    liveSongs.forEach(s => state.selectedSongNames.add(s.name));

    document.querySelectorAll('.chk-song-select').forEach(cb => {
      const songName = cb.dataset.song;
      const isLive = liveSongs.some(s => s.name === songName);
      cb.checked = isLive;
    });

    updateSelectedButtons();
    log(`Selected ${state.selectedSongNames.size} live songs. Click "⚡ Compile Selected (${state.selectedSongNames.size})" or "⚡ Compile All Live" to start!`, 'info');
  }

  // Compile Live Only
  function compileLiveOnly() {
    const liveSongs = state.songs.filter(s => s.isLive);
    if (liveSongs.length === 0) {
      alert('No official live songs found in this version folder.');
      return;
    }
    startBatchCompilation(liveSongs);
  }

  // Dashboard modal open/close
  function openDashboard() {
    if (elements.dashboardModalOverlay) {
      elements.dashboardModalOverlay.classList.add('active');
      loadVersionsSummary();
    }
  }

  function closeDashboard() {
    if (elements.dashboardModalOverlay) {
      elements.dashboardModalOverlay.classList.remove('active');
    }
  }

  // Batch compile all versions in sequence
  async function startBatchCompileAllVersions() {
    if (!state.versionsSummary || state.versionsSummary.length === 0) {
      await loadVersionsSummary();
    }

    const destName = state.outputFolderName || 'the destination folder';
    if (!confirm(`This will compile all uncompiled live songs across all discovered versions into "${destName}\\[version]\\". Continue?`)) {
      return;
    }

    closeDashboard();
    log('\n========================================', 'accent');
    log('STARTING GLOBAL BATCH COMPILATION ACROSS ALL VERSIONS', 'accent');
    log('========================================', 'accent');

    for (const v of state.versionsSummary) {
      if (state.shouldCancel) break;
      if (v.compiledCount >= v.matchedCount && v.matchedCount > 0) {
        log(`Skipping ${v.name}: All ${v.compiledCount} live songs already compiled.`, 'info');
        continue;
      }

      if (elements.selectVersionQuick) elements.selectVersionQuick.value = v.name;
      await loadVersionDirectly(v.name);

      const uncompiledLive = state.songs.filter(s => s.isLive && !s.isCompiled);
      if (uncompiledLive.length > 0) {
        await startBatchCompilation(uncompiledLive);
      }
    }

    log('\nAll versions batch compilation complete!', 'success');
    await loadVersionsSummary();
  }

  // Update Status Pill
  function updateSystemStatus(text, isBusy) {
    elements.systemStatusText.textContent = text;
    if (isBusy) {
      elements.systemStatusDot.style.background = 'var(--neon-pink)';
      elements.systemStatusDot.style.boxShadow = '0 0 10px var(--neon-pink)';
    } else {
      elements.systemStatusDot.style.background = 'var(--neon-cyan)';
      elements.systemStatusDot.style.boxShadow = '0 0 10px var(--neon-cyan)';
    }
  }

  // Generate equivalent PowerShell code for modal
  function updatePSModalScript() {
    const outPathVal = state.outputFolderName || '.\\output';
    const psCode = `param(
    [string]$TargetPath = ".",
    [string]$OutputPath = "${outPathVal}"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resolvedSource = (Resolve-Path $TargetPath).Path
$versionName = Split-Path $resolvedSource -Leaf
$versionOutputPath = Join-Path $OutputPath $versionName

if (-not (Test-Path -LiteralPath $versionOutputPath)) {
    New-Item -ItemType Directory -Path $versionOutputPath -Force | Out-Null
}

$resolvedOutput = (Resolve-Path $versionOutputPath).Path

Write-Host "Compiling from: $resolvedSource" -ForegroundColor Cyan
Write-Host "Saving to:       $resolvedOutput" -ForegroundColor Green

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
    Write-Host "  -> Moved to: $versionName\\$($folder.Name).adx ($sizeMb MB)" -ForegroundColor Green
}

Write-Host "\`nDone! All songs compiled and moved to $resolvedOutput" -ForegroundColor Cyan`;

    elements.modalPsCode.textContent = psCode;
  }

  // Utilities
  function getExtension(filename) {
    const idx = filename.lastIndexOf('.');
    return idx !== -1 ? filename.substring(idx).toLowerCase() : '';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeCssId(str) {
    return encodeURIComponent(str).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // =========================================================================
  // Official SEGA International Catalog Modal Logic
  // =========================================================================

  function openCatalogModal() {
    if (!elements.catalogModalOverlay) return;
    elements.catalogModalOverlay.classList.add('active');
    renderCatalogModal();
  }

  function closeCatalogModal() {
    if (elements.catalogModalOverlay) {
      elements.catalogModalOverlay.classList.remove('active');
    }
  }

  function renderCatalogModal() {
    if (!state.segaCatalog) return;
    if (elements.catalogVersionTitle) {
      elements.catalogVersionTitle.textContent = state.currentFolderName || 'Selected Version';
    }

    const total = state.segaCatalog.length;
    const matched = state.segaCatalog.filter(s => s.isMatched).length;
    const missing = total - matched;

    if (elements.catStatTotal) elements.catStatTotal.textContent = total;
    if (elements.catStatMatched) elements.catStatMatched.textContent = matched;
    if (elements.catStatMissing) elements.catStatMissing.textContent = missing;

    if (elements.catCountAll) elements.catCountAll.textContent = total;
    if (elements.catCountMatched) elements.catCountMatched.textContent = matched;
    if (elements.catCountMissing) elements.catCountMissing.textContent = missing;

    // Alert banner
    if (elements.catalogAlertBanner) {
      if (missing > 0) {
        elements.catalogAlertBanner.style.display = 'flex';
        elements.catalogAlertBanner.innerHTML = `⚠️ <strong>${missing} official song(s)</strong> are live on International servers but missing from your local <code>${escapeHtml(state.currentFolderName)}</code> folder.`;
      } else {
        elements.catalogAlertBanner.style.display = 'none';
      }
    }

    renderCatalogTable();
  }

  function renderCatalogTable() {
    if (!elements.catalogTableBody || !state.segaCatalog) return;
    elements.catalogTableBody.innerHTML = '';

    const query = (state.catalogSearchQuery || '').toLowerCase().trim();
    const filter = state.catalogFilter || 'all';

    const filtered = state.segaCatalog.filter(item => {
      if (filter === 'matched' && !item.isMatched) return false;
      if (filter === 'missing' && item.isMatched) return false;
      if (query) {
        const matchTitle = (item.title || '').toLowerCase().includes(query);
        const matchArtist = (item.artist || '').toLowerCase().includes(query);
        const matchCat = (item.catcode || '').toLowerCase().includes(query);
        const matchFolder = (item.matchedFolder || '').toLowerCase().includes(query);
        return matchTitle || matchArtist || matchCat || matchFolder;
      }
      return true;
    });

    if (filtered.length === 0) {
      elements.catalogTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">No songs matching filters.</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const lev = item.levels || {};
      const levelsHtml = `
        <span class="diff-chip diff-bas" title="Basic: ${lev.basic || '-'}">${lev.basic || '-'}</span>
        <span class="diff-chip diff-adv" title="Advanced: ${lev.advanced || '-'}">${lev.advanced || '-'}</span>
        <span class="diff-chip diff-exp" title="Expert: ${lev.expert || '-'}">${lev.expert || '-'}</span>
        <span class="diff-chip diff-mas" title="Master: ${lev.master || '-'}">${lev.master || '-'}</span>
        ${lev.remaster ? `<span class="diff-chip diff-remas" title="Re:Master: ${lev.remaster}">${lev.remaster}</span>` : ''}
      `;

      tr.innerHTML = `
        <td style="color:var(--text-muted); font-size:0.75rem;">${idx + 1}</td>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">${escapeHtml(item.title)}</div>
          <div style="color:var(--text-secondary); font-size:0.75rem;">${escapeHtml(item.artist)}</div>
        </td>
        <td>
          <span style="font-size:0.75rem; color:var(--neon-cyan); font-weight:600;">${escapeHtml(item.catcode || '-')}</span>
        </td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            ${levelsHtml}
          </div>
        </td>
        <td>
          ${item.isMatched ? 
            `<span style="color:var(--neon-green); font-weight:600; font-size:0.82rem;">🟢 Matched: <code>${escapeHtml(item.matchedFolder)}</code></span>` : 
            `<span class="badge-missing">🔴 Missing on Disk</span>`
          }
        </td>
      `;
      fragment.appendChild(tr);
    });

    elements.catalogTableBody.appendChild(fragment);
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);

})();
