// Public reCAPTCHA v3 site key only. Never place a reCAPTCHA secret in the client.
const key = import.meta.env?.VITE_APP_CHECK_RECAPTCHA_V3_SITE_KEY;
export const APP_CHECK_SITE_KEY = typeof key === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(key.trim()) ? key.trim() : '';
export const APP_CHECK_CONFIGURED = APP_CHECK_SITE_KEY !== '';
