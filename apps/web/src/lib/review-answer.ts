// Grapheme comparison for short answers; bounded work for pasted long text.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export type DiffToken = { ch: string; kind: 'match' | 'extra' | 'missing' };

export const diffAnswer = (userRaw: string, targetRaw: string): DiffToken[] => {
  const userText = userRaw.trim().normalize('NFC');
  const targetText = targetRaw.trim().normalize('NFC');
  const user = Array.from(segmenter.segment(userText), (part) => part.segment);
  const target = Array.from(segmenter.segment(targetText), (part) => part.segment);
  const u = user.map((part) => part.toLowerCase());
  const t = target.map((part) => part.toLowerCase());
  const m = u.length;
  const n = t.length;
  if (m * n > 100_000) {
    if (userText.toLowerCase() === targetText.toLowerCase()) return [{ ch: targetText, kind: 'match' }];
    return [{ ch: userText, kind: 'extra' }, { ch: targetText, kind: 'missing' }];
  }
  // LCS via DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (u[i - 1] === t[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (u[i - 1] === t[j - 1]) {
      tokens.push({ ch: target[j - 1], kind: 'match' });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      tokens.push({ ch: user[i - 1], kind: 'extra' });
      i--;
    } else {
      tokens.push({ ch: target[j - 1], kind: 'missing' });
      j--;
    }
  }
  while (i > 0) {
    tokens.push({ ch: user[i - 1], kind: 'extra' });
    i--;
  }
  while (j > 0) {
    tokens.push({ ch: target[j - 1], kind: 'missing' });
    j--;
  }
  return tokens.reverse();
};

