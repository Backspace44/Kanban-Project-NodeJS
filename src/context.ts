import type { Request } from "express";
import { Role } from "@prisma/client";
import { verifyToken } from "./auth/jwt";

export type AuthUser = { id: string; role: Role; email?: string };

export type GraphQLContext = {
  req: Request;
  jwtSecret: string;
  user: AuthUser | null;
};

export function buildContext(req: Request): GraphQLContext {
  const jwtSecret = process.env.JWT_SECRET || "dev_secret_change_me";
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length);
    try {
      const payload = verifyToken(token, jwtSecret);
      return { req, jwtSecret, user: { id: payload.sub, role: payload.role } };
    } catch {
      return { req, jwtSecret, user: null };
    }
  }
  return { req, jwtSecret, user: null };
}
