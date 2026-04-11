export const CV_PREFIX = "CV thụ lý : ";

export function cleanCvName(raw: string): string {
  return raw.startsWith(CV_PREFIX) ? raw.slice(CV_PREFIX.length).trim() : raw.trim();
}

export function cleanCgName(raw: string): string {
  return raw.replace(/^CG\s*:\s*/i, "").trim();
}
