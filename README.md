# Kanban-Project-NodeJS
This project implements a complete backend API for a Kanban / Project Management (Trello-like) application. 

# Kanban / Project Management API (Trello-like)
GraphQL + Apollo Server + Express + Prisma + SQLite + JWT + Jest Tests

This project is a fully functional backend API for a **Kanban / Project Management** application (Trello-like). It supports:
- users (register/login)
- boards (projects)
- columns (lists)
- tasks (cards: create/move/assign)
- comments
- labels/tags
- project invitations (invite/accept)
- activity log (audit trail)

The API is exposed via **GraphQL** at:
- `POST /graphql`

---

## Tech Stack
- **Node.js** + **TypeScript**
- **Express.js** (HTTP server + middleware)
- **Apollo Server** (GraphQL API)
- **Prisma ORM**
- **SQLite** (`dev.db` local database file)
- **JWT Authentication**
- **Jest + Supertest** (integration tests)

---

## Project Structure

```txt
kanban-graphql-migrations/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ prisma/
│  ├─ migrations/
│  │  ├─ migration_lock.toml
│  │  └─ <timestamp>_init/
│  │     └─ migration.sql
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ auth/
│  │  ├─ guards.ts
│  │  ├─ jwt.ts
│  │  └─ password.ts
│  ├─ graphql/
│  │  ├─ resolvers/
│  │  │  └─ index.ts
│  │  └─ typeDefs.ts
│  ├─ context.ts
│  ├─ errors.ts
│  ├─ index.ts
│  ├─ prisma.ts
│  ├─ server.ts
│  └─ validation.ts
├─ tests/
│  └─ kanban.test.ts
├─ .env.example
├─ jest.config.cjs
├─ package.json
└─ tsconfig.json
 

