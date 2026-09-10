import { describe, it, expect } from "vitest";
import { checkPII } from "@/lib/pii";

describe("checkPII", () => {
  it("주민번호는 차단", () => {
    expect(checkPII("김OO 900101-1234567").blocked).toBe(true);
    expect(checkPII("9001011234567").blocked).toBe(true);
  });

  it("계좌번호 추정은 경고", () => {
    const r = checkPII("계좌 352-0123-4567-89");
    expect(r.blocked).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("전화번호는 허용", () => {
    const r = checkPII("문의 031-123-4567 / 010-1234-5678");
    expect(r.blocked).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("깨끗한 문장", () => {
    expect(checkPII("추석 선물세트 9월 20일까지 하나로마트")).toEqual({ blocked: false, warnings: [] });
  });
});
