import { Task, Member, Role, RoleAssignment, Checkin } from "./schemas";
import { parseFuzzyDate, isOverdue, isDueThisWeek, isStale, getTodayJST } from "./time";
import { LangCode } from "./i18n";

export const DEFAULT_WEIGHT_POINTS: Record<string, number> = {
  軽: 1,
  中: 2,
  重: 3,
};

/**
 * 期限切れ NA かどうかを判定する（要件定義書 5.5：status ≠ 完了、未アーカイブ、na_due < 今日）
 */
export function isOverdueNA(task: Task, today = getTodayJST()): boolean {
  if (task.archived || task.status === "完了") return false;
  return isOverdue(task.naDue, today);
}

/**
 * 今週期限の NA かどうかを判定する（要件定義書 5.5：status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）
 */
export function isDueThisWeekNA(task: Task, today = getTodayJST()): boolean {
  if (task.archived || task.status === "完了") return false;
  return isDueThisWeek(task.naDue, today);
}

/**
 * 停滞タスクかどうかを判定する（要件定義書 5.5：status ≠ 完了、未アーカイブ、updated_at が 7日以上前）
 */
export function isStaleTask(task: Task, staleDays = 7): boolean {
  if (task.archived || task.status === "完了") return false;
  return isStale(task.updatedAt, staleDays);
}

/**
 * 期限切れ NA を持つタスク一覧を取得する（na_due 昇順、task_id 昇順）
 */
export function getOverdueTasks(tasks: Task[], today = getTodayJST(), memberId?: string): Task[] {
  let res = tasks.filter((t) => isOverdueNA(t, today));
  if (memberId) {
    res = res.filter((t) => t.ownerMemberId === memberId);
  }
  return res.sort((a, b) => {
    const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
    const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    return a.taskId.localeCompare(b.taskId);
  });
}

/**
 * 今週期限の NA を持つタスク一覧を取得する（na_due 昇順、task_id 昇順）
 */
export function getDueThisWeekTasks(tasks: Task[], today = getTodayJST(), memberId?: string): Task[] {
  let res = tasks.filter((t) => isDueThisWeekNA(t, today));
  if (memberId) {
    res = res.filter((t) => t.ownerMemberId === memberId);
  }
  return res.sort((a, b) => {
    const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
    const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    return a.taskId.localeCompare(b.taskId);
  });
}

/**
 * 停滞タスク一覧を取得する
 */
export function getStaleTasks(tasks: Task[], staleDays = 7): Task[] {
  return tasks
    .filter((t) => isStaleTask(t, staleDays))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/**
 * 完了率の計算（要件定義書 5.5：完了タスク数 / (全タスク数 - アーカイブタスク数)）
 */
export function calcCompletionRate(tasks: Task[]): number | null {
  const activeTasks = tasks.filter((t) => !t.archived);
  if (activeTasks.length === 0) return null;
  const doneCount = activeTasks.filter((t) => t.status === "完了").length;
  return doneCount / activeTasks.length;
}

export function formatCompletionRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * ホーム画面の1行状況サマリー（要件定義書 5.5 統一ルール）
 */
export function buildHomeSummary(
  memberId: string,
  tasks: Task[],
  today = getTodayJST(),
  lang: LangCode = "ja"
): string {
  const overdueCount = getOverdueTasks(tasks, today).length;
  const dueWeekCount = getDueThisWeekTasks(tasks, today).length;
  const requestsCount = tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== "完了" &&
      t.ownerMemberId === memberId &&
      ["依頼中", "相談中"].includes(t.assignmentStatus) &&
      t.requestedBy !== memberId
  ).length;

  const parts: string[] = [];
  if (lang === "en") {
    if (overdueCount > 0) parts.push(`${overdueCount} NA${overdueCount > 1 ? "s" : ""} past due`);
    if (dueWeekCount > 0) parts.push(`${dueWeekCount} NA${dueWeekCount > 1 ? "s" : ""} due this week`);
    if (requestsCount > 0) parts.push(`${requestsCount} request${requestsCount > 1 ? "s" : ""} for you`);

    if (parts.length === 0) {
      return "All caught up! No urgent tasks or requests pending.";
    }
    return parts.join(" · ");
  } else {
    if (overdueCount > 0) parts.push(`期限を過ぎた NA ${overdueCount}件`);
    if (dueWeekCount > 0) parts.push(`今週期限の NA ${dueWeekCount}件`);
    if (requestsCount > 0) parts.push(`あなたへの依頼 ${requestsCount}件`);

    if (parts.length === 0) {
      return "現在対応が必要な急ぎのタスクや依頼はありません。";
    }
    return parts.join(" ・ ");
  }
}

export interface HomeAlertItem {
  id: string;
  type: "inbox" | "checkin" | "alerts";
  title: string;
  desc: string;
  targetHref: string;
  count?: number;
}

/**
 * ホーム画面のおすすめ・お知らせカード一覧を生成
 */
export function getHomeAlerts(
  memberId: string,
  tasks: Task[],
  checkins: Checkin[],
  today = getTodayJST(),
  lang: LangCode = "ja"
): HomeAlertItem[] {
  const alerts: HomeAlertItem[] = [];

  // 1. 未返答の依頼
  const inboxCount = tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== "完了" &&
      t.ownerMemberId === memberId &&
      ["依頼中", "相談中"].includes(t.assignmentStatus) &&
      t.requestedBy !== memberId
  ).length;

  if (inboxCount > 0) {
    alerts.push({
      id: "inbox",
      type: "inbox",
      title: lang === "en" ? "Requests Waiting for Your Reply" : "あなたへの依頼が届いています",
      desc: lang === "en" ? `${inboxCount} requests pending your review` : `未対応の依頼・相談が ${inboxCount}件 あります`,
      targetHref: "/inbox",
      count: inboxCount,
    });
  }

  // 2. 今日の体感負荷が未回答
  const hasTodayCheckin = checkins.some((c) => c.memberId === memberId && c.date === today);
  if (!hasTodayCheckin) {
    alerts.push({
      id: "checkin",
      type: "checkin",
      title: lang === "en" ? "Check-in for Today" : "今日の体感負荷が未回答です",
      desc: lang === "en" ? "Takes 10 seconds to share your current workload status" : "10秒で今の体感負荷（1〜10）を回答しましょう",
      targetHref: "/checkin",
    });
  }

  // 3. 自分の期限切れ NA
  const myOverdueCount = tasks.filter(
    (t) => !t.archived && t.status !== "完了" && t.ownerMemberId === memberId && isOverdue(t.naDue, today)
  ).length;

  if (myOverdueCount > 0) {
    alerts.push({
      id: "alerts",
      type: "alerts",
      title: lang === "en" ? "Overdue Next Actions" : "期限超過の NA があります",
      desc: lang === "en" ? `You have ${myOverdueCount} overdue actions` : `あなたの担当タスクで期限を過ぎた NA が ${myOverdueCount}件 あります`,
      targetHref: "/my-tasks",
      count: myOverdueCount,
    });
  }

  return alerts;
}

export interface RoleBoardItem {
  role: Role;
  leadMember: Member | null;
  openTaskCount: number;
  overdueNaCount: number;
  dueThisWeekNaCount: number;
  nearestNaTask: Task | null;
}

/**
 * 役職ボード用サマリー（F2）
 */
export function buildRoleBoardSummaries(
  roles: Role[],
  members: Member[],
  roleAssignments: RoleAssignment[],
  tasks: Task[],
  today = getTodayJST()
): RoleBoardItem[] {
  const memberMap = new Map(members.map((m) => [m.memberId, m]));
  const leadByRole = new Map<string, Member>();

  for (const ra of roleAssignments) {
    if (ra.kind === "責任者") {
      const m = memberMap.get(ra.memberId);
      if (m) leadByRole.set(ra.roleId, m);
    }
  }

  const activeTasks = tasks.filter((t) => !t.archived);
  const activeRoles = roles.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);

  return activeRoles.map((role) => {
    const roleOpenTasks = activeTasks.filter(
      (t) => t.roleIds.split(",").map((s) => s.trim()).includes(role.roleId) && t.status !== "完了"
    );
    const overdueCount = roleOpenTasks.filter((t) => isOverdue(t.naDue, today)).length;
    const dueWeekCount = roleOpenTasks.filter((t) => isDueThisWeek(t.naDue, today)).length;

    let nearestTask: Task | null = null;
    if (roleOpenTasks.length > 0) {
      nearestTask = [...roleOpenTasks].sort((a, b) => {
        const da = parseFuzzyDate(a.naDue).dateString || "9999-99-99";
        const db = parseFuzzyDate(b.naDue).dateString || "9999-99-99";
        if (da !== db) return da.localeCompare(db);
        return a.taskId.localeCompare(b.taskId);
      })[0];
    }

    return {
      role,
      leadMember: leadByRole.get(role.roleId) || null,
      openTaskCount: roleOpenTasks.length,
      overdueNaCount: overdueCount,
      dueThisWeekNaCount: dueWeekCount,
      nearestNaTask: nearestTask,
    };
  });
}

/**
 * 自動負荷ポイントの計算（要件定義書 5.4）
 */
export function calcMemberAutoLoad(
  memberId: string,
  tasks: Task[],
  today = getTodayJST(),
  loadWindowDays = 14
): number {
  let totalPt = 0;
  const [y, m, d] = today.split("-").map(Number);
  const maxDueDate = new Date(Date.UTC(y, m - 1, d + loadWindowDays));
  const maxDueStr = maxDueDate.toISOString().slice(0, 10);

  for (const t of tasks) {
    if (t.ownerMemberId !== memberId) continue;
    if (t.archived || t.status === "完了") continue;

    const { dateString } = parseFuzzyDate(t.naDue);
    // 期限切れまたは今日から 14日以内
    if (dateString && dateString <= maxDueStr) {
      const pt = DEFAULT_WEIGHT_POINTS[t.weight] || 2;
      totalPt += pt;
    }
  }

  return totalPt;
}

/**
 * 自動負荷を 1〜10 に換算
 */
export function scaleAutoLoadsTo10(autoLoads: Record<string, number>): Record<string, number> {
  const values = Object.values(autoLoads);
  if (values.length === 0) return {};
  const maxPt = Math.max(...values, 0);
  if (maxPt <= 0) {
    const res: Record<string, number> = {};
    for (const id of Object.keys(autoLoads)) res[id] = 1;
    return res;
  }

  const res: Record<string, number> = {};
  for (const [id, pt] of Object.entries(autoLoads)) {
    if (pt <= 0) {
      res[id] = 1;
    } else {
      const val = Math.round((pt / maxPt) * 10);
      res[id] = Math.max(1, Math.min(10, val));
    }
  }
  return res;
}

/**
 * 最新の体感負荷と有効期限（7日以内）を取得
 */
export function getLatestCheckin(
  memberId: string,
  checkins: Checkin[],
  today = getTodayJST()
): { checkin: Checkin | null; isFresh: boolean } {
  const memberCheckins = checkins.filter((c) => c.memberId === memberId && c.date);
  if (memberCheckins.length === 0) return { checkin: null, isFresh: false };

  memberCheckins.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.checkinId.localeCompare(a.checkinId);
  });

  const latest = memberCheckins[0];
  const [ty, tm, td] = today.split("-").map(Number);
  const [cy, cm, cd] = latest.date.split("-").map(Number);
  const diffDays = (Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / (1000 * 60 * 60 * 24);

  return {
    checkin: latest,
    isFresh: diffDays < 7,
  };
}

/**
 * 負荷ギャップ判定（差分 4 以上）
 */
export function hasLoadGap(scaledAutoLoad: number, subjectiveScore: number | null, gapThreshold = 4): boolean {
  if (subjectiveScore === null || subjectiveScore === undefined) return false;
  return Math.abs(scaledAutoLoad - subjectiveScore) >= gapThreshold;
}
