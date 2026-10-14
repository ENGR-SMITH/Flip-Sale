import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
  );
}

/**
 * Inspection/testing bypass: only active when BOTH env vars are set on the
 * server process. It deliberately bypasses Clerk so every system can be
 * exercised end-to-end without a browser session (e.g. automated checks on a
 * temporary server instance). Never set CLERK_BYPASS in production.
 */
export function isAuthBypassEnabled(): boolean {
  return (
    process.env.CLERK_BYPASS === "true" &&
    Boolean(process.env.OPERATOR_OVERRIDE_ID?.trim())
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthBypassEnabled()) {
    next();
    return;
  }
  if (!isClerkConfigured()) {
    res.status(503).json({
      error: "Operator authentication is not configured.",
    });
    return;
  }

  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to access this workspace." });
    return;
  }
  next();
}

export function getOwnerId(req: Request): string {
  if (isAuthBypassEnabled()) {
    const override = process.env.OPERATOR_OVERRIDE_ID!.trim();
    if (override) return override;
    throw new Error("OPERATOR_OVERRIDE_ID is set but empty.");
  }
  const userId = getAuth(req).userId;
  if (!userId) {
    throw new Error("Authenticated Clerk user is missing.");
  }
  return userId;
}
