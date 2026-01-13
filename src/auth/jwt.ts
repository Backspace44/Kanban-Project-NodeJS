import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export type JwtPayload = {
  sub: string; // userId
  role: Role;
};

export function signToken(payload: JwtPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token");
  }
  const { sub, role } = decoded as any;
  if (typeof sub !== "string" || (role !== "ADMIN" && role !== "USER")) {
    throw new Error("Invalid token payload");
  }
  return { sub, role } as JwtPayload;
}
