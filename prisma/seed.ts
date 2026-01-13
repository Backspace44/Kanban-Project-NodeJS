import { PrismaClient, Role, ProjectRole, TaskStatus } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@example.com";
  const userEmail = "user@example.com";
  const password = "Password123!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(password),
      role: Role.ADMIN,
      profile: { create: { displayName: "Admin" } },
    },
    include: { profile: true },
  });

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      passwordHash: await hashPassword(password),
      role: Role.USER,
      profile: { create: { displayName: "User" } },
    },
    include: { profile: true },
  });

  const project = await prisma.project.create({
    data: {
      name: "Demo Board",
      ownerId: user.id,
      members: {
        create: [
          { userId: user.id, projectRole: ProjectRole.OWNER },
          { userId: admin.id, projectRole: ProjectRole.MEMBER },
        ],
      },
      columns: {
        create: [
          { title: "To Do", position: 1 },
          { title: "In Progress", position: 2 },
          { title: "Done", position: 3 },
        ],
      },
    },
    include: { columns: true },
  });

  const todoColumn = project.columns.find(c => c.title === "To Do")!;
  const inProgress = project.columns.find(c => c.title === "In Progress")!;

  const task1 = await prisma.task.create({
    data: {
      title: "Set up project",
      description: "Initialize repo, Prisma schema, server, and tests",
      columnId: todoColumn.id,
      creatorId: user.id,
      assigneeId: user.id,
      position: 1,
      status: TaskStatus.TODO,
    },
  });

  await prisma.task.create({
    data: {
      title: "Add CI workflow",
      description: "Run tests on push",
      columnId: inProgress.id,
      creatorId: user.id,
      assigneeId: admin.id,
      position: 1,
      status: TaskStatus.IN_PROGRESS,
    },
  });

  await prisma.activityLog.create({
    data: {
      action: "SEED_CREATED_DEMO_DATA",
      actorId: admin.id,
      projectId: project.id,
      taskId: task1.id,
      details: { note: "Seed completed" },
    },
  });

  console.log("Seed completed. Credentials:");
  console.log(`Admin: ${adminEmail} / ${password}`);
  console.log(`User : ${userEmail} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
