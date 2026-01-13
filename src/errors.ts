import { GraphQLError } from "graphql";

export function unauthenticated(message = "Authentication required"): never {
  throw new GraphQLError(message, { extensions: { code: "UNAUTHENTICATED" } });
}

export function forbidden(message = "Forbidden"): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function badUserInput(message: string, fields?: Record<string, any>): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT", fields } });
}

export function notFound(message = "Not found"): never {
  throw new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}
