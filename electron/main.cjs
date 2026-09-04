const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const appUrl = "http://127.0.0.1:8787/?desktop=1";
const appOrigin = new URL(appUrl).origin;
let serverProcess = null;

function isHttpUrl(rawUrl) {
  try {
    return ["http:", "https:"].includes(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

function isAppUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === appOrigin;
  } catch {
    return false;
  }
}

function serverIsReady() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:8787/api/health", { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

async function ensureServer() {
  if (await serverIsReady()) return;
  const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  serverProcess = spawn(process.execPath, [tsxCli, path.join(projectRoot, "src", "server", "index.ts")], {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await serverIsReady()) return;
    if (serverProcess.exitCode != null) break;
  }
  throw new Error("本地服务启动失败，请先运行 npm run build");
}

async function createWindow() {
  await ensureServer();
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f4f7f5",
    title: "JobPilot CN",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!isHttpUrl(params.src)) event.preventDefault();
  });
  await window.loadURL(appUrl);
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : "桌面应用启动失败";
    dialog.showErrorBox("JobPilot CN", message);
    app.quit();
  }
});

app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void contents.loadURL(url);
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("before-quit", () => {
  if (!serverProcess || serverProcess.exitCode != null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
  } else {
    serverProcess.kill("SIGTERM");
  }
});
