import "dotenv/config";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { typeDefs } from "./graphql/typeDefs";
import { resolvers } from "./graphql/resolvers/index";
import { buildContext } from "./context";

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => buildContext(req),
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
