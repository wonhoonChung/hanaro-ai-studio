import { describe, it, expect } from "vitest";
import { nextBillingDate, makeOrderId, customerKeyFor } from "@/lib/billing";

describe("billing", () => {
  it("다음 결제일은 한 달 뒤 (말일 보정)", () => {
    expect(nextBillingDate(new Date("2026-01-31T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(nextBillingDate(new Date("2026-09-10T00:00:00Z")).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(nextBillingDate(new Date("2026-12-15T09:30:00Z")).toISOString()).toBe("2027-01-15T09:30:00.000Z");
  });

  it("orderId 형식 (토스 규격: 6~64자, 영문·숫자·-·_)", () => {
    const id = makeOrderId("3f2b1c9a-0000-0000-0000-000000000000");
    expect(id).toMatch(/^sub_[a-z0-9]{8}_\d+$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("customerKey는 사용자 ID에서 결정적으로 생성", () => {
    expect(customerKeyFor("abc")).toBe("cust_abc");
  });
});
