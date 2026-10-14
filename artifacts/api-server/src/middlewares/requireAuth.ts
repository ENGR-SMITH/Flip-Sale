import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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
  const userId = getAuth(req).userId;
  if (!userId) {
    throw new Error("Authenticated Clerk user is missing.");
  }
  return userId;
}
