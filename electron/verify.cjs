const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output", "playwright");
const testDataDir = mkdtempSync(path.join(tmpdir(), "jobpilot-desktop-"));
const apiPort = 8877;
const apiBase = `http://127.0.0.1:${apiPort}`;
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

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const request = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) return reject(new Error(`${url} returned ${response.statusCode}: ${raw}`));
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function ensureServer() {
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  serverProcess = spawn(process.execPath, [tsxCli, path.join(root, "src", "server", "index.ts")], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DATA_DIR: testDataDir, PORT: String(apiPort), OPENAI_API_KEY: "", OPENAI_MODEL: "" },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitFor(async () => {
    if (serverProcess.exitCode != null) throw new Error("Local server exited during startup");
    try { return await getJson(`${apiBase}/api/health`); } catch { return null; }
  }, "local server");
}

async function uploadFixtureResume() {
  const body = new FormData();
  body.append("file", new Blob([
    "张明\nAI 应用工程师\n杭州\n\n个人简介\n具备 AI 应用、RAG 检索和后端接口开发经验。\n\n工作经历\n示例科技 AI 应用工程师 2022-至今\n使用 Python、FastAPI 和向量数据库交付企业知识库。\n\n专业技能\nPython、FastAPI、RAG、MySQL、Vue、TypeScript",
  ], { type: "text/plain;charset=utf-8" }), "desktop-fixture-resume.txt");
  const response = await fetch(`${apiBase}/api/resumes/import`, { method: "POST", body });
  if (!response.ok) throw new Error(`Fixture resume upload returned ${response.status}: ${await response.text()}`);
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

function startAIFixtureServer() {
  const server = http.createServer((request, response) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      if (request.url === "/models") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<html>provider console</html>");
        return;
      }
      if (request.url === "/v1/models") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ data: [
          { id: "fixture-chat-primary" },
          { id: "text-embedding-fixture" },
          { id: "fixture-chat-secondary" },
        ] }));
        return;
      }
      if (request.url === "/chat/completions") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<html>provider console</html>");
        return;
      }
      const body = JSON.parse(raw || "{}");
      const system = String(body.messages?.[0]?.content || "");
      const content = system.includes("招聘搜索策略规划器")
        ? {
          strategies: [
            { title: "AI 应用工程师", query: "AI 应用工程师 RAG", keywords: ["RAG", "Python"], reason: "母版包含 AI 应用和 RAG 的可验证项目经历。", confidence: 96 },
            { title: "Python 工程师", query: "Python 工程师 FastAPI", keywords: ["Python", "FastAPI"], reason: "母版中的后端接口经验可以直接支持该方向。", confidence: 87 },
            { title: "前端工程师", query: "前端工程师 Vue", keywords: ["Vue", "TypeScript"], reason: "母版包含前端项目和 Vue 的直接使用证据。", confidence: 79 },
          ],
        }
        : system.includes("中文求职匹配分析器")
          ? {
            summary: "岗位职责与母版中的 AI 应用开发和接口联调经历存在直接证据。",
            strengths: ["母版包含与岗位相关的 Python 和 RAG 项目证据"],
            gaps: ["岗位中的具体业务场景仍需在面试前进一步确认"],
            dimensionReasons: {
              hard: "母版与岗位硬性条件未发现明显冲突",
              skills: "母版技能与 JD 关键词存在直接命中",
              evidence: "相关技能能够映射到已有项目经历",
              preference: "岗位方向与当前目标职位一致",
              quality: "JD 职责和任职要求信息完整",
            },
          }
          : { ok: true };
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8792, "127.0.0.1", () => resolve(server));
  });
}

app.whenReady().then(async () => {
  let fixtureServer = null;
  let aiFixtureServer = null;
  let window = null;
  let insertedIds = [];
  try {
    await ensureServer();
    await uploadFixtureResume();
    aiFixtureServer = await startAIFixtureServer();
    await postJson(`${apiBase}/api/ai/config`, { baseUrl: "http://127.0.0.1:8792", apiKey: "desktop-fixture-key", model: "desktop-verification" });
    const beforeJobs = await getJson(`${apiBase}/api/jobs`);
    const beforeIds = new Set(beforeJobs.map((job) => job.id));
    fixtureServer = await startFixtureServer();
    window = new BrowserWindow({
      width: 1440,
      height: 920,
      show: true,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true },
    });
    await window.loadURL(`${apiBase}/?desktop=1`);
    await waitFor(() => window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "岗位发现")`), "application navigation");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "设置")?.click()`);
    const syncedModels = await waitFor(async () => {
      const models = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll(".ai-settings select option")).map((option) => option.value)`);
      return models.length ? models : null;
    }, "automatic model synchronization");
    const selectedModel = await window.webContents.executeJavaScript(`document.querySelector(".ai-settings select")?.value || ""`);
    if (selectedModel !== "fixture-chat-primary" || syncedModels.includes("text-embedding-fixture")) throw new Error("Upstream model synchronization did not select a valid chat model");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "应用配置")?.click()`);
    await waitFor(async () => /配置已载入/.test(await window.webContents.executeJavaScript(`document.querySelector(".settings-message")?.textContent || ""`)), "model configuration");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "测试连接")?.click()`);
    const connectionMessage = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".settings-message")?.textContent || ""`);
      return /连接成功/.test(text) ? text : "";
    }, "AI connection test");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, "desktop-settings.png"), (await window.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "岗位发现")?.click()`);
    const planQueries = await waitFor(async () => {
      const queries = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll(".strategy-list code")).map((node) => node.textContent?.trim()).filter(Boolean)`);
      return queries.length ? queries : null;
    }, "resume search plan");
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
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("扫描并匹配"))?.click()`);
    const bossCaptureMessage = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
      return text && text !== beforeBossMessage && !/正在扫描/.test(text) ? text : "";
    }, "BOSS list capture", 15_000);
    const bossJobs = await getJson(`${apiBase}/api/jobs`);
    const bossTitles = bossJobs.filter((job) => !beforeIds.has(job.id)).map((job) => job.title);

    await window.webContents.executeJavaScript(`document.querySelector("webview").loadURL("http://127.0.0.1:8791/")`);
    await waitFor(() => window.webContents.executeJavaScript(`document.querySelector("webview")?.executeJavaScript("document.title")`), "fixture page");
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("扫描并匹配"))?.click()`);
    const message = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
      return /新增\s*2\s*条/.test(text) ? text : "";
    }, "list capture");
    const afterJobs = await getJson(`${apiBase}/api/jobs`);
    insertedIds = afterJobs.filter((job) => !beforeIds.has(job.id)).map((job) => job.id);
    const insertedTitles = afterJobs.filter((job) => insertedIds.includes(job.id)).map((job) => job.title);
    if (!insertedTitles.includes("AI 应用工程师") || !insertedTitles.includes("RAG 后端工程师")) throw new Error("Captured fixture jobs were not persisted");
    const variantsBefore = await getJson(`${apiBase}/api/variants`);
    const variantIdsBefore = new Set(variantsBefore.map((variant) => variant.id));
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("生成 Top 3 简历"))?.click()`);
    const prepareMessage = await waitFor(async () => {
      const text = await window.webContents.executeJavaScript(`document.querySelector(".browser-message")?.textContent || ""`);
      return /已准备\s*2\s*份岗位简历/.test(text) ? text : "";
    }, "resume preparation");
    const variantsAfter = await getJson(`${apiBase}/api/variants`);
    const variantTitles = variantsAfter.filter((variant) => !variantIdsBefore.has(variant.id)).map((variant) => variant.jobTitle);
    if (!variantTitles.includes("AI 应用工程师") || !variantTitles.includes("RAG 后端工程师")) throw new Error("Job-specific resume variants were not persisted");
    writeFileSync(path.join(outputDir, "desktop-capture.png"), (await window.capturePage()).toPNG());
    process.stdout.write(`${JSON.stringify({ ok: true, syncedModels, selectedModel, connectionMessage, planQueries, externalResult, bossCaptureMessage, bossTitles, message, insertedTitles, prepareMessage, variantTitles })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    if (fixtureServer) await new Promise((resolve) => fixtureServer.close(resolve));
    if (aiFixtureServer) await new Promise((resolve) => aiFixtureServer.close(resolve));
    await stopStartedServer();
    rmSync(testDataDir, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
});
