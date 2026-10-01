export interface ReplyOption {
  n: number;
  label: string;
}

// Detect numbered options the agent presented (e.g., "1. **Thinner washer** I can do…").
// Returns at least 2 options or none — we don't want to turn arbitrary "step 1, 2, 3"
// instructions into pickable buttons.
export function parseOptions(text: string): ReplyOption[] {
  const found: ReplyOption[] = [];
  const re = /^\s*(\d+)\.\s+(?:\*\*([^*]+)\*\*|(\S[^\n]{0,80}))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const label = (m[2] ?? m[3] ?? "").trim();
    if (label && n >= 1 && n <= 9) found.push({ n, label });
  }
  return found.length >= 2 ? found : [];
}
