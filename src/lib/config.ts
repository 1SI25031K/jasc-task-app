export const CONFIG = {
  academicYearStart: "2026-09",
  timeZone: "Asia/Tokyo",
  cacheTtlSeconds: 300, // 5 minutes server-side cache
  sheets: {
    members: "members",
    roles: "roles",
    roleAssignments: "role_assignments",
    tasks: "tasks",
    checkins: "checkins",
    dailySnapshots: "daily_snapshots",
    settings: "settings",
    activityLog: "activity_log",
    meetings: "meetings",
    reminderLog: "reminder_log",
  },
} as const;

