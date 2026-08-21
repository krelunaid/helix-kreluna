export type AdminBindingEnvironment = Readonly<{
  HELIX_ADMIN_USER_ID?: string;
  HELIX_ADMIN_EMAIL?: string;
}>;

export type AdminBinding = Readonly<{
  userId: string;
  email: string;
}>;

const ADMIN_EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/u;

/**
 * A deliberately generic 404 boundary. Signed-out visitors and authenticated
 * non-admins receive the same response, so the private console is never an
 * account-discovery surface.
 */
export class AdminNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Not Found");
    this.name = "AdminNotFoundError";
  }
}

/** Raised only during server configuration validation; values are never echoed. */
export class AdminBindingConfigurationError extends Error {
  constructor() {
    super("Invalid admin binding configuration");
    this.name = "AdminBindingConfigurationError";
  }
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function validUserId(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 255 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

/**
 * Resolve the immutable Better Auth identity bound to the operator console.
 * Both fields are required together. An absent pair disables the console;
 * partial or malformed configuration fails closed at startup.
 */
export function resolveAdminBinding(environment: AdminBindingEnvironment): AdminBinding | null {
  const userId = clean(environment.HELIX_ADMIN_USER_ID);
  const email = clean(environment.HELIX_ADMIN_EMAIL).toLowerCase();
  if (!userId && !email) return null;
  if (
    !userId ||
    !email ||
    !validUserId(userId) ||
    email.length > 254 ||
    !ADMIN_EMAIL_PATTERN.test(email)
  ) {
    throw new AdminBindingConfigurationError();
  }
  return Object.freeze({ userId, email });
}

/** Fast rejection before any database lookup or aggregate query is attempted. */
export function assertAdminSessionId(
  sessionUserId: string | null | undefined,
  binding: AdminBinding | null,
): asserts binding is AdminBinding {
  if (!binding || !sessionUserId || sessionUserId !== binding.userId) {
    throw new AdminNotFoundError();
  }
}
