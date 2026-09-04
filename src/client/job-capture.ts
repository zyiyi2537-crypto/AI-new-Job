export type CapturedJob = {
  source: string;
  title: string;
  company: string;
  location: string;
  salaryText: string;
  description: string;
  url: string;
  postedAt: string;
};

export function collectJobsFromPage(mode: "current" | "list"): CapturedJob[] {
  const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
  const pick = (root: ParentNode, selector: string) => clean(root.querySelector(selector)?.textContent);
  const hostname = location.hostname.toLowerCase();
  const source = hostname.includes("zhipin.com") ? "boss" : hostname.includes("zhaopin.com") ? "zhaopin" : hostname.includes("liepin.com") ? "liepin" : hostname.includes("lagou.com") ? "lagou" : hostname.includes("51job.com") ? "51job" : "web";
  const map = {
    boss: { title: ".name h1, .job-name, h1", company: ".company-info a, .sider-company a, [class*=company] a", description: ".job-sec-text, .job-detail-section, .job-detail", salary: ".name .salary, .job-status .salary, .salary", location: ".text-city, .location-address, .job-address" },
    zhaopin: { title: ".job-name, .job-header__title, h1", company: ".company-name, .company__title, [class*=company] a", description: ".describtion__detail-content, .job-detail__content, [class*=job-detail]", salary: ".job-summary__salary, [class*=salary]", location: ".job-summary__address, [class*=address]" },
    liepin: { title: ".job-apply-content-left h1, .job-title-box h1, h1", company: ".company-card h3, .company-info h3, [class*=company] a", description: ".job-intro-container, .job-detail, [class*=job-intro]", salary: ".job-title-box .salary, [class*=salary]", location: ".job-properties span, [class*=address]" },
    lagou: { title: ".position-head h1, .job-name, h1", company: ".company, .company-name, [class*=company] a", description: ".job-detail, .position-detail, [class*=description]", salary: ".salary, [class*=salary]", location: ".address, [class*=location]" },
    web: { title: "h1", company: "[class*=company]", description: "main, article", salary: "[class*=salary]", location: "[class*=location], [class*=address]" },
  };
  const selectors = map[source as keyof typeof map] || map.web;
  const structuredJobs: Array<Record<string, unknown>> = [];

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const value = JSON.parse(script.textContent || "null");
      const queue = Array.isArray(value) ? [...value] : [value];
      while (queue.length) {
        const entry = queue.shift();
        if (!entry || typeof entry !== "object") continue;
        const object = entry as Record<string, unknown>;
        const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
        if (types.includes("JobPosting")) structuredJobs.push(object);
        if (Array.isArray(object["@graph"])) queue.push(...object["@graph"]);
      }
    } catch { /* Ignore invalid JSON-LD. */ }
  });

  const fromStructured = (entry: Record<string, any>): CapturedJob => {
    const jobLocation = Array.isArray(entry.jobLocation) ? entry.jobLocation[0] : entry.jobLocation;
    const address = jobLocation?.address || {};
    const salary = entry.baseSalary?.value || entry.baseSalary || {};
    const description = new DOMParser().parseFromString(String(entry.description || ""), "text/html").body.textContent;
    return {
      source,
      title: clean(entry.title),
      company: clean(entry.hiringOrganization?.name) || "待确认公司",
      location: clean(address.addressLocality || address.addressRegion),
      salaryText: clean(salary.minValue && salary.maxValue ? `${salary.minValue}-${salary.maxValue}` : salary.value),
      description: clean(description).slice(0, 30_000),
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
      description: pick(document, selectors.description).slice(0, 30_000),
      url: location.href,
      postedAt: "",
    }];
  }

  if (structuredJobs.length > 1) return structuredJobs.slice(0, 50).map(fromStructured);
  const hrefPatterns: Record<string, RegExp> = {
    boss: /\/job_detail\/[^?#]+/i,
    zhaopin: /\/jobdetail\/|\/jobs?\/\d+/i,
    liepin: /\/job\/\d+/i,
    lagou: /\/wn\/jobs\/\d+/i,
    "51job": /\/job\/\d+/i,
    web: /job_detail|\/jobs?\/|jobdetail|position_detail|position\/\d/i,
  };
  const hrefPattern = hrefPatterns[source] || hrefPatterns.web;
  const ignoredTitles = new Set(["职位搜索", "职位描述", "岗位详情", "查看详情", "公司主页", "立即沟通"]);
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((anchor) => hrefPattern.test(anchor.href));
  const unique = new Map<string, CapturedJob>();
  for (const anchor of anchors) {
    if (unique.size >= 50) break;
    const card = anchor.closest("li, article, [class*=job-card], [class*=job-list], [class*=position]") || anchor.parentElement;
    if (!card) continue;
    const cardText = clean((card as HTMLElement).innerText).slice(0, 4000);
    const title = clean(anchor.getAttribute("title") || pick(card, "[class*=job-name], [class*=title], h3") || anchor.textContent);
    if (!title || ignoredTitles.has(title) || cardText.length < 20) continue;
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
