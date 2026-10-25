export function isMeaningful(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (s.length < 10) return false;

  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  const vowels = (s.match(/[aeiouAEIOU]/g) || []).length;
  if (letters < 5 || vowels < 1) return false;

  if (letters / s.length < 0.4) return false;

  if (/([asdfghjklqwertyuiopzxcvbnm])\1{3,}/i.test(s)) return false;

  return true;
}
