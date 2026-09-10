import { describe, it, expect } from "vitest";
import { escapeDrawtext, escapeFilterPath, subtitleFilter, cuesFromSegments } from "@/lib/video/subtitles";

describe("subtitles", () => {
  it("drawtext 특수문자 이스케이프", () => {
    expect(escapeDrawtext("9월 20일까지 ☎ 031-000-0000")).toBe("9월 20일까지 ☎ 031-000-0000");
    expect(escapeDrawtext("시간: 10:00")).toBe("시간\\: 10\\:00");
    expect(escapeDrawtext("10% 할인, 지금")).toBe("10% 할인\\, 지금"); // % 는 expansion=none 으로 처리
    expect(escapeDrawtext("it's")).toBe("it\u2019s");
    expect(escapeDrawtext("a\\b")).toBe("a\\\\b");
  });
  it("윈도우 폰트 경로 이스케이프", () => {
    expect(escapeFilterPath("C:\\proj\\assets\\f.otf")).toBe("C\\:/proj/assets/f.otf");
  });
  it("누적 큐 생성", () => {
    expect(cuesFromSegments([{ seconds: 3, text: "a" }, { seconds: 20, text: "b" }, { seconds: 7, text: "c" }])).toEqual([
      { start: 0, end: 3, text: "a" }, { start: 3, end: 23, text: "b" }, { start: 23, end: 30, text: "c" },
    ]);
  });
  it("필터 문자열에 폰트·시간 구간·글자 크기가 들어간다", () => {
    const f = subtitleFilter([{ start: 0, end: 3, text: "이 사과, 어제까지 나무에" }, { start: 3, end: 23, text: "" }], 1080, { fontPath: "/f/NotoSansKR-Bold.otf" });
    expect(f).toContain("fontfile='/f/NotoSansKR-Bold.otf':expansion=none:");
    expect(f).toContain("enable='between(t\\,0.00\\,3.00)'");
    expect(f).toContain("fontsize=59");
    expect(f.split("drawtext=").length - 1).toBe(1); // 빈 자막은 제외
  });
});
