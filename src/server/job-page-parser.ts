import { createHash } from "node:crypto";
import { load } from "cheerio";
import { bossCityCode, normalizeCityName } from "../shared/cities.js";
import type { Job } from "../shared/types.js";

type ImportedJob = Omit<Job, "id" | "collectedAt" | "analysis">;

const selectors: Record<string, { title: string; company: string; description: string; salary: string; location: string }> = {
  boss: {
    title: ".name h1, .job-name, h1",
    company: ".company-info a, .sider-company .company-info a, .job-detail-company .company-name",
    description: ".job-sec-text, .job-detail-section, .job-detail",
    salary: ".name .salary, .job-status .salary, .salary",
    location: ".text-city, .location-address, .job-address",
  },
  zhaopin: {
    title: ".job-name, .job-header__title, h1",
    company: ".company-name, .company__title, [class*=company] a",
    description: ".describtion__detail-content, .job-detail__content, [class*=job-detail]",
    salary: ".job-summary__salary, [class*=salary]",
    location: ".job-summary__address, [class*=address]",
  },
  liepin: {
    title: ".job-apply-content-left h1, .job-title-box h1, h1",
    company: ".company-card h3, .company-info h3, [class*=company] a",
    description: ".job-intro-container, .job-detail, [class*=job-intro]",
    salary: ".job-title-box .salary, [class*=salary]",
    location: ".job-properties span, [class*=address]",
  },
  lagou: {
    title: ".position-head h1, .job-name, h1",
    company: ".company, .company-name, [class*=company] a",
    description: ".job-detail, .position-detail, [class*=description]",
    salary: ".salary, [class*=salary]",
    location: ".address, [class*=location]",
  },
};

export function detectSource(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("zhipin.com")) return "boss";
  if (hostname.includes("zhaopin.com")) return "zhaopin";
  if (hostname.includes("liepin.com")) return "liepin";
  if (hostname.includes("lagou.com")) return "lagou";
  if (hostname.includes("51job.com")) return "51job";
  return "web";
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return object;
  return findJobPosting(object["@graph"]);
}

function readAddress(value: unknown): string {
  if (Array.isArray(value)) return value.map(readAddress).filter(Boolean).join(" / ");
  if (!value || typeof value !== "object") return clean(value);
  const object = value as Record<string, unknown>;
  const address = (object.address && typeof object.address === "object" ? object.address : object) as Record<string, unknown>;
  return [address.addressLocality, address.addressRegion].map(clean).filter(Boolean).join(" · ");
}

function readSalary(value: unknown): string {
  if (!value || typeof value !== "object") return clean(value);
  const object = value as Record<string, unknown>;
  const nested = object.value && typeof object.value === "object" ? object.value as Record<string, unknown> : object;
  const min = clean(nested.minValue);
  const max = clean(nested.maxValue);
  const unit = clean(nested.unitText || object.currency);
  return [min && max ? `${min}-${max}` : min || max, unit].filter(Boolean).join(" ");
}

export function parseJobHtml(url: string, html: string): ImportedJob {
  const $ = load(html);
  const source = detectSource(url);
  let structured: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_index, element) => {
    if (structured) return;
    try { structured = findJobPosting(JSON.parse($(element).text())); } catch { /* Invalid JSON-LD is ignored. */ }
  });
  const posting = structured as Record<string, unknown> | null;
  const sourceSelectors = selectors[source];
  const organization = posting?.hiringOrganization as Record<string, unknown> | undefined;
  const title = clean(posting?.title || (sourceSelectors ? $(sourceSelectors.title).first().text() : $("h1").first().text()) || $('meta[property="og:title"]').attr("content"));
  const company = clean(organization?.name || (sourceSelectors ? $(sourceSelectors.company).first().text() : $('[class*=company]').first().text())) || "待确认公司";
  const rawDescription = clean(posting?.description || (sourceSelectors ? $(sourceSelectors.description).first().text() : $("main").text()));
  const description = clean(load(`<div>${rawDescription}</div>`).text()).slice(0, 30_000);
  const salaryText = clean(posting?.baseSalary ? readSalary(posting.baseSalary) : sourceSelectors ? $(sourceSelectors.salary).first().text() : "");
  const location = clean(posting?.jobLocation ? readAddress(posting.jobLocation) : sourceSelectors ? $(sourceSelectors.location).first().text() : "");
  if (!title || description.length < 20) throw new Error("页面没有提供可识别的完整岗位信息；请登录网站后使用 Chrome 采集助手读取当前页面");
  return {
    source,
    sourceJobId: createHash("sha1").update(url).digest("hex"),
    title,
    company,
    location,
    salaryText,
    salaryMin: null,
    salaryMax: null,
    description,
    url,
    status: "new",
    postedAt: clean(posting?.datePosted),
  };
}

function assertPublicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("只支持 http 或 https 岗位链接");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("不允许导入本机或内网地址");
  }
  return url;
}

export async function importJobFromUrl(rawUrl: string): Promise<ImportedJob> {
  const url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      },
    });
    if (!response.ok) throw new Error(`岗位页面返回 ${response.status}，请改用 Chrome 采集助手`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("该链接不是 HTML 岗位页面");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 3 * 1024 * 1024) throw new Error("岗位页面过大，已停止读取");
    const html = await response.text();
    if (html.length > 3 * 1024 * 1024) throw new Error("岗位页面过大，已停止读取");
    return parseJobHtml(response.url, html);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSearchLinks(query: string, city: string): Array<{ id: string; name: string; url: string }> {
  const q = encodeURIComponent(query.trim());
  const normalizedCity = normalizeCityName(city);
  const cityQuery = normalizedCity === "全国" ? "" : normalizedCity;
  const c = encodeURIComponent(cityQuery);
  const bossCity = bossCityCode(normalizedCity);
  return [
    { id: "boss", name: "BOSS 直聘", url: `https://www.zhipin.com/web/geek/jobs?query=${q}${bossCity ? `&city=${bossCity}` : ""}` },
    { id: "zhaopin", name: "智联招聘", url: `https://sou.zhaopin.com/?kw=${q}${c ? `&jl=${c}` : ""}` },
    { id: "liepin", name: "猎聘", url: `https://www.liepin.com/zhaopin/?key=${q}${c ? `&dq=${c}` : ""}` },
    { id: "lagou", name: "拉勾", url: `https://www.lagou.com/wn/jobs?kd=${q}${c ? `&city=${c}` : ""}` },
  ];
}
