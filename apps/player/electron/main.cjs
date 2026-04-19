const path = require("path");
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  nativeTheme,
} = require("electron");

const DEFAULT_TARGET_URL = "https://userhythm.kr";
const GPU_SWITCHES = [
  "ignore-gpu-blocklist",
  "enable-gpu-rasterization",
  "enable-zero-copy",
  "enable-accelerated-video-decode",
];

for (const name of GPU_SWITCHES) {
  app.commandLine.appendSwitch(name);
}

let targetUrl = process.env.PLAYER_TARGET_URL || DEFAULT_TARGET_URL;
try {
  targetUrl = new URL(targetUrl).toString();
} catch (_error) {
  targetUrl = DEFAULT_TARGET_URL;
}

const isolatedProfilePath = path.join(app.getPath("appData"), "UseRhythmPlayer");
app.setPath("userData", isolatedProfilePath);

let mainWindow = null;
let diagnosticsWindow = null;

const isMac = process.platform === "darwin";

const createLoadErrorPage = ({ url, errorCode, errorDescription }) => {
  const escapedUrl = String(url).replace(/</g, "&lt;");
  const escapedDescription = String(errorDescription).replace(/</g, "&lt;");

  return `<!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>UseRhythm Player - Connection Error</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: "Segoe UI", sans-serif;
        background: #0b1220;
        color: #e2e8f0;
      }
      .panel {
        max-width: 760px;
        margin: 0 auto;
        border: 1px solid #334155;
        border-radius: 12px;
        background: #111827;
        padding: 20px;
      }
      h1 { margin-top: 0; font-size: 22px; }
      p { line-height: 1.5; }
      code {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 2px 6px;
      }
      button {
        margin-top: 16px;
        border: 1px solid #475569;
        background: #1f2937;
        color: #e2e8f0;
        border-radius: 8px;
        padding: 10px 14px;
        cursor: pointer;
      }
      button:hover { background: #334155; }
      .hint { color: #94a3b8; font-size: 13px; margin-top: 14px; }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>Failed to load UseRhythm</h1>
      <p>Target URL: <code>${escapedUrl}</code></p>
      <p>Error: <code>${errorCode}</code> ${escapedDescription}</p>
      <button id="retry">Retry</button>
      <button id="diag">Open GPU Diagnostics</button>
      <p class="hint">
        Check your network connection or service availability, then retry.
      </p>
    </div>
    <script>
      const retry = document.getElementById("retry");
      const diag = document.getElementById("diag");
      retry.addEventListener("click", () => {
        if (window.playerApi?.retryLoad) {
          window.playerApi.retryLoad();
        }
      });
      diag.addEventListener("click", () => {
        if (window.playerApi?.openDiagnostics) {
          window.playerApi.openDiagnostics();
        }
      });
    </script>
  </body>
  </html>`;
};

const buildMenu = () => {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Reload UseRhythm",
          accelerator: "Ctrl+R",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(targetUrl).catch(() => undefined);
            }
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Fullscreen",
          accelerator: "F11",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: "Open GPU Diagnostics",
          accelerator: "Ctrl+Shift+G",
          click: () => openDiagnosticsWindow(),
        },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const installFullscreenShortcuts = (window) => {
  window.webContents.on("before-input-event", (event, input) => {
    const isAltEnter = input.key === "Enter" && input.alt && input.type === "keyDown";
    const isF11 = input.key === "F11" && input.type === "keyDown";
    if (!isAltEnter && !isF11) return;

    event.preventDefault();
    window.setFullScreen(!window.isFullScreen());
  });
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#020617" : "#0f172a",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  installFullscreenShortcuts(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const next = new URL(url);
      const current = new URL(targetUrl);
      if (next.origin === current.origin) {
        return { action: "allow" };
      }
    } catch (_error) {
      return { action: "deny" };
    }

    shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (validatedURL.startsWith("data:text/html")) return;

    const html = createLoadErrorPage({
      url: validatedURL || targetUrl,
      errorCode,
      errorDescription,
    });
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    mainWindow.loadURL(dataUrl).catch(() => undefined);
  });

  mainWindow.loadURL(targetUrl).catch(() => undefined);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

const openDiagnosticsWindow = () => {
  if (diagnosticsWindow && !diagnosticsWindow.isDestroyed()) {
    diagnosticsWindow.focus();
    return;
  }

  diagnosticsWindow = new BrowserWindow({
    width: 980,
    height: 740,
    title: "UseRhythm GPU Diagnostics",
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  diagnosticsWindow.loadFile(path.join(__dirname, "diagnostics.html")).catch(() => undefined);
  diagnosticsWindow.on("closed", () => {
    diagnosticsWindow = null;
  });
};

const collectGpuDiagnostics = async () => {
  const versions = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
  };

  let gpuFeatureStatus = {};
  try {
    gpuFeatureStatus = app.getGPUFeatureStatus();
  } catch (error) {
    gpuFeatureStatus = { error: String(error) };
  }

  let gpuInfo = {};
  try {
    gpuInfo = await app.getGPUInfo("basic");
  } catch (error) {
    gpuInfo = { error: String(error) };
  }

  return {
    timestamp: new Date().toISOString(),
    targetUrl,
    profilePath: app.getPath("userData"),
    versions,
    gpuFeatureStatus,
    gpuInfo,
    switches: GPU_SWITCHES,
  };
};

ipcMain.handle("player:getGpuDiagnostics", () => collectGpuDiagnostics());
ipcMain.on("player:openDiagnostics", () => openDiagnosticsWindow());
ipcMain.on("player:retryLoad", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(targetUrl).catch(() => undefined);
  }
});
ipcMain.on("player:toggleFullscreen", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

