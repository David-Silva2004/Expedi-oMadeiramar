const localTestModeOverride = import.meta.env.VITE_LOCAL_TEST_MODE;
const adminEmailsOverride = import.meta.env.VITE_ADMIN_EMAILS ?? '';

export const isLocalTestMode =
  localTestModeOverride === 'true';

export const adminEmails = adminEmailsOverride
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return adminEmails.includes(email.trim().toLowerCase());
}
