export const validReferralCode = (value) => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{2,30}[a-z0-9])$/.test(value);
export function customReferralCode(value) {
  if (typeof value !== 'string') throw Object.assign(Error('Enter a custom code.'), {status:400});
  const code=value.trim().toLowerCase();
  if (!validReferralCode(code)) throw Object.assign(Error('Use 4–32 letters, numbers or hyphens. Start and end with a letter or number.'), {status:400});
  // Keep generated codes in their own namespace and reserve official-looking names.
  if (/^[a-f0-9]{16}$/.test(code) || /^(mercado|marcado|bittrees|admin|support|official|owner|staff)(-|$)/.test(code))
    throw Object.assign(Error('That code is reserved. Choose another name.'), {status:400});
  return code;
}
