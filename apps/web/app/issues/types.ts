export type ProfileRef = {
  id: string;
  role: "admin" | "member" | "viewer";
  display_name?: string | null;
};

export type IssueListItem = {
  id: string;
  title: string;
  status: "open" | "resolved";
  due_date: string | null;
  created_at: string;
  created_by: string;
  created_by_profile: ProfileRef | null;
  comment_count: number;
};

export type IssueDetail = {
  id: string;
  title: string;
  description: string;
  status: "open" | "resolved";
  assigned_to: string | null;
  due_date: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  resolved_by: string | null;
  created_by_profile: ProfileRef | null;
  resolved_by_profile: ProfileRef | null;
  assigned_to_profile: ProfileRef | null;
};

export type IssueComment = {
  id: string;
  issue_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_profile: ProfileRef | null;
};

export type IssueCheck = {
  id: string;
  issue_id: string;
  user_id: string;
  checked_at: string;
  user_profile: ProfileRef | null;
};

export type Me = {
  id: string;
  email: string | null;
  role: "admin" | "member" | "viewer";
  displayName: string | null;
};

export type ApiMeResponse = {
  userId: string;
  email: string | null;
  role: "admin" | "member" | "viewer";
  displayName: string | null;
};

export type AuditLog = {
  id: string;
  user_id?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  issue_id?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  user_profile: ProfileRef | null;
};
