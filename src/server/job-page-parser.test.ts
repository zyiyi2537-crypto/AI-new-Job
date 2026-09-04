import { describe, expect, it } from "vitest";
import { buildSearchLinks, detectSource, parseJobHtml } from "./job-page-parser.js";

describe("job page parser", () => {
  it("extracts a standard JobPosting JSON-LD payload", () => {
    const html = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "AI 产品经理",
      hiringOrganization: { "@type": "Organization", name: "真实科技" },
      jobLocation: { address: { addressLocality: "杭州", addressRegion: "浙江" } },
      baseSalary: { currency: "CNY", value: { minValue: 20000, maxValue: 35000, unitText: "MONTH" } },
      description: "负责 AI 产品需求分析、用户研究、项目管理以及大模型应用落地，推动研发和设计团队协作。",
      datePosted: "2026-09-04",
    })}</script></head></html>`;

    const job = parseJobHtml("https://jobs.example.com/job/123", html);
    expect(job.title).toBe("AI 产品经理");
    expect(job.company).toBe("真实科技");
    expect(job.location).toContain("杭州");
    expect(job.salaryText).toContain("20000-35000");
    expect(job.description).toContain("用户研究");
  });

  it("detects supported platforms and produces search links", () => {
    expect(detectSource("https://www.zhipin.com/job_detail/abc.html")).toBe("boss");
    const links = buildSearchLinks("数据分析师", "上海");
    expect(links).toHaveLength(4);
    expect(links.find((item) => item.id === "boss")?.url).toContain("city=101020100");
    expect(links.find((item) => item.id === "zhaopin")?.url).toContain(encodeURIComponent("数据分析师"));
  });
});
