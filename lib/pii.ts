export type PIIResult = { blocked: boolean; warnings: string[] };

const RRN = /\b\d{6}-?[1-4]\d{6}\b/; // 주민등록번호
const PHONE = /\b0\d{1,2}-?\d{3,4}-?\d{4}\b/g; // 전화번호 (CTA용, 허용)
const ACCOUNT = /\b\d{2,6}-\d{2,6}-\d{2,6}(?:-\d{2,6})?\b/; // 계좌번호 추정

/**
 * 강의안 절대 수칙 ①: 조합원 개인정보는 어떤 AI에도 입력하지 않는다.
 * 주민번호는 저장 거부, 계좌번호 추정은 경고. 전화번호는 행동 유도(CTA)에 필요하므로 허용.
 */
export function checkPII(text: string): PIIResult {
  if (RRN.test(text)) {
    return { blocked: true, warnings: ["주민등록번호로 보이는 숫자가 있어 저장할 수 없습니다. 조합원 개인정보는 넣지 마세요."] };
  }
  const stripped = text.replace(PHONE, " ");
  const warnings: string[] = [];
  if (ACCOUNT.test(stripped)) warnings.push("계좌번호로 보이는 숫자가 있습니다. 조합원 정보는 넣지 마세요.");
  return { blocked: false, warnings };
}
