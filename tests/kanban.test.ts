import request from "supertest";
import { createApp } from "../src/server";
import { prisma } from "../src/prisma";

type GqlResp<T> = { data?: T; errors?: Array<{ message: string; extensions?: any }> };

async function gql<T>(app: any, query: string, variables?: any, token?: string): Promise<GqlResp<T>> {
  const r = await request(app)
    .post("/graphql")
    .set("Content-Type", "application/json")
    .set("Authorization", token ? `Bearer ${token}` : "")
    .send({ query, variables });
  return r.body;
}

async function resetDb() {
  // order matters due to FKs
  await prisma.activityLog.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.label.deleteMany();
  await prisma.column.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
}

describe("Kanban GraphQL API (happy + sad for each operation)", () => {
  let app: any;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db";
    app = await createApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("register (happy): creates user and returns token", async () => {
    const res = await gql<{ register: { token: string; user: { email: string } } }>(
      app,
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { token user { email } }
      }`,
      { input: { email: "a@a.com", password: "Password123!", displayName: "Alex" } }
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.register.user.email).toBe("a@a.com");
    expect(res.data?.register.token).toBeTruthy();
  });

  it("register (sad): duplicate email", async () => {
    await gql(app, `mutation { register(input:{email:"a@a.com", password:"Password123!", displayName:"A"}){ token user{email}} }`);
    const res = await gql(app, `mutation { register(input:{email:"a@a.com", password:"Password123!", displayName:"B"}){ token user{email}} }`);
    expect(res.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it("login (happy): returns token", async () => {
    await gql(app, `mutation { register(input:{email:"u@u.com", password:"Password123!", displayName:"U"}){ token user{id}} }`);
    const res = await gql<{ login: { token: string } }>(
      app,
      `mutation { login(input:{email:"u@u.com", password:"Password123!"}){ token user{email} } }`
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.login.token).toBeTruthy();
  });

  it("login (sad): wrong password", async () => {
    await gql(app, `mutation { register(input:{email:"u@u.com", password:"Password123!", displayName:"U"}){ token user{id}} }`);
    const res = await gql(app, `mutation { login(input:{email:"u@u.com", password:"nope"}){ token user{email} } }`);
    expect(res.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  async function registerAndLogin(email: string, role?: "ADMIN" | "USER") {
    // role set via direct db for testing only
    await gql(app, `mutation($i:RegisterInput!){ register(input:$i){ token user{id email} } }`, {
      i: { email, password: "Password123!", displayName: email.split("@")[0] },
    });
    if (role) {
      await prisma.user.update({ where: { email }, data: { role } as any });
    }
    const loginRes = await gql<{ login: { token: string; user: { id: string } } }>(
      app,
      `mutation($i:LoginInput!){ login(input:$i){ token user{id} } }`,
      { i: { email, password: "Password123!" } }
    );
    return loginRes.data!.login.token;
  }

  it("me (happy): returns current user", async () => {
    const token = await registerAndLogin("me@x.com");
    const res = await gql<{ me: { email: string } }>(app, `query { me { email role } }`, undefined, token);
    expect(res.errors).toBeUndefined();
    expect(res.data?.me.email).toBe("me@x.com");
  });

  it("me (sad): unauthenticated", async () => {
    const res = await gql(app, `query { me { email } }`);
    expect(res.errors?.[0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("createProject (happy): creates project with default columns", async () => {
    const token = await registerAndLogin("p@x.com");
    const res = await gql<{ createProject: { id: string; columns: any[] } }>(
      app,
      `mutation { createProject(input:{name:"Board"}){ id name columns{ id title position } } }`,
      undefined,
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.createProject.columns.length).toBe(3);
  });

  it("createProject (sad): unauthenticated", async () => {
    const res = await gql(app, `mutation { createProject(input:{name:"Board"}){ id } }`);
    expect(res.errors?.[0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("projects (happy): paginated list (offset)", async () => {
    const token = await registerAndLogin("list@x.com");
    await gql(app, `mutation { createProject(input:{name:"A"}){ id } }`, undefined, token);
    await gql(app, `mutation { createProject(input:{name:"B"}){ id } }`, undefined, token);

    const res = await gql<{ projects: { total: number; items: Array<{ name: string }> } }>(
      app,
      `query { projects(offset:0, limit:1){ total items{ name } } }`,
      undefined,
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.projects.total).toBe(2);
    expect(res.data?.projects.items.length).toBe(1);
  });

  it("projects (sad): invalid limit", async () => {
    const token = await registerAndLogin("list@x.com");
    const res = await gql(app, `query { projects(offset:0, limit:0){ total } }`, undefined, token);
    expect(res.errors?.[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it("project (happy): member can fetch project", async () => {
    const token = await registerAndLogin("owner@x.com");
    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"X"}){ id } }`, undefined, token);
    const projectId = created.data!.createProject.id;

    const res = await gql<{ project: { id: string; name: string; columns: any[] } }>(
      app,
      `query($id:ID!){ project(projectId:$id){ id name columns{ title } } }`,
      { id: projectId },
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.project.id).toBe(projectId);
  });

  it("project (sad): non-member forbidden", async () => {
    const ownerToken = await registerAndLogin("owner@x.com");
    const otherToken = await registerAndLogin("other@x.com");
    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"X"}){ id } }`, undefined, ownerToken);
    const projectId = created.data!.createProject.id;

    const res = await gql(app, `query($id:ID!){ project(projectId:$id){ id } }`, { id: projectId }, otherToken);
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("createLabel (happy): owner creates label", async () => {
    const token = await registerAndLogin("lab@x.com");
    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"X"}){ id } }`, undefined, token);
    const projectId = created.data!.createProject.id;

    const res = await gql<{ createLabel: { id: string; name: string } }>(
      app,
      `mutation($i:CreateLabelInput!){ createLabel(input:$i){ id name } }`,
      { i: { projectId, name: "Bug", color: "red" } },
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.createLabel.name).toBe("Bug");
  });

  it("createLabel (sad): member (non-owner) forbidden", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const memberToken = await registerAndLogin("mem@x.com");
    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"X"}){ id } }`, undefined, ownerToken);
    const projectId = created.data!.createProject.id;

    // add member via DB for test simplicity
    const member = await prisma.user.findUnique({ where: { email: "mem@x.com" } });
    await prisma.projectMember.create({ data: { projectId, userId: member!.id, projectRole: "MEMBER" as any } });

    const res = await gql(app, `mutation($i:CreateLabelInput!){ createLabel(input:$i){ id } }`, { i: { projectId, name: "Bug" } }, memberToken);
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("createTask (happy): member creates task, nested fields resolve", async () => {
    const token = await registerAndLogin("t@x.com");
    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app,
      `mutation { createProject(input:{name:"Board"}){ id columns{ id } } }`,
      undefined,
      token
    );
    const columnId = created.data!.createProject.columns[0].id;

    const res = await gql<{ createTask: { id: string; creator: { email: string }; column: { id: string } } }>(
      app,
      `mutation($i:CreateTaskInput!){
        createTask(input:$i){
          id
          title
          creator{ email }
          column{ id title }
        }
      }`,
      { i: { columnId, title: "Task 1" } },
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.createTask.creator.email).toBe("t@x.com");
    expect(res.data?.createTask.column.id).toBe(columnId);
  });

  it("createTask (sad): non-member forbidden", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const otherToken = await registerAndLogin("oth@x.com");
    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app,
      `mutation { createProject(input:{name:"Board"}){ id columns{ id } } }`,
      undefined,
      ownerToken
    );
    const columnId = created.data!.createProject.columns[0].id;

    const res = await gql(app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId, title: "X" } }, otherToken);
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("moveTask (happy): move within same project", async () => {
    const token = await registerAndLogin("m@x.com");
    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string; title: string }> } }>(
      app,
      `mutation { createProject(input:{name:"Board"}){ id columns{ id title } } }`,
      undefined,
      token
    );
    const [c1, c2] = created.data!.createProject.columns;
    const taskRes = await gql<{ createTask: { id: string } }>(
      app,
      `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`,
      { i: { columnId: c1.id, title: "X" } },
      token
    );
    const taskId = taskRes.data!.createTask.id;

    const moved = await gql<{ moveTask: { id: string; column: { id: string } } }>(
      app,
      `mutation($i:MoveTaskInput!){ moveTask(input:$i){ id column{ id } } }`,
      { i: { taskId, toColumnId: c2.id, toPosition: 1 } },
      token
    );
    expect(moved.errors).toBeUndefined();
    expect(moved.data?.moveTask.column.id).toBe(c2.id);
  });

  it("moveTask (sad): cannot move across projects", async () => {
    const token = await registerAndLogin("m@x.com");
    const p1 = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"P1"}){ id columns{ id } } }`, undefined, token
    );
    const p2 = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"P2"}){ id columns{ id } } }`, undefined, token
    );
    const c1 = p1.data!.createProject.columns[0].id;
    const c2 = p2.data!.createProject.columns[0].id;

    const taskRes = await gql<{ createTask: { id: string } }>(
      app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId: c1, title: "X" } }, token
    );
    const taskId = taskRes.data!.createTask.id;

    const res = await gql(app, `mutation($i:MoveTaskInput!){ moveTask(input:$i){ id } }`, { i: { taskId, toColumnId: c2, toPosition: 1 } }, token);
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("assignTask (happy): assign to project member", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const memberToken = await registerAndLogin("mem@x.com");

    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"Board"}){ id columns{ id } } }`, undefined, ownerToken
    );
    const projectId = created.data!.createProject.id;
    const columnId = created.data!.createProject.columns[0].id;

    // Invite + accept to add membership properly
    const invite = await gql<{ inviteMember: { token: string } }>(
      app,
      `mutation($i:InviteMemberInput!){ inviteMember(input:$i){ token email } }`,
      { i: { projectId, email: "mem@x.com" } },
      ownerToken
    );
    const token = invite.data!.inviteMember.token;
    await gql(app, `mutation($t:String!){ acceptInvite(token:$t){ projectRole user{email} } }`, { t: token }, memberToken);

    const member = await prisma.user.findUnique({ where: { email: "mem@x.com" } });

    const task = await gql<{ createTask: { id: string } }>(
      app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId, title: "X" } }, ownerToken
    );
    const taskId = task.data!.createTask.id;

    const res = await gql<{ assignTask: { assignee: { email: string } } }>(
      app,
      `mutation($taskId:ID!, $assigneeId:ID){ assignTask(taskId:$taskId, assigneeId:$assigneeId){ assignee{ email } } }`,
      { taskId, assigneeId: member!.id },
      ownerToken
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.assignTask.assignee.email).toBe("mem@x.com");
  });

  it("assignTask (sad): assignee not member", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    await registerAndLogin("outsider@x.com");
    const outsider = await prisma.user.findUnique({ where: { email: "outsider@x.com" } });

    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"Board"}){ id columns{ id } } }`, undefined, ownerToken
    );
    const columnId = created.data!.createProject.columns[0].id;

    const task = await gql<{ createTask: { id: string } }>(
      app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId, title: "X" } }, ownerToken
    );

    const res = await gql(app,
      `mutation($taskId:ID!, $assigneeId:ID){ assignTask(taskId:$taskId, assigneeId:$assigneeId){ id } }`,
      { taskId: task.data!.createTask.id, assigneeId: outsider!.id },
      ownerToken
    );
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });

  it("commentTask (happy): member comments and nested author resolves", async () => {
    const token = await registerAndLogin("c@x.com");
    const created = await gql<{ createProject: { columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"Board"}){ columns{ id } } }`, undefined, token
    );
    const columnId = created.data!.createProject.columns[0].id;
    const task = await gql<{ createTask: { id: string } }>(
      app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId, title: "X" } }, token
    );

    const res = await gql<{ commentTask: { id: string; author: { email: string } } }>(
      app,
      `mutation($i:CommentTaskInput!){ commentTask(input:$i){ id author{ email } } }`,
      { i: { taskId: task.data!.createTask.id, content: "Hello" } },
      token
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.commentTask.author.email).toBe("c@x.com");
  });

  it("commentTask (sad): unauthenticated", async () => {
    const res = await gql(app, `mutation { commentTask(input:{taskId:"x", content:"y"}){ id } }`);
    expect(res.errors?.[0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("inviteMember (happy): owner invites, acceptInvite adds membership", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const memberToken = await registerAndLogin("mem@x.com");
    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"Board"}){ id } }`, undefined, ownerToken);
    const projectId = created.data!.createProject.id;

    const inv = await gql<{ inviteMember: { token: string; email: string } }>(
      app,
      `mutation($i:InviteMemberInput!){ inviteMember(input:$i){ token email status } }`,
      { i: { projectId, email: "mem@x.com" } },
      ownerToken
    );
    expect(inv.errors).toBeUndefined();
    const token = inv.data!.inviteMember.token;

    const acc = await gql<{ acceptInvite: { projectRole: string; user: { email: string } } }>(
      app,
      `mutation($t:String!){ acceptInvite(token:$t){ projectRole user{ email } } }`,
      { t: token },
      memberToken
    );
    expect(acc.errors).toBeUndefined();
    expect(acc.data?.acceptInvite.user.email).toBe("mem@x.com");
  });

  it("acceptInvite (sad): wrong email for invite", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const memToken = await registerAndLogin("mem@x.com");
    const wrongToken = await registerAndLogin("wrong@x.com");

    const created = await gql<{ createProject: { id: string } }>(app, `mutation { createProject(input:{name:"Board"}){ id } }`, undefined, ownerToken);
    const projectId = created.data!.createProject.id;

    const inv = await gql<{ inviteMember: { token: string } }>(
      app,
      `mutation($i:InviteMemberInput!){ inviteMember(input:$i){ token } }`,
      { i: { projectId, email: "mem@x.com" } },
      ownerToken
    );
    const token = inv.data!.inviteMember.token;

    const res = await gql(app, `mutation($t:String!){ acceptInvite(token:$t){ user{ email } } }`, { t: token }, wrongToken);
    expect(res.errors?.[0].extensions.code).toBe("FORBIDDEN");

    // sanity: mem can accept
    const ok = await gql(app, `mutation($t:String!){ acceptInvite(token:$t){ user{ email } } }`, { t: token }, memToken);
    expect(ok.errors).toBeUndefined();
  });

  it("addLabelToTask (happy) and removeLabelFromTask (happy)", async () => {
    const token = await registerAndLogin("x@x.com");
    const created = await gql<{ createProject: { id: string; columns: Array<{ id: string }> } }>(
      app, `mutation { createProject(input:{name:"Board"}){ id columns{ id } } }`, undefined, token
    );
    const projectId = created.data!.createProject.id;
    const columnId = created.data!.createProject.columns[0].id;

    const label = await gql<{ createLabel: { id: string } }>(
      app, `mutation($i:CreateLabelInput!){ createLabel(input:$i){ id } }`, { i: { projectId, name: "Bug" } }, token
    );
    const labelId = label.data!.createLabel.id;

    const task = await gql<{ createTask: { id: string } }>(
      app, `mutation($i:CreateTaskInput!){ createTask(input:$i){ id } }`, { i: { columnId, title: "X" } }, token
    );
    const taskId = task.data!.createTask.id;

    const added = await gql<{ addLabelToTask: { labels: Array<{ id: string }> } }>(
      app, `mutation($t:ID!, $l:ID!){ addLabelToTask(taskId:$t, labelId:$l){ labels{ id name } } }`, { t: taskId, l: labelId }, token
    );
    expect(added.errors).toBeUndefined();
    expect(added.data?.addLabelToTask.labels.some(l => l.id === labelId)).toBe(true);

    const removed = await gql<{ removeLabelFromTask: { labels: Array<{ id: string }> } }>(
      app, `mutation($t:ID!, $l:ID!){ removeLabelFromTask(taskId:$t, labelId:$l){ labels{ id } } }`, { t: taskId, l: labelId }, token
    );
    expect(removed.errors).toBeUndefined();
    expect(removed.data?.removeLabelFromTask.labels.some(l => l.id === labelId)).toBe(false);
  });

  it("activityLog (happy + sad): member can view; non-member forbidden", async () => {
    const ownerToken = await registerAndLogin("own@x.com");
    const otherToken = await registerAndLogin("other@x.com");
    const created = await gql<{ createProject: { id: string } }>(
      app, `mutation { createProject(input:{name:"Board"}){ id } }`, undefined, ownerToken
    );
    const projectId = created.data!.createProject.id;

    const ok = await gql<{ activityLog: { items: any[]; total: number } }>(
      app, `query($id:ID!){ activityLog(projectId:$id, offset:0, limit:10){ total items{ action actor{ email } } } }`, { id: projectId }, ownerToken
    );
    expect(ok.errors).toBeUndefined();
    expect(ok.data?.activityLog.total).toBeGreaterThan(0);

    const sad = await gql(app, `query($id:ID!){ activityLog(projectId:$id, offset:0, limit:10){ total } }`, { id: projectId }, otherToken);
    expect(sad.errors?.[0].extensions.code).toBe("FORBIDDEN");
  });
});
