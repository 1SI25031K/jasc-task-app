import { Task, ActivityLog } from "./schemas";

export type AssignmentStatus = "承諾済" | "依頼中" | "相談中" | string;

export class InvalidAssignmentTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssignmentTransitionError";
  }
}

export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

/**
 * タスク作成時の assignment_status と requested_by を決定する（5.3）。
 * - 自分を担当者にした場合：['承諾済', '']
 * - 自分以外を担当者にした場合：['依頼中', creatorMemberId]
 */
export function determineInitialAssignment(
  creatorMemberId: string,
  ownerMemberId: string
): [AssignmentStatus, string] {
  if (!creatorMemberId || !ownerMemberId) {
    throw new InvalidAssignmentTransitionError("作成者IDと担当者IDは必須です。");
  }
  if (creatorMemberId === ownerMemberId) {
    return ["承諾済", ""];
  }
  return ["依頼中", creatorMemberId];
}

/**
 * 依頼中のタスクを担当者本人が「承諾」する（5.3）。
 * 違反時（担当者本人以外、依頼中でない、アーカイブ済）はエラーを送出。
 */
export function acceptAssignment(
  task: Task,
  actorMemberId: string,
  now: string = new Date().toISOString()
): [Task, ActivityLog] {
  if (task.archived) {
    throw new InvalidAssignmentTransitionError("アーカイブされたタスクの依頼は承諾できません。");
  }
  if (actorMemberId !== task.ownerMemberId) {
    throw new InvalidAssignmentTransitionError("担当者本人以外は依頼を承諾できません。");
  }
  if (task.assignmentStatus !== "依頼中") {
    throw new InvalidAssignmentTransitionError(
      `現在の状態が「${task.assignmentStatus}」のため承諾できません（「依頼中」のみ承諾可能）。`
    );
  }

  const oldStatus = task.assignmentStatus;
  const updatedTask: Task = {
    ...task,
    assignmentStatus: "承諾済",
    assignmentComment: "",
    updatedAt: now,
    updatedBy: actorMemberId,
  };

  const log: ActivityLog = {
    timestamp: now,
    memberId: actorMemberId,
    taskId: task.taskId,
    action: "accept",
    field: "assignment_status",
    oldValue: oldStatus,
    newValue: "承諾済",
  };

  return [updatedTask, log];
}

/**
 * 依頼中のタスクについて担当者本人が「相談したい」（コメント必須）を選ぶ（5.3）。
 * 違反時（担当者本人以外、依頼中でない、コメント空、アーカイブ済）はエラーを送出。
 */
export function consultAssignment(
  task: Task,
  actorMemberId: string,
  comment: string,
  now: string = new Date().toISOString()
): [Task, ActivityLog] {
  if (task.archived) {
    throw new InvalidAssignmentTransitionError("アーカイブされたタスクは相談中に変更できません。");
  }
  if (actorMemberId !== task.ownerMemberId) {
    throw new InvalidAssignmentTransitionError("担当者本人以外は「相談したい」を選択できません。");
  }
  if (task.assignmentStatus !== "依頼中") {
    throw new InvalidAssignmentTransitionError(
      `現在の状態が「${task.assignmentStatus}」のため相談中に変更できません（「依頼中」のみ可能）。`
    );
  }
  const cleanComment = (comment || "").trim();
  if (!cleanComment) {
    throw new InvalidAssignmentTransitionError("「相談したい」を選択する場合はコメントが必須です。");
  }

  const oldStatus = task.assignmentStatus;
  const updatedTask: Task = {
    ...task,
    assignmentStatus: "相談中",
    assignmentComment: cleanComment,
    updatedAt: now,
    updatedBy: actorMemberId,
  };

  const log: ActivityLog = {
    timestamp: now,
    memberId: actorMemberId,
    taskId: task.taskId,
    action: "consult",
    field: "assignment_status",
    oldValue: oldStatus,
    newValue: "相談中",
  };

  return [updatedTask, log];
}

/**
 * 担当者の変更、または「相談中」からの内容調整後の再依頼を行う（5.3・F8）。
 */
export function reassignOrRerequest(
  task: Task,
  newOwnerMemberId: string,
  actorMemberId: string,
  now: string = new Date().toISOString()
): [Task, ActivityLog] {
  if (task.archived) {
    throw new InvalidAssignmentTransitionError("アーカイブされたタスクの担当変更・再依頼はできません。");
  }
  if (!newOwnerMemberId || !actorMemberId) {
    throw new InvalidAssignmentTransitionError("新しい担当者IDと操作者IDは必須です。");
  }
  if (newOwnerMemberId === task.ownerMemberId && task.assignmentStatus !== "相談中") {
    throw new InvalidAssignmentTransitionError("同じ担当者への再依頼は「相談中」の状態からのみ行えます。");
  }

  const [newStatus, newRequestedBy] = determineInitialAssignment(actorMemberId, newOwnerMemberId);
  const oldVal = `${task.ownerMemberId}(${task.assignmentStatus})`;
  const newVal = `${newOwnerMemberId}(${newStatus})`;

  const updatedTask: Task = {
    ...task,
    ownerMemberId: newOwnerMemberId,
    requestedBy: newRequestedBy,
    assignmentStatus: newStatus,
    assignmentComment: "",
    updatedAt: now,
    updatedBy: actorMemberId,
  };

  const log: ActivityLog = {
    timestamp: now,
    memberId: actorMemberId,
    taskId: task.taskId,
    action: "request",
    field: "owner_member_id",
    oldValue: oldVal,
    newValue: newVal,
  };

  return [updatedTask, log];
}
