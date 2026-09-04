import path from "node:path";
import mammoth from "mammoth";
import type { ResumeItem, ResumeMasterData, ResumeSection } from "../shared/types.js";

const sectionPatterns: Array<{ type: ResumeSection["type"]; title: string; pattern: RegExp }> = [
  { type: "education", title: "教育经历", pattern: /^(教育经历|教育背景|学历|education)$/i },
  { type: "experience", title: "工作经历", pattern: /^(工作经历|工作经验|实习经历|职业经历|experience|work experience|employment)$/i },
  { type: "projects", title: "项目经历", pattern: /^(项目经历|项目经验|代表项目|projects?|project experience)$/i },
  { type: "skills", title: "专业技能", pattern: /^(专业技能|技能|技能清单|skills?|technical skills)$/i },
  { type: "certifications", title: "证书与奖项", pattern: /^(证书|证书与奖项|资格认证|获奖经历|certifications?|awards?)$/i },
  { type: "languages", title: "语言能力", pattern: /^(语言能力|语言|languages?)$/i },
  { type: "other", title: "其他信息", pattern: /^(自我评价|个人总结|兴趣爱好|其他|summary|profile|objective)$/i },
];

const datePattern = /(?:19|20)\d{2}[./年-]\d{1,2}|(?:19|20)\d{2}\s*[-–—至]\s*(?:至今|现在|present|(?:19|20)\d{2})/i;
const locationPattern = /^(北京|上海|天津|重庆|杭州|南京|苏州|广州|深圳|成都|武汉|西安|长沙|郑州|青岛|厦门|福州|宁波|合肥|济南|昆明|大连|无锡|佛山|东莞|海外|远程)(市)?$/;

function cleanLines(text: string): string[] {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
}

function stableId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, "0")}`;
}

function linesToItems(lines: string[], prefix: string): ResumeItem[] {
  const items: ResumeItem[] = [];
  let current: ResumeItem | null = null;
  for (const line of lines) {
    const bullet = line.replace(/^[•·▪◦*-]\s*/, "");
    const beginsEntry = datePattern.test(line) || (!/^[•·▪◦*-]/.test(line) && line.length < 48 && !/[。；;]$/.test(line));
    if (!current || (beginsEntry && current.bullets.length > 0)) {
      current = { id: stableId(prefix, items.length), heading: line, subheading: "", dateRange: line.match(datePattern)?.[0] || "", bullets: [] };
      items.push(current);
    } else if (beginsEntry && !current.subheading) {
      current.subheading = line;
    } else {
      current.bullets.push(bullet);
    }
  }
  return items;
}

function detectSection(line: string) {
  const normalized = line.replace(/[：:|]/g, "").trim();
  return sectionPatterns.find((section) => section.pattern.test(normalized));
}

export function structureResume(text: string): ResumeMasterData {
  const lines = cleanLines(text);
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const phone = text.match(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/)?.[0] || "";
  const name = lines.find((line) => line.length >= 2 && line.length <= 20 && !line.includes("@") && !/\d{5,}/.test(line) && !detectSection(line)) || "待确认姓名";

  const buckets = new Map<ResumeSection["type"], { title: string; lines: string[] }>();
  let currentType: ResumeSection["type"] = "other";
  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      currentType = section.type;
      if (!buckets.has(currentType)) buckets.set(currentType, { title: section.title, lines: [] });
      continue;
    }
    if (line === name || (email && line.includes(email)) || (phone && line.includes(phone))) continue;
    const bucket = buckets.get(currentType) || { title: currentType === "other" ? "个人概况" : currentType, lines: [] };
    bucket.lines.push(line);
    buckets.set(currentType, bucket);
  }

  const other = buckets.get("other")?.lines || [];
  const location = other.find((line) => locationPattern.test(line)) || "";
  const title = other.find((line) => line !== location && line.length < 40 && !datePattern.test(line)) || "";
  const summaryLines = other.filter((line) => line !== title && line !== location && (line.length >= 28 || /[。；;]/.test(line)));
  const consumedBasics = new Set([title, location, ...summaryLines].filter(Boolean));

  const sections: ResumeSection[] = [];
  let index = 0;
  for (const [type, bucket] of buckets) {
    const contentLines = type === "other" ? bucket.lines.filter((line) => !consumedBasics.has(line)) : bucket.lines;
    if (!contentLines.length) continue;
    sections.push({ id: stableId("section", index++), type, title: bucket.title, items: linesToItems(contentLines, type) });
  }

  return {
    basics: {
      name,
      title,
      email,
      phone,
      location,
      summary: summaryLines.slice(0, 2).join(" "),
    },
    sections,
    sourceText: lines.join("\n"),
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}

export async function extractResumeText(filename: string, mimeType: string, buffer: Buffer): Promise<{ text: string; parser: string }> {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".docx" || mimeType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, parser: "mammoth-docx" };
  }
  if (extension === ".pdf" || mimeType === "application/pdf") {
    const text = await extractPdf(buffer);
    if (text.trim().length < 30) throw new Error("该 PDF 没有可提取的文本层，OCR 将在下一里程碑提供；请先上传 DOCX 或文本型 PDF。");
    return { text, parser: "pdfjs" };
  }
  if (extension === ".json" || mimeType === "application/json") {
    const parsed = JSON.parse(buffer.toString("utf8"));
    return { text: JSON.stringify(parsed, null, 2), parser: "json" };
  }
  return { text: buffer.toString("utf8"), parser: extension === ".md" ? "markdown" : "plain-text" };
}
