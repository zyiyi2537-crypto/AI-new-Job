const API_ROOT = "http://127.0.0.1:8787";
const captureButton = document.querySelector("#capture");
const scanButton = document.querySelector("#scan");
const statusBox = document.querySelector("#status");
const healthDot = document.querySelector("#health");

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = type;
}

function setBusy(busy) {
  captureButton.disabled = busy;
  scanButton.disabled = busy;
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_ROOT}/api/health`);
    if (!response.ok) throw new Error();
    healthDot.classList.add("online");
    setStatus("本地工作台已连接，可以开始采集。", "success");
  } catch {
    healthDot.classList.remove("online");
    setStatus("无法连接本地工作台。请先运行 npm start。", "error");
  }
}

function collectFromPage(mode) {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const pick = (root, selector) => clean(root.querySelector(selector)?.textContent);
  const hostname = location.hostname.toLowerCase();
  const source = hostname.includes("zhipin.com") ? "boss" : hostname.includes("zhaopin.com") ? "zhaopin" : hostname.includes("liepin.com") ? "liepin" : hostname.includes("lagou.com") ? "lagou" : hostname.includes("51job.com") ? "51job" : "web";
  const map = {
    boss: { title: ".name h1, .job-name, h1", company: ".company-info a, .sider-company a, [class*=company] a", description: ".job-sec-text, .job-detail-section, .job-detail", salary: ".name .salary, .job-status .salary, .salary", location: ".text-city, .location-address, .job-address" },
    zhaopin: { title: ".job-name, .job-header__title, h1", company: ".company-name, .company__title, [class*=company] a", description: ".describtion__detail-content, .job-detail__content, [class*=job-detail]", salary: ".job-summary__salary, [class*=salary]", location: ".job-summary__address, [class*=address]" },
    liepin: { title: ".job-apply-content-left h1, .job-title-box h1, h1", company: ".company-card h3, .company-info h3, [class*=company] a", description: ".job-intro-container, .job-detail, [class*=job-intro]", salary: ".job-title-box .salary, [class*=salary]", location: ".job-properties span, [class*=address]" },
    lagou: { title: ".position-head h1, .job-name, h1", company: ".company, .company-name, [class*=company] a", description: ".job-detail, .position-detail, [class*=description]", salary: ".salary, [class*=salary]", location: ".address, [class*=location]" },
    web: { title: "h1", company: "[class*=company]", description: "main, article", salary: "[class*=salary]", location: "[class*=location], [class*=address]" },
  };
  const selectors = map[source] || map.web;

  const structuredJobs = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const value = JSON.parse(script.textContent || "null");
      const queue = Array.isArray(value) ? [...value] : [value];
      while (queue.length) {
        const entry = queue.shift();
        if (!entry || typeof entry !== "object") continue;
        const types = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]];
        if (types.includes("JobPosting")) structuredJobs.push(entry);
        if (Array.isArray(entry["@graph"])) queue.push(...entry["@graph"]);
      }
    } catch { /* Ignore invalid JSON-LD. */ }
  });

  const fromStructured = (entry) => {
    const address = Array.isArray(entry.jobLocation) ? entry.jobLocation[0]?.address : entry.jobLocation?.address;
    const salary = entry.baseSalary?.value || entry.baseSalary;
    return {
      source,
      title: clean(entry.title),
      company: clean(entry.hiringOrganization?.name) || "待确认公司",
      location: clean(address?.addressLocality || address?.addressRegion),
      salaryText: clean(salary?.minValue && salary?.maxValue ? `${salary.minValue}-${salary.maxValue}` : salary?.value),
      description: clean(new DOMParser().parseFromString(String(entry.description || ""), "text/html").body.textContent).slice(0, 30000),
      url: clean(entry.url) || location.href,
      postedAt: clean(entry.datePosted),
    };
  };

  if (mode === "current") {
    if (structuredJobs.length) return [fromStructured(structuredJobs[0])];
    return [{
      source,
      title: pick(document, selectors.title) || clean(document.title.split(/[-_|]/)[0]),
      company: pick(document, selectors.company) || "待确认公司",
      location: pick(document, selectors.location),
      salaryText: pick(document, selectors.salary),
      description: pick(document, selectors.description).slice(0, 30000),
      url: location.href,
      postedAt: "",
    }];
  }

  if (structuredJobs.length > 1) return structuredJobs.slice(0, 50).map(fromStructured);
  const hrefPattern = /job_detail|\/jobs?\/|jobdetail|position_detail|position\/\d/i;
  const anchors = [...document.querySelectorAll("a[href]")].filter((anchor) => hrefPattern.test(anchor.href));
  const unique = new Map();
  for (const anchor of anchors) {
    if (unique.size >= 50) break;
    const card = anchor.closest("li, article, [class*=job-card], [class*=job-list], [class*=position]") || anchor.parentElement;
    if (!card) continue;
    const cardText = clean(card.innerText).slice(0, 4000);
    const title = clean(anchor.getAttribute("title") || pick(card, "[class*=job-name], [class*=title], h3") || anchor.textContent);
    if (!title || cardText.length < 20) continue;
    unique.set(anchor.href, {
      source,
      title,
      company: pick(card, "[class*=company]") || "待确认公司",
      location: pick(card, "[class*=location], [class*=address], [class*=area]"),
      salaryText: pick(card, "[class*=salary]"),
      description: cardText,
      url: anchor.href,
      postedAt: "",
    });
  }
  return [...unique.values()];
}

async function collect(mode) {
  setBusy(true);
  setStatus(mode === "current" ? "正在读取当前岗位..." : "正在扫描当前列表...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("请先打开一个招聘网站页面");
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectFromPage, args: [mode] });
    const jobs = Array.isArray(result) ? result.filter((job) => job.title && job.description?.length >= 20) : [];
    if (!jobs.length) throw new Error("没有识别到完整岗位。请打开岗位详情页后重试");
    const response = await fetch(`${API_ROOT}/api/jobs/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobs),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `导入失败 (${response.status})`);
    setStatus(`读取 ${payload.received} 条，新增 ${payload.inserted} 条。重复岗位不会再次入库。`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "采集失败", "error");
  } finally {
    setBusy(false);
  }
}

captureButton.addEventListener("click", () => collect("current"));
scanButton.addEventListener("click", () => collect("list"));
checkHealth();
