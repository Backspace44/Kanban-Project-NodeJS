import { DateTimeResolver, JSONObjectResolver } from "graphql-scalars";
import type { Resolvers } from "../types.generated";
import { prisma } from "../../prisma";
import { requireAuth, requireProjectMember, requireProjectOwnerOrAdmin, getProjectIdByColumnId, getProjectIdByTaskId } from "../../auth/guards";
import { badUserInput, forbidden, notFound, unauthenticated } from "../../errors";
import { hashPassword, verifyPassword } from "../../auth/password";
import { signToken } from "../../auth/jwt";
import { parseOrThrow, paginationSchema } from "../../validation";
import { InvitationStatus, ProjectRole, Role, TaskStatus } from "@prisma/client";

function tokenFor(userId: string, role: Role, jwtSecret: string): string {
  return signToken({ sub: userId, role }, jwtSecret);
}

function randomToken(len = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const resolvers: Resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONObjectResolver,

  Query: {
    me: async (_p, _a, ctx) => {
      requireAuth(ctx);
      const user = await prisma.user.findUnique({
        where: { id: ctx.user!.id },
        include: { profile: true },
      });
      if (!user) unauthenticated();
      return user;
    },

    projects: async (_p, args, ctx) => {
      requireAuth(ctx);
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const search = args.search?.trim();
      if (search !== undefined && search.length === 0) badUserInput("search cannot be empty");

      if (ctx.user!.role === Role.ADMIN) {
        const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
        const [total, items] = await Promise.all([
          prisma.project.count({ where }),
          prisma.project.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: offset,
            take: limit,
          }),
        ]);
        return { items, total, offset, limit };
      }

      const where = {
        members: { some: { userId: ctx.user!.id } },
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      };

      const [total, items] = await Promise.all([
        prisma.project.count({ where }),
        prisma.project.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
      ]);
      return { items, total, offset, limit };
    },

    project: async (_p, { projectId }, ctx) => {
      await requireProjectMember(ctx, projectId);
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) notFound("Project not found");
      return project;
    },

    tasks: async (_p, args, ctx) => {
      await requireProjectMember(ctx, args.projectId);
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const where: any = {
        column: { projectId: args.projectId },
      };
      if (args.status) where.status = args.status;
      if (args.assigneeId) where.assigneeId = args.assigneeId;

      const [total, items] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          orderBy: [{ column: { position: "asc" } }, { position: "asc" }, { createdAt: "desc" }],
          skip: offset,
          take: limit,
        }),
      ]);
      return { items, total, offset, limit };
    },

    comments: async (_p, args, ctx) => {
      const projectId = await getProjectIdByTaskId(args.taskId);
      await requireProjectMember(ctx, projectId);
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const where = { taskId: args.taskId };

      const [total, items] = await Promise.all([
        prisma.comment.count({ where }),
        prisma.comment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
      ]);
      return { items, total, offset, limit };
    },

    activityLog: async (_p, args, ctx) => {
      await requireProjectMember(ctx, args.projectId);
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const where = { projectId: args.projectId };

      const [total, items] = await Promise.all([
        prisma.activityLog.count({ where }),
        prisma.activityLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
      ]);
      return { items, total, offset, limit };
    },
  },

  Mutation: {
    register: async (_p, { input }, ctx) => {
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@")) badUserInput("Invalid email");
      if (input.password.length < 8) badUserInput("Password must be at least 8 characters");
      if (input.displayName.trim().length < 1) badUserInput("Display name too short");

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) badUserInput("Email already registered");

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(input.password),
          role: Role.USER,
          profile: { create: { displayName: input.displayName.trim() } },
        },
        include: { profile: true },
      });

      const token = tokenFor(user.id, user.role, ctx.jwtSecret);
      return { token, user };
    },

    login: async (_p, { input }, ctx) => {
      const email = input.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      });
      if (!user) badUserInput("Invalid credentials");

      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) badUserInput("Invalid credentials");

      const token = tokenFor(user.id, user.role, ctx.jwtSecret);
      return { token, user };
    },

    createProject: async (_p, { input }, ctx) => {
      requireAuth(ctx);
      const name = input.name.trim();
      if (name.length < 1) badUserInput("Project name too short");

      const project = await prisma.project.create({
        data: {
          name,
          ownerId: ctx.user!.id,
          members: { create: { userId: ctx.user!.id, projectRole: ProjectRole.OWNER } },
          columns: {
            create: [
              { title: "To Do", position: 1 },
              { title: "In Progress", position: 2 },
              { title: "Done", position: 3 },
            ],
          },
          activity: {
            create: {
              action: "PROJECT_CREATED",
              actorId: ctx.user!.id,
              details: { name },
            },
          },
        },
      });
      return project;
    },

    createColumn: async (_p, { input }, ctx) => {
      await requireProjectOwnerOrAdmin(ctx, input.projectId);
      if (input.title.trim().length < 1) badUserInput("Column title required");
      if (!Number.isInteger(input.position) || input.position < 1) badUserInput("Invalid position");

      await prisma.column.updateMany({
        where: { projectId: input.projectId, position: { gte: input.position } },
        data: { position: { increment: 1 } },
      });

      const col = await prisma.column.create({
        data: { projectId: input.projectId, title: input.title.trim(), position: input.position },
      });

      await prisma.activityLog.create({
        data: {
          action: "COLUMN_CREATED",
          actorId: ctx.user!.id,
          projectId: input.projectId,
          details: { columnId: col.id, title: col.title },
        },
      });

      return col;
    },

    createTask: async (_p, { input }, ctx) => {
      const projectId = await getProjectIdByColumnId(input.columnId);
      await requireProjectMember(ctx, projectId);

      const title = input.title.trim();
      if (title.length < 1) badUserInput("Task title required");

      if (input.assigneeId) {
        const membership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: input.assigneeId } },
          select: { id: true },
        });
        if (!membership && ctx.user!.role !== Role.ADMIN) forbidden("Assignee must be a project member");
      }

      const last = await prisma.task.findFirst({
        where: { columnId: input.columnId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = (last?.position ?? 0) + 1;

      const task = await prisma.task.create({
        data: {
          title,
          description: input.description?.trim() || null,
          dueDate: input.dueDate || null,
          columnId: input.columnId,
          creatorId: ctx.user!.id,
          assigneeId: input.assigneeId || null,
          position,
          status: TaskStatus.TODO,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "TASK_CREATED",
          actorId: ctx.user!.id,
          projectId,
          taskId: task.id,
          details: { title: task.title, columnId: task.columnId },
        },
      });

      return task;
    },

    updateTask: async (_p, { taskId, input }, ctx) => {
      const projectId = await getProjectIdByTaskId(taskId);
      await requireProjectMember(ctx, projectId);

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) notFound("Task not found");

      const data: any = {};
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (t.length < 1) badUserInput("Title cannot be empty");
        data.title = t;
      }
      if (input.description !== undefined) data.description = input.description?.trim() || null;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate || null;
      if (input.status !== undefined) data.status = input.status;

      const updated = await prisma.task.update({ where: { id: taskId }, data });

      await prisma.activityLog.create({
        data: {
          action: "TASK_UPDATED",
          actorId: ctx.user!.id,
          projectId,
          taskId,
          details: { changes: Object.keys(data) },
        },
      });

      return updated;
    },

    moveTask: async (_p, { input }, ctx) => {
      const fromProjectId = await getProjectIdByTaskId(input.taskId);
      const toProjectId = await getProjectIdByColumnId(input.toColumnId);
      if (fromProjectId !== toProjectId) forbidden("Cannot move task across projects");
      await requireProjectMember(ctx, fromProjectId);

      if (!Number.isInteger(input.toPosition) || input.toPosition < 1) badUserInput("Invalid toPosition");

      const task = await prisma.task.findUnique({ where: { id: input.taskId } });
      if (!task) notFound("Task not found");

      await prisma.task.updateMany({
        where: { columnId: input.toColumnId, position: { gte: input.toPosition } },
        data: { position: { increment: 1 } },
      });

      const moved = await prisma.task.update({
        where: { id: input.taskId },
        data: {
          columnId: input.toColumnId,
          position: input.toPosition,
        },
      });

      const sourceTasks = await prisma.task.findMany({
        where: { columnId: task.columnId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await Promise.all(
        sourceTasks.map((t, idx) => prisma.task.update({ where: { id: t.id }, data: { position: idx + 1 } }))
      );

      await prisma.activityLog.create({
        data: {
          action: "TASK_MOVED",
          actorId: ctx.user!.id,
          projectId: fromProjectId,
          taskId: moved.id,
          details: { fromColumnId: task.columnId, toColumnId: input.toColumnId, toPosition: input.toPosition },
        },
      });

      return moved;
    },

    assignTask: async (_p, { taskId, assigneeId }, ctx) => {
      const projectId = await getProjectIdByTaskId(taskId);
      await requireProjectMember(ctx, projectId);

      if (assigneeId) {
        const membership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: assigneeId } },
          select: { id: true },
        });
        if (!membership && ctx.user!.role !== Role.ADMIN) forbidden("Assignee must be a project member");
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { assigneeId: assigneeId || null },
      });

      await prisma.activityLog.create({
        data: {
          action: "TASK_ASSIGNED",
          actorId: ctx.user!.id,
          projectId,
          taskId,
          details: { assigneeId: assigneeId || null },
        },
      });

      return updated;
    },

    commentTask: async (_p, { input }, ctx) => {
      requireAuth(ctx);

      const projectId = await getProjectIdByTaskId(input.taskId);
      await requireProjectMember(ctx, projectId);

      const content = input.content.trim();
      if (content.length < 1) badUserInput("Comment content required");

      const comment = await prisma.comment.create({
        data: { taskId: input.taskId, authorId: ctx.user!.id, content },
      });

      await prisma.activityLog.create({
        data: {
          action: "COMMENT_ADDED",
          actorId: ctx.user!.id,
          projectId,
          taskId: input.taskId,
          details: { commentId: comment.id },
        },
      });

      return comment;
    },

    inviteMember: async (_p, { input }, ctx) => {
      await requireProjectOwnerOrAdmin(ctx, input.projectId);
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@")) badUserInput("Invalid email");
      const token = randomToken(40);

      const invite = await prisma.invitation.create({
        data: {
          projectId: input.projectId,
          email,
          token,
          invitedById: ctx.user!.id,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "MEMBER_INVITED",
          actorId: ctx.user!.id,
          projectId: input.projectId,
          details: { email },
        },
      });

      return invite;
    },

    acceptInvite: async (_p, { token }, ctx) => {
      requireAuth(ctx);
      const invite = await prisma.invitation.findUnique({
        where: { token },
      });
      if (!invite) notFound("Invitation not found");
      if (invite.status !== InvitationStatus.PENDING) badUserInput("Invitation is not pending");

      const user = await prisma.user.findUnique({ where: { id: ctx.user!.id }, select: { email: true } });
      if (!user) unauthenticated();
      if (user.email.toLowerCase() !== invite.email.toLowerCase() && ctx.user!.role !== Role.ADMIN) {
        forbidden("This invite is for a different email");
      }

      const membership = await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: invite.projectId, userId: ctx.user!.id } },
        update: {},
        create: { projectId: invite.projectId, userId: ctx.user!.id, projectRole: ProjectRole.MEMBER },
      });

      await prisma.invitation.update({
        where: { token },
        data: { status: InvitationStatus.ACCEPTED },
      });

      await prisma.activityLog.create({
        data: {
          action: "INVITE_ACCEPTED",
          actorId: ctx.user!.id,
          projectId: invite.projectId,
          details: { email: invite.email },
        },
      });

      return membership;
    },

    createLabel: async (_p, { input }, ctx) => {
      await requireProjectOwnerOrAdmin(ctx, input.projectId);
      const name = input.name.trim();
      if (name.length < 1) badUserInput("Label name required");

      const label = await prisma.label.create({
        data: { projectId: input.projectId, name, color: input.color?.trim() || null },
      });

      await prisma.activityLog.create({
        data: {
          action: "LABEL_CREATED",
          actorId: ctx.user!.id,
          projectId: input.projectId,
          details: { labelId: label.id, name: label.name },
        },
      });

      return label;
    },

    addLabelToTask: async (_p, { taskId, labelId }, ctx) => {
      const projectId = await getProjectIdByTaskId(taskId);
      await requireProjectMember(ctx, projectId);

      const label = await prisma.label.findUnique({ where: { id: labelId }, select: { projectId: true } });
      if (!label) notFound("Label not found");
      if (label.projectId !== projectId) forbidden("Label does not belong to this project");

      await prisma.taskLabel.upsert({
        where: { taskId_labelId: { taskId, labelId } },
        update: {},
        create: { taskId, labelId },
      });

      await prisma.activityLog.create({
        data: {
          action: "LABEL_ADDED_TO_TASK",
          actorId: ctx.user!.id,
          projectId,
          taskId,
          details: { labelId },
        },
      });

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) notFound("Task not found");
      return task;
    },

    removeLabelFromTask: async (_p, { taskId, labelId }, ctx) => {
      const projectId = await getProjectIdByTaskId(taskId);
      await requireProjectMember(ctx, projectId);

      const label = await prisma.label.findUnique({ where: { id: labelId }, select: { projectId: true } });
      if (!label) notFound("Label not found");
      if (label.projectId !== projectId) forbidden("Label does not belong to this project");

      await prisma.taskLabel.deleteMany({ where: { taskId, labelId } });

      await prisma.activityLog.create({
        data: {
          action: "LABEL_REMOVED_FROM_TASK",
          actorId: ctx.user!.id,
          projectId,
          taskId,
          details: { labelId },
        },
      });

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) notFound("Task not found");
      return task;
    },
  },

  Project: {
    owner: (p: any) => prisma.user.findUnique({ where: { id: (p as any).ownerId }, include: { profile: true } }),
    columns: (p: any) => prisma.column.findMany({ where: { projectId: (p as any).id }, orderBy: { position: "asc" } }),
    members: async (p: any, args: any) => {
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const where = { projectId: (p as any).id };
      const [total, items] = await Promise.all([
        prisma.projectMember.count({ where }),
        prisma.projectMember.findMany({ where, orderBy: { joinedAt: "asc" }, skip: offset, take: limit }),
      ]);
      return { items, total, offset, limit };
    },
    labels: async (p: any, args: any) => {
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const search = (args as any).search?.trim();
      const where: any = { projectId: (p as any).id };
      if (search) where.name = { contains: search, mode: "insensitive" as const };
      const [total, items] = await Promise.all([
        prisma.label.count({ where }),
        prisma.label.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: limit }),
      ]);
      return { items, total, offset, limit };
    },
  },

  ProjectMember: {
    user: (pm: any) => prisma.user.findUnique({ where: { id: (pm as any).userId }, include: { profile: true } }),
  },

  Column: {
    tasks: async (c: any, args: any) => {
      const { offset, limit } = parseOrThrow(paginationSchema, args);
      const where: any = { columnId: (c as any).id };
      if ((args as any).status) where.status = (args as any).status;
      if ((args as any).assigneeId) where.assigneeId = (args as any).assigneeId;

      const [total, items] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({ where, orderBy: { position: "asc" }, skip: offset, take: limit }),
      ]);
      return { items, total, offset, limit };
    },
  },

  Task: {
    creator: (t: any) => prisma.user.findUnique({ where: { id: (t as any).creatorId }, include: { profile: true } }),
    assignee: (t: any) => ((t as any).assigneeId ? prisma.user.findUnique({ where: { id: (t as any).assigneeId }, include: { profile: true } }) : null),
    column: (t: any) => prisma.column.findUnique({ where: { id: (t as any).columnId } }),
    labels: async (t: any) => {
      const links = await prisma.taskLabel.findMany({ where: { taskId: (t as any).id }, select: { labelId: true } });
      if (links.length === 0) return [];
      return prisma.label.findMany({ where: { id: { in: links.map(l => l.labelId) } }, orderBy: { name: "asc" } });
    },
    commentCount: (t: any) => prisma.comment.count({ where: { taskId: (t as any).id } }),
  },

  Comment: {
    author: (c: any) => prisma.user.findUnique({ where: { id: (c as any).authorId }, include: { profile: true } }),
  },

  Invitation: {
    project: (i: any) => prisma.project.findUnique({ where: { id: (i as any).projectId } }),
    invitedBy: (i: any) => prisma.user.findUnique({ where: { id: (i as any).invitedById }, include: { profile: true } }),
  },

  ActivityLog: {
    actor: (a: any) => prisma.user.findUnique({ where: { id: (a as any).actorId }, include: { profile: true } }),
    project: (a: any) => prisma.project.findUnique({ where: { id: (a as any).projectId } }),
    task: (a: any) => ((a as any).taskId ? prisma.task.findUnique({ where: { id: (a as any).taskId } }) : null),
  },
};
