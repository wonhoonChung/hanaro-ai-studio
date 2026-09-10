import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * DocumentJSON → HWPX(ZIP+OWPML)
 * assets/hwpx/blank.hwpx(python-hwpx로 만든 유효한 빈 문서)를 바탕으로
 * header.xml에 글자/문단 속성을 주입하고 section0.xml을 새로 만든다.
 */
export type DocTable = { header: string[]; rows: string[][] };
export type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "table"; table: DocTable };

export type DocumentJSON = {
  title: string;
  meta?: { to?: string; from?: string; date?: string; doc_no?: string };
  blocks: DocBlock[];
  closing?: string; // 예: "끝."
  attachments?: string[];
};

// blank.hwpx 기준 기존 속성: charPr 0(10pt 바탕), paraPr 0(양쪽정렬 160%), borderFill 3(실선 표)
const BASE_CHAR_CNT = 7;
const BASE_PARA_CNT = 20;
export const CP = { title: 7, heading: 8, body: 9, bodyBold: 10, small: 11 } as const;
export const PP = { center: 20, left: 21, bullet: 22, right: 23 } as const;

const BLANK_PATH = path.join(process.cwd(), "assets", "hwpx", "blank.hwpx");

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function charPr(id: number, heightPt: number, bold: boolean, hangulFont = 0) {
  return (
    `<hh:charPr id="${id}" height="${Math.round(heightPt * 100)}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
    `<hh:fontRef hangul="${hangulFont}" latin="${hangulFont}" hanja="${hangulFont}" japanese="${hangulFont}" other="${hangulFont}" symbol="${hangulFont}" user="${hangulFont}" />` +
    `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100" />` +
    `<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0" />` +
    `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100" />` +
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0" />` +
    (bold ? `<hh:bold />` : "") +
    `<hh:underline type="NONE" shape="SOLID" color="#000000" /><hh:strikeout shape="NONE" color="#000000" /><hh:outline type="NONE" /><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10" /></hh:charPr>`
  );
}

function paraPr(id: number, align: "LEFT" | "CENTER" | "JUSTIFY" | "RIGHT", opts: { indent?: number; left?: number; before?: number; after?: number; line?: number } = {}) {
  const margin = `<hh:margin><hc:intent value="${opts.indent ?? 0}" unit="HWPUNIT" /><hc:left value="${opts.left ?? 0}" unit="HWPUNIT" /><hc:right value="0" unit="HWPUNIT" /><hc:prev value="${opts.before ?? 0}" unit="HWPUNIT" /><hc:next value="${opts.after ?? 0}" unit="HWPUNIT" /></hh:margin><hh:lineSpacing type="PERCENT" value="${opts.line ?? 160}" unit="HWPUNIT" />`;
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">` +
    `<hh:align horizontal="${align}" vertical="BASELINE" /><hh:heading type="NONE" idRef="0" level="0" />` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK" /><hh:autoSpacing eAsianEng="0" eAsianNum="0" />` +
    `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}</hp:case><hp:default>${margin}</hp:default></hp:switch>` +
    `<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0" /></hh:paraPr>`
  );
}

/** header.xml에 우리 charPr/paraPr를 추가하고 itemCnt를 갱신 */
export function injectStyles(header: string): string {
  if (header.includes(`<hh:charPr id="${CP.title}"`)) return header; // 이미 주입됨
  const chars = [charPr(CP.title, 20, true), charPr(CP.heading, 14, true), charPr(CP.body, 11.5, false), charPr(CP.bodyBold, 11.5, true), charPr(CP.small, 9.5, false)].join("");
  const paras = [
    paraPr(PP.center, "CENTER", { before: 200, after: 400 }),
    paraPr(PP.left, "JUSTIFY", { after: 120 }),
    paraPr(PP.bullet, "JUSTIFY", { indent: -1000, left: 1000, after: 60 }),
    paraPr(PP.right, "RIGHT"),
  ].join("");
  const out = header
    .replace(/<hh:charProperties itemCnt="(\d+)">/, (_m, n) => `<hh:charProperties itemCnt="${Math.max(Number(n), BASE_CHAR_CNT) + 5}">`)
    .replace("</hh:charProperties>", chars + "</hh:charProperties>")
    .replace(/<hh:paraProperties itemCnt="(\d+)">/, (_m, n) => `<hh:paraProperties itemCnt="${Math.max(Number(n), BASE_PARA_CNT) + 4}">`)
    .replace("</hh:paraProperties>", paras + "</hh:paraProperties>");
  return out;
}

let pid = 1000;
const nextId = () => String(++pid);

function p(text: string, cp: number, pp: number, pageBreak = false) {
  return `<hp:p id="${nextId()}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
}

function tbl(t: DocTable) {
  const cols = Math.max(1, t.header.length || t.rows[0]?.length || 1);
  const rows = [t.header, ...t.rows].filter((r) => r && r.length);
  const totalW = 42520; // 본문 폭(HWPUNIT)
  const cw = Math.floor(totalW / cols);
  const rh = 1200;
  const cell = (text: string, c: number, r: number, bold: boolean) =>
    `<hp:tc name="" header="${r === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="1" borderFillIDRef="3"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `<hp:p id="${nextId()}" paraPrIDRef="${PP.center}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${bold ? CP.bodyBold : CP.body}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>` +
    `</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}" /><hp:cellSpan colSpan="1" rowSpan="1" /><hp:cellSz width="${cw}" height="${rh}" /><hp:cellMargin left="141" right="141" top="141" bottom="141" /></hp:tc>`;
  const trs = rows
    .map((r, ri) => `<hp:tr>${Array.from({ length: cols }, (_, ci) => cell(r[ci] ?? "", ci, ri, ri === 0 && t.header.length > 0)).join("")}</hp:tr>`)
    .join("");
  return (
    `<hp:p id="${nextId()}" paraPrIDRef="${PP.left}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CP.body}">` +
    `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${cw * cols}" widthRelTo="ABSOLUTE" height="${rh * rows.length}" heightRelTo="ABSOLUTE" protect="0" /><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0" /><hp:outMargin left="0" right="0" top="283" bottom="283" /><hp:inMargin left="141" right="141" top="141" bottom="141" />` +
    trs +
    `</hp:tbl></hp:run></hp:p>`
  );
}

/** blank.hwpx의 첫 문단(secPr 포함)을 유지하고 그 뒤에 본문을 붙인다 */
export function buildSectionXml(blankSection: string, doc: DocumentJSON): string {
  const firstParaEnd = blankSection.indexOf("</hp:p>") + "</hp:p>".length;
  const head = blankSection.slice(0, firstParaEnd);
  const body: string[] = [];

  if (doc.meta?.doc_no) body.push(p(`문서번호: ${doc.meta.doc_no}`, CP.small, PP.right));
  body.push(p(doc.title, CP.title, PP.center));
  if (doc.meta?.to) body.push(p(`수신  ${doc.meta.to}`, CP.body, PP.left));
  if (doc.meta?.from) body.push(p(`발신  ${doc.meta.from}`, CP.body, PP.left));
  if (doc.meta?.date) body.push(p(`시행일  ${doc.meta.date}`, CP.body, PP.left));
  if (doc.meta && (doc.meta.to || doc.meta.from || doc.meta.date)) body.push(p("", CP.body, PP.left));

  for (const b of doc.blocks) {
    if (b.type === "heading") body.push(p(b.text, CP.heading, PP.left));
    else if (b.type === "paragraph") body.push(p(b.text, CP.body, PP.left));
    else if (b.type === "bullets") for (const it of b.items) body.push(p(`○ ${it}`, CP.body, PP.bullet));
    else if (b.type === "table") body.push(tbl(b.table));
  }

  if (doc.attachments?.length) {
    body.push(p("", CP.body, PP.left));
    if (doc.attachments.length === 1) body.push(p(`붙임  ${doc.attachments[0]}  ${doc.closing ?? "끝."}`, CP.body, PP.left));
    else {
      doc.attachments.forEach((a, i) => body.push(p(`${i === 0 ? "붙임  " : "        "}${i + 1}. ${a}${i === doc.attachments!.length - 1 ? `  ${doc.closing ?? "끝."}` : ""}`, CP.body, PP.left)));
    }
  } else if (doc.closing) {
    body.push(p("", CP.body, PP.left));
    body.push(p(doc.closing, CP.body, PP.right));
  }

  return head + body.join("") + "</hs:sec>";
}

function previewText(doc: DocumentJSON) {
  const lines = [doc.title];
  for (const b of doc.blocks) {
    if (b.type === "heading" || b.type === "paragraph") lines.push(b.text);
    else if (b.type === "bullets") lines.push(...b.items.map((i) => `○ ${i}`));
    else if (b.type === "table") lines.push(...[b.table.header, ...b.table.rows].map((r) => r.join(" | ")));
  }
  return lines.join("\r\n").slice(0, 4000);
}

export async function buildHwpx(doc: DocumentJSON, blankBuffer?: Buffer): Promise<Buffer> {
  const blank = blankBuffer ?? (await fs.readFile(BLANK_PATH));
  const zin = await JSZip.loadAsync(blank);
  const header = await zin.file("Contents/header.xml")!.async("string");
  const section = await zin.file("Contents/section0.xml")!.async("string");

  const zout = new JSZip();
  // mimetype은 첫 항목, 무압축이어야 한다
  zout.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  for (const name of Object.keys(zin.files)) {
    if (name === "mimetype") continue;
    const f = zin.files[name];
    if (f.dir) continue;
    if (name === "Contents/header.xml") zout.file(name, injectStyles(header), { compression: "DEFLATE" });
    else if (name === "Contents/section0.xml") zout.file(name, buildSectionXml(section, doc), { compression: "DEFLATE" });
    else if (name === "Preview/PrvText.txt") zout.file(name, previewText(doc), { compression: "DEFLATE" });
    else zout.file(name, await f.async("nodebuffer"), { compression: "DEFLATE" });
  }
  return zout.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}
