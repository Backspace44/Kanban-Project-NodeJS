import gql from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime
  scalar JSON

  enum Role {
    ADMIN
    USER
  }

  enum ProjectRole {
    OWNER
    MEMBER
  }

  enum InvitationStatus {
    PENDING
    ACCEPTED
    REVOKED
  }

  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
    ARCHIVED
  }

  type UserProfile {
    displayName: String!
    avatarUrl: String
  }

  type User {
    id: ID!
    email: String!
    role: Role!
    createdAt: DateTime!
    profile: UserProfile
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type ProjectMember {
    projectRole: ProjectRole!
    joinedAt: DateTime!
    user: User!
  }

  type Label {
    id: ID!
    name: String!
    color: String
  }

  type Comment {
    id: ID!
    content: String!
    createdAt: DateTime!
    author: User!
  }

  type Task {
    id: ID!
    title: String!
    description: String
    dueDate: DateTime
    position: Int!
    status: TaskStatus!
    createdAt: DateTime!
    updatedAt: DateTime!
    creator: User!
    assignee: User
    column: Column!
    labels: [Label!]!
    commentCount: Int!
  }

  type Column {
    id: ID!
    title: String!
    position: Int!
    createdAt: DateTime!
    tasks(offset: Int!, limit: Int!, status: TaskStatus, assigneeId: ID): TaskPage!
  }

  type Project {
    id: ID!
    name: String!
    createdAt: DateTime!
    owner: User!
    columns: [Column!]!
    members(offset: Int!, limit: Int!): ProjectMemberPage!
    labels(offset: Int!, limit: Int!, search: String): LabelPage!
  }

  type Invitation {
    id: ID!
    email: String!
    token: String!
    status: InvitationStatus!
    createdAt: DateTime!
    project: Project!
    invitedBy: User!
  }

  type ActivityLog {
    id: ID!
    action: String!
    createdAt: DateTime!
    actor: User!
    project: Project!
    task: Task
    details: JSON
  }

  type ProjectPage {
    items: [Project!]!
    total: Int!
    offset: Int!
    limit: Int!
  }

  type TaskPage {
    items: [Task!]!
    total: Int!
    offset: Int!
    limit: Int!
  }

  type CommentPage {
    items: [Comment!]!
    total: Int!
    offset: Int!
    limit: Int!
  }

  type LabelPage {
    items: [Label!]!
    total: Int!
    offset: Int!
    limit: Int!
  }

  type ProjectMemberPage {
    items: [ProjectMember!]!
    total: Int!
    offset: Int!
    limit: Int!
  }

  type ActivityLogPage {
    items: [ActivityLog!]!
    total: Int!
   offset: Int!
    limit: Int!
  }

  input RegisterInput {
    email: String!
    password: String!
    displayName: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreateProjectInput {
    name: String!
  }

  input CreateColumnInput {
    projectId: ID!
    title: String!
    position: Int!
  }

  input CreateTaskInput {
    columnId: ID!
    title: String!
    description: String
    dueDate: DateTime
    assigneeId: ID
  }

  input UpdateTaskInput {
    title: String
    description: String
    dueDate: DateTime
    status: TaskStatus
  }

  input MoveTaskInput {
    taskId: ID!
    toColumnId: ID!
    toPosition: Int!
  }

  input CommentTaskInput {
    taskId: ID!
    content: String!
  }

  input InviteMemberInput {
    projectId: ID!
    email: String!
  }

  input CreateLabelInput {
    projectId: ID!
    name: String!
    color: String
  }

  type Query {
    me: User!
    projects(offset: Int!, limit: Int!, search: String): ProjectPage!
    project(projectId: ID!): Project!
    tasks(projectId: ID!, offset: Int!, limit: Int!, status: TaskStatus, assigneeId: ID): TaskPage!
    comments(taskId: ID!, offset: Int!, limit: Int!): CommentPage!
    activityLog(projectId: ID!, offset: Int!, limit: Int!): ActivityLogPage!
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!

    createProject(input: CreateProjectInput!): Project!
    createColumn(input: CreateColumnInput!): Column!
    createTask(input: CreateTaskInput!): Task!
    updateTask(taskId: ID!, input: UpdateTaskInput!): Task!
    moveTask(input: MoveTaskInput!): Task!
    assignTask(taskId: ID!, assigneeId: ID): Task!
    commentTask(input: CommentTaskInput!): Comment!

    inviteMember(input: InviteMemberInput!): Invitation!
    acceptInvite(token: String!): ProjectMember!

    createLabel(input: CreateLabelInput!): Label!
    addLabelToTask(taskId: ID!, labelId: ID!): Task!
    removeLabelFromTask(taskId: ID!, labelId: ID!): Task!
  }
`;
