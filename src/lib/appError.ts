import type { AppError, AppErrorCode } from "../ipc/types";

/** Narrows a rejected command to the AppError shape the Rust side serializes. */
export function asAppError(error: unknown): AppError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as Partial<AppError>;
  return typeof candidate.code === "string" && typeof candidate.message === "string"
    ? (candidate as AppError)
    : null;
}

export function isAppError(error: unknown, code: AppErrorCode): boolean {
  return asAppError(error)?.code === code;
}

/** A sentence suitable for the error toast. */
export function errorMessage(error: unknown): string {
  const appError = asAppError(error);
  if (appError) {
    if (appError.code === "GitNotInstalled") return "git was not found on PATH.";
    return appError.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
