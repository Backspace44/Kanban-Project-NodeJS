# Kanban / Project Management (Trello-like) — GraphQL + JWT + Prisma (with migrations)

## Tech
- Node.js + TypeScript
- GraphQL (Apollo Server) + Express
- Prisma ORM (SQLite) **with migrations**
- JWT authentication + role-based authorization
- Offset pagination
- Automated tests (Jest + Supertest)
- CI workflow (GitHub Actions)

## Quick start (local)
```bash
cp .env.example .env
npm install
npm run prisma:generate

# Apply migrations (creates tables)
npm run prisma:migrate:deploy

# Optional: add demo data
npm run prisma:seed

npm run dev
```

Open:
- GraphQL endpoint: `http://localhost:4000/graphql`
- Health: `http://localhost:4000/health`

Seed creates:
- admin@example.com / Password123!
- user@example.com / Password123!

## Developing schema changes (creating new migrations)
After you edit `prisma/schema.prisma`, create and apply a new migration:
```bash
npm run prisma:migrate:dev
```

## Running tests
```bash
npm test
```

## Notes
- GraphQL schema exposes nested objects (e.g., `Task.assignee`, `Task.column`, `Project.members`) instead of foreign key IDs in responses.
- For actions tied to the current user (e.g., `createProject`, `commentTask`), user identity is derived from JWT context, not passed as arguments.
