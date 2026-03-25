const localTestModeOverride = import.meta.env.VITE_LOCAL_TEST_MODE;
const adminEmailsOverride = import.meta.env.VITE_ADMIN_EMAILS ?? '';
const defaultAdminEmails = ['admin@admin.com'];

function parseAdminEmails(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const isLocalTestMode = localTestModeOverride === 'true';

export const adminEmails = [...new Set([...defaultAdminEmails, ...parseAdminEmails(adminEmailsOverride)])];

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return adminEmails.includes(email.trim().toLowerCase());
}
