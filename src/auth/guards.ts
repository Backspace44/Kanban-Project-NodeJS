import { Role, ProjectRole } from "@prisma/client";
import type { GraphQLContext } from "../context";
import { forbidden, notFound, unauthenticated } from "../errors";
import { prisma } from "../prisma";

export function requireAuth(ctx: GraphQLContext) {
  if (!ctx.user) unauthenticated();
}

export function requireAdmin(ctx: GraphQLContext) {
  requireAuth(ctx);
  if (ctx.user!.role !== Role.ADMIN) forbidden("Admin only");
}

export async function requireProjectMember(ctx: GraphQLContext, projectId: string) {
  requireAuth(ctx);
  if (ctx.user!.role === Role.ADMIN) return;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: ctx.user!.id } },
    select: { id: true },
  });
  if (!membership) forbidden("You are not a member of this project");
}

export async function requireProjectOwnerOrAdmin(ctx: GraphQLContext, projectId: string) {
  requireAuth(ctx);
  if (ctx.user!.role === Role.ADMIN) return;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: ctx.user!.id } },
    select: { projectRole: true },
  });
  if (!membership) forbidden("You are not a member of this project");
  if (membership.projectRole !== ProjectRole.OWNER) forbidden("Owner only");
}

export async function getProjectIdByColumnId(columnId: string): Promise<string> {
  const col = await prisma.column.findUnique({
    where: { id: columnId },
    select: { projectId: true },
  });
  if (!col) notFound("Column not found");
  return col.projectId;
}

export async function getProjectIdByTaskId(taskId: string): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { column: { select: { projectId: true } } },
  });
  if (!task) notFound("Task not found");
  return task.column.projectId;
}
