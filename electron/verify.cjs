const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output", "playwright");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let serverProcess = null;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`${url} returned ${response.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
  });
}

async function ensureServer() {
  try { await getJson("http://127.0.0.1:8787/api/health"); return; } catch { /* Start an isolated local server below. */ }
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  serverProcess = spawn(process.execPath, [tsxCli, path.join(root, "src", "server", "index.ts")], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "ignore", windowsHide: true });
  await waitFor(async () => {
    if (serverProcess.exitCode != null) throw new Error("Local server exited during startup");
    try { return await getJson("http://127.0.0.1:8787/api/health"); } catch { return null; }
  }, "local server");
}

function stopStartedServer() {
  if (!serverProcess || serverProcess.exitCode != null) return Promise.resolve();
  if (process.platform !== "win32") { serverProcess.kill("SIGTERM"); return Promise.resolve(); }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    killer.once("exit", resolve);
    killer.once("error", resolve);
  });
}

async function waitFor(check, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch { /* The renderer can be between navigations. */ }
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function startFixtureServer() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>JobPilot Desktop Fixture</title></head><body>
    <main class="job-list">
      <article class="job-card"><a href="http://127.0.0.1:8791/jobs/101"><h3 class="job-name">AI 应用工程师</h3></a><strong class="company">示例云计算</strong><span class="location">杭州</span><span class="salary">20-35K</span><p>负责大模型应用、RAG 检索服务和 Python API 的开发、测试与上线交付。</p></article>
      <article class="job-card"><a href="http://127.0.0.1:8791/jobs/102"><h3 class="job-name">RAG 后端工程师</h3></a><strong class="company">示例数据科技</strong><span class="location">上海</span><span class="salary">25-40K</span><p>使用 FastAPI、MySQL 和向量数据库建设企业知识库，要求具备接口联调经验。</p></article>
    </main></body></html>`;
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8791, "127.0.0.1", () => resolve(server));
  });
}

app.whenReady().then(async () => {
  let fixtureServer = null;
  let window = null;
  let insertedIds = [];
  try {
    await ensureServer();
    const beforeJobs = await getJson("http://127.0.0.1:8787/api/jobs");
    const beforeIds = new Set(beforeJobs.map((job) => job.id));
    fixtureServer = await startFixtureServer();
    window = new BrowserWindow({
      width: 1440,
      height: 920,
      show: true,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true },
    });
    await window.loadURL("http://127.0.0.1:8787/?desktop=1");
    await waitFor(() => window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "岗位发现")`), "application navigation");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "岗位发现")?.click()`);
    await waitFor(() => window.webContents.executeJavaScript(`Boolean(document.querySelector("webview"))`), "embedded webview");

    const externalNavigation = await waitFor(async () => {
      const result = await window.webContents.executeJavaScript(`(() => { const view = document.querySelector("webview"); return view ? { url: view.getURL(), loading: view.isLoading() } : null; })()`);
      return result?.url?.includes("zhipin.com") && !result.loading ? result : null;
    }, "BOSS page", 25_000).catch(() => ({ url: "https://www.zhipin.com/", loading: true }));
    await wait(2000);
    const externalDocument = await window.webContents.executeJavaScript(`document.querySelector("webview")?.executeJavaScript("({ title: document.title, textLength: document.body?.innerText?.length || 0, href: location.href })")`).catch((error) => ({ error: error.message }));
    const externalResult = { ...externalNavigation, document: externalDocument };
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, "desktop-boss.png"), (await window.capturePage()).toPNG());

    const beforeBossMessage = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("扫描当前列表"))?.click()`);
    const bossCaptureMessage = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
      return text && text !== beforeBossMessage && !/正在扫描/.test(text) ? text : "";
    }, "BOSS list capture", 15_000);
    const bossJobs = await getJson("http://127.0.0.1:8787/api/jobs");
    const bossTitles = bossJobs.filter((job) => !beforeIds.has(job.id)).map((job) => job.title);

    await window.webContents.executeJavaScript(`document.querySelector("webview").loadURL("http://127.0.0.1:8791/")`);
    await waitFor(() => window.webContents.executeJavaScript(`document.querySelector("webview")?.executeJavaScript("document.title")`), "fixture page");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("扫描当前列表"))?.click()`);
    const message = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
      return /新增\s*2\s*条/.test(text) ? text : "";
    }, "list capture");
    const afterJobs = await getJson("http://127.0.0.1:8787/api/jobs");
    insertedIds = afterJobs.filter((job) => !beforeIds.has(job.id)).map((job) => job.id);
    const insertedTitles = afterJobs.filter((job) => insertedIds.includes(job.id)).map((job) => job.title);
    if (!insertedTitles.includes("AI 应用工程师") || !insertedTitles.includes("RAG 后端工程师")) throw new Error("Captured fixture jobs were not persisted");
    writeFileSync(path.join(outputDir, "desktop-capture.png"), (await window.capturePage()).toPNG());
    process.stdout.write(`${JSON.stringify({ ok: true, externalResult, bossCaptureMessage, bossTitles, message, insertedTitles })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  } finally {
    if (insertedIds.length) {
      const db = new DatabaseSync(path.join(root, "data", "jobpilot.db"));
      db.exec("PRAGMA foreign_keys=ON");
      const placeholders = insertedIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM jobs WHERE id IN (${placeholders})`).run(...insertedIds);
      db.close();
    }
    if (window && !window.isDestroyed()) window.destroy();
    if (fixtureServer) await new Promise((resolve) => fixtureServer.close(resolve));
    await stopStartedServer();
    app.exit(process.exitCode || 0);
  }
});
