import type { GraphQLContext } from "../context.js";

export type ResolverFn<TResult, TParent, TArgs> = (
  parent: TParent,
  args: TArgs,
  ctx: GraphQLContext
) => Promise<TResult> | TResult;

export type Resolvers = {
  DateTime: any;
  JSON: any;

  Query: {
    me: ResolverFn<any, any, {}>;
    projects: ResolverFn<any, any, { offset: number; limit: number; search?: string | null }>;
    project: ResolverFn<any, any, { projectId: string }>;
    tasks: ResolverFn<any, any, { projectId: string; offset: number; limit: number; status?: any; assigneeId?: string | null }>;
    comments: ResolverFn<any, any, { taskId: string; offset: number; limit: number }>;
    activityLog: ResolverFn<any, any, { projectId: string; offset: number; limit: number }>;
  };

  Mutation: {
    register: ResolverFn<any, any, { input: { email: string; password: string; displayName: string } }>;
    login: ResolverFn<any, any, { input: { email: string; password: string } }>;

    createProject: ResolverFn<any, any, { input: { name: string } }>;
    createColumn: ResolverFn<any, any, { input: { projectId: string; title: string; position: number } }>;
    createTask: ResolverFn<any, any, { input: { columnId: string; title: string; description?: string | null; dueDate?: any; assigneeId?: string | null } }>;
    updateTask: ResolverFn<any, any, { taskId: string; input: any }>;
    moveTask: ResolverFn<any, any, { input: { taskId: string; toColumnId: string; toPosition: number } }>;
    assignTask: ResolverFn<any, any, { taskId: string; assigneeId?: string | null }>;
    commentTask: ResolverFn<any, any, { input: { taskId: string; content: string } }>;

    inviteMember: ResolverFn<any, any, { input: { projectId: string; email: string } }>;
    acceptInvite: ResolverFn<any, any, { token: string }>;

    createLabel: ResolverFn<any, any, { input: { projectId: string; name: string; color?: string | null } }>;
    addLabelToTask: ResolverFn<any, any, { taskId: string; labelId: string }>;
    removeLabelFromTask: ResolverFn<any, any, { taskId: string; labelId: string }>;
  };

  Project: any;
  ProjectMember: any;
  Column: any;
  Task: any;
  Comment: any;
  Invitation: any;
  ActivityLog: any;
};
