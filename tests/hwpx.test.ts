import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildHwpx, injectStyles, buildSectionXml, esc, type DocumentJSON } from "@/lib/hwpx/build";

const doc: DocumentJSON = {
  title: "2026년 추석 선물세트 예약 판매 계획",
  meta: { to: "각 지점장", from: "안성농협 하나로마트 사업소", date: "2026. 9. 10." },
  blocks: [
    { type: "heading", text: "1. 추진 배경" },
    { type: "paragraph", text: "조합원 <소득> 증대 & 매출 확대를 위해 추진합니다." },
    { type: "bullets", items: ["기간: 9월 1일 ~ 9월 20일", "장소: 본점 2층"] },
    { type: "table", table: { header: ["구분", "수량", "금액"], rows: [["배 5kg", "100", "45,000"], ["배 7.5kg", "50", "65,000"]] } },
  ],
  attachments: ["선물세트 구성표 1부."],
  closing: "끝.",
};

/** 태그 균형 검사(간이): 여는 태그 수 == 닫는 태그 수 (self-closing 제외) */
function balanced(xml: string) {
  const open = (xml.match(/<hp:(p|run|tbl|tr|tc|subList)(?:\s[^>]*[^/])?>/g) ?? []).length;
  const close = (xml.match(/<\/hp:(p|run|tbl|tr|tc|subList)>/g) ?? []).length;
  return open === close;
}

describe("hwpx builder", () => {
  it("esc는 XML 특수문자를 이스케이프한다", () => {
    expect(esc('a<b>&"c"')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });

  it("header.xml에 스타일이 주입되고 itemCnt가 늘어난다 (멱등)", () => {
    const h = `<hh:head><hh:charProperties itemCnt="7"><hh:charPr id="0"/></hh:charProperties><hh:paraProperties itemCnt="20"><hh:paraPr id="0"/></hh:paraProperties></hh:head>`;
    const once = injectStyles(h);
    expect(once).toContain('itemCnt="12"');
    expect(once).toContain('itemCnt="24"');
    expect(once).toContain('<hh:charPr id="7"');
    expect(once).toContain('<hh:paraPr id="20"');
    expect(injectStyles(once)).toBe(once);
  });

  it("section0.xml에 제목·본문·표·붙임이 들어가고 태그가 균형 잡힌다", () => {
    const blank = `<hs:sec xmlns:hp="x" xmlns:hs="y"><hp:p id="0"><hp:run charPrIDRef="0"><hp:secPr/></hp:run></hp:p><hp:p id="1"><hp:run charPrIDRef="0"><hp:t>old</hp:t></hp:run></hp:p></hs:sec>`;
    const xml = buildSectionXml(blank, doc);
    expect(xml).not.toContain(">old<");
    expect(xml).toContain("<hp:secPr/>");
    expect(xml).toContain(esc(doc.title));
    expect(xml).toContain("&lt;소득&gt; 증대 &amp;");
    expect(xml).toContain("○ 기간: 9월 1일 ~ 9월 20일");
    expect(xml).toContain('rowCnt="3" colCnt="3"');
    expect(xml).toContain("붙임  선물세트 구성표 1부.  끝.");
    expect(xml.endsWith("</hs:sec>")).toBe(true);
    expect(balanced(xml)).toBe(true);
  });

  it("실제 blank.hwpx로 유효한 ZIP을 만든다", async () => {
    const buf = await buildHwpx(doc);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/hwp+zip");
    const sec = await zip.file("Contents/section0.xml")!.async("string");
    expect(sec).toContain("추석 선물세트");
    expect(sec).toContain("<hp:tbl");
    const header = await zip.file("Contents/header.xml")!.async("string");
    expect(header).toContain('<hh:charPr id="7"');
    expect(header).toContain('<hh:paraPr id="20"');
    expect(await zip.file("Preview/PrvText.txt")!.async("string")).toContain("1. 추진 배경");
  });
});
