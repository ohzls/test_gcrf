export function isNaN(num) {
  return num !== num;
}

export function sanitizePathComponent(name) {
    if (!name) return "unknown";
    let safeName = String(name);
    // 경로 구분자 및 기타 위험 문자 제거/변경
    safeName = safeName.replace(/[\\/?:*"<>|]/g, '_');
    // 앞뒤 공백 제거
    safeName = safeName.trim();
    // 혹시 이름이 비어버리면 기본값 사용
    return safeName || "unknown";
  }
  