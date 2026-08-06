export function normalizePhoneTo08(phone: string | null | undefined): string {
  if (!phone) return '';
  let str = String(phone).trim().replace(/[^0-9]/g, '');
  if (str.startsWith('62')) {
    str = '0' + str.substring(2);
  } else if (str.startsWith('8')) {
    str = '0' + str;
  }
  return str;
}
