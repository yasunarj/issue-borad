import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import type { AppEnv } from "../app";
import { createAuditLog } from "../lib/auditLog.js";
import { sendMail, sendNotifyMail } from "../lib/sendMail.js";
import { buildIssueMailTemplate } from "../lib/issueMailTemplate.js";

const issues = new Hono<AppEnv>();

const createIssueSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(100, "title too long"),
  description: z.string().trim().min(1, "description is required").max(2000, "description too long"),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v)),
});

const updateIssueSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(100, "title too long"),
  description: z.string().trim().min(1, "description is required").max(2000, "description too long"),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v))
})

const updateAssigneeSchema = z.object({
  assignedTo: z.uuid({ error: "assigned to invalid" })
})

const createCommentSchema = z.object({
  comment: z.string().trim().min(1, "comment is required").max(1000, "comment too long"),
});

const resolveIssueSchema = z.object({
  resolution: z.string().trim().max(2000, "resolution too long").optional(),
})

issues.use("*", authMiddleware);

issues.get("/", requireRole(["member", "admin", "viewer"]), async (c) => {
  const scope = c.req.query("scope");
  const user = c.get("user");

  let query = supabaseAdmin
    .from("issues")
    .select(`
      id,
      title,
      status,
      due_date,
      created_at,
      created_by,
      assigned_to,
      created_by_profile:profiles!issues_created_by_fkey (
        id,
        role,
        display_name
      ),
      assigned_to_profile:profiles!issues_assigned_to_fkey (
        id,
        role,
        display_name
      ),
      comment_count:issue_comments(count)
    `)
    .order("created_at", { ascending: false });

  if (scope === "assigned") {
    query = query.eq("assigned_to", user.id);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const issues = (data ?? []).map((issue) => ({
    ...issue, comment_count: issue.comment_count?.[0]?.count ?? 0,
  }))

  return c.json({ ok: true, issues });
})

issues.post("/", requireRole(["member", "admin"]), async (c) => {
  const body = await c.req.json();
  const result = createIssueSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400)
  }

  const user = c.get("user");
  const { title, description, dueDate } = result.data;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single()

  const { data, error } = await supabaseAdmin
    .from("issues")
    .insert({
      title,
      description,
      due_date: dueDate || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "issue.create",
    targetType: "issue",
    targetId: data.id,
    issueId: data.id,
    detail: {
      title: data.title,
      due_date: data.due_date,
    },
  });

  try {
    const issueUrl = `${process.env.APP_BASE_URL}/issues/${data.id}`;
    const mailTemplate = buildIssueMailTemplate({
      notificationType: "新規Issue作成通知",
      headline: "新しいIssueが作成されました。",
      issueTitle: data.title,
      dueDate: data.due_date,
      createdByName: profile?.display_name ?? "不明",
      issueUrl,
      action: "内容を確認し、必要に応じて担当者の設定や対応方針の確認を行ってください。",
      description: data.description,
    });

    await sendNotifyMail({
      subject: `[Issue Board] 新規Issue作成: ${data.title}`,
      text: mailTemplate.text,
      html: mailTemplate.html,
    })
  } catch (mailError) {
    console.error("メール送信失敗", mailError)
  }

  return c.json(
    {
      message: "Issue created",
      issue: data,
    },
    201
  )
});

issues.get("/:id", requireRole(["admin", "member", "viewer"]), async (c) => {
  const issueId = c.req.param("id");

  const { data, error } = await supabaseAdmin
    .from("issues")
    .select(`
      id,
      title,
      description,
      status,
      due_date,
      resolution,
      resolved_at,
      created_at,
      updated_at,
      created_by,
      resolved_by,
      assigned_to,
      created_by_profile:profiles!issues_created_by_fkey (
        id,
        role,
        display_name
      ),
      resolved_by_profile:profiles!issues_resolved_by_fkey (
        id,
        role,
        display_name
      ),
      assigned_to_profile:profiles!issues_assigned_to_fkey (
        id,
        role,
        display_name
      )
    `)
    .eq("id", issueId)
    .single()

  if (error || !data) {
    return c.json({ error: "Issue not found", detail: error.message }, 404);
  }

  return c.json({
    ok: true,
    issue: data,
  })
})

issues.delete("/:id", requireRole(["admin"]), async (c) => {
  const issueId = c.req.param("id");
  const user = c.get("user");

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id, title")
    .eq("id", issueId)
    .single()

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404)
  }


  const { error } = await supabaseAdmin
    .from("issues")
    .delete()
    .eq("id", issueId)

  if (error) {
    console.error(error);
    return c.json({ error: "Failed to delete issue" }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "issue.delete",
    targetType: "issue",
    targetId: issue.id,
    issueId: null,
    detail: {
      title: issue.title ?? null,
    }
  })

  return c.json({
    message: "Issue deleted",
  }, 200)
});

issues.patch("/:id", requireRole(["admin"]), async (c) => {
  const issueId = c.req.param("id");
  const body = await c.req.json();
  const result = updateIssueSchema.safeParse(body);
  const user = c.get("user");

  if (!result.success) {
    return c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
  }

  const { title, description, dueDate } = result.data;

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const { data, error } = await supabaseAdmin
    .from("issues")
    .update({
      title,
      description,
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId)
    .select()
    .single();

  if (error) {
    console.error(error);
    return c.json({ error: "Failed to update issue" }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "issue.update",
    targetType: "issue",
    targetId: data.id,
    issueId: data.id,
    detail: {
      title: data.title,
      due_date: data.due_date,
    },
  });

  return c.json({
    message: "Issue updated",
    issue: data,
  }, 200);
})

issues.patch("/:id/assignee", requireRole(["admin"]), async (c) => {
  const issueId = c.req.param("id");
  const body = await c.req.json();
  const user = c.get("user");

  const result = updateAssigneeSchema.safeParse(body);

  if (!result.success) {
    return c.json({
      error: result.error.issues[0]?.message ?? "Invalid request"
    }, 400);
  }

  const { assignedTo } = result.data;

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select(`
      id,
      title,
      due_date,
      assigned_to,
      status,
      created_by_profile:profiles!issues_created_by_fkey ( display_name )
    `)
    .eq("id", issueId)
    .single();

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  if (issue.status === "resolved") {
    return c.json(
      { error: "Resolved issue assignee cannot be changed" },
      400
    );
  }

  const { data: checkedUser, error: checkedUserError } = await supabaseAdmin
    .from("issue_checks")
    .select("id")
    .eq("issue_id", issueId)
    .eq("user_id", assignedTo)
    .maybeSingle();

  if (checkedUserError) {
    console.error(checkedUserError);
    return c.json({ error: "Failed to verify checked user" }, 500);
  }

  if (!checkedUser) {
    return c.json({ error: "Assignee must be a checked user" }, 400);
  }

  const { data: assigneeProfile, error: assigneeProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", assignedTo)
    .single();

  if (assigneeProfileError || !assigneeProfile) {
    return c.json({ error: "Assignee not found" }, 404);
  }

  if (!["admin", "member"].includes(assigneeProfile.role)) {
    return c.json(
      { error: "Viewer users cannot be assigned to issues" },
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from("issues")
    .update({
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
      reminder_3days_sent_at: null,
      reminder_due_sent_at: null,
    })
    .eq("id", issueId)
    .select()
    .single();

  if (error) {
    console.error(error);
    return c.json({ error: "Failed to update issue assignee" }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "issue.assign",
    targetType: "issue",
    targetId: data.id,
    issueId: data.id,
    detail: {
      previous_assigned_to: issue.assigned_to ?? null,
      assigned_to: assignedTo,
      assignee_display_name: assigneeProfile.display_name ?? null
    }
  })

  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(assignedTo);
    const email = userData.user?.email;
    const issueUrl = `${process.env.APP_BASE_URL}/issues/${issueId}`

    if (!email) {
      throw new Error("担当者のメールアドレスが見つかりません");
    }

    const mailTemplate = buildIssueMailTemplate({
      notificationType: "担当者設定通知",
      headline: "あなたがIssueの担当者に設定されました。",
      issueTitle: issue.title,
      dueDate: issue.due_date,
      assigneeName: assigneeProfile.display_name,
      issueUrl,
      action: "詳細ページで内容と期限を確認し、対応を開始してください。",
    });

    await sendMail({
      to: email,
      subject: `[Issue Board] 担当者設定: ${issue.title}`,
      text: mailTemplate.text,
      html: mailTemplate.html,
    })
  } catch (mailError) {
    console.error("メール送信失", mailError);
  }

  return c.json({
    message: "Issue assignee updated",
    issue: data,
    assignedUser: assigneeProfile.display_name
  }, 200);
})

issues.patch("/:id/resolve", requireRole(["admin", "member"]), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const body = await c.req.json().catch(() => ({}));
  const result = resolveIssueSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        error: result.error.issues[0].message ?? "Invalid request",
      },
      400,
    )
  }

  const { resolution } = result.data;

  const { data: current, error: fetchError } = await supabaseAdmin
    .from("issues")
    .select("status, title, assigned_to")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return c.json({ error: "Issue not found" }, 404);
  }

  if (!current?.assigned_to) {
    return c.json({ error: "Issue assignee is not set" }, 400);
  }

  if (current.assigned_to !== user.id) {
    return c.json({ error: "Only the assignee user can resolve this issue" }, 403)
  }

  const newStatus = current.status === "resolved" ? "open" : "resolved";

  if (newStatus === "resolved" && !resolution) {
    return c.json(
      { error: "Resolution is required" },
      400,
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();


  const { data, error } = await supabaseAdmin
    .from("issues")
    .update({
      status: newStatus,
      resolved_by: newStatus === "resolved" ? user.id : null,
      resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
      resolution: newStatus === "resolved" ? resolution : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: newStatus === "resolved" ? "issue.resolve" : "issue.reopen",
    targetType: "issue",
    targetId: data.id,
    issueId: data.id,
    detail: {
      status: newStatus,
      resolution: newStatus === "resolved" ? data.resolution : null,
    },
  });

  try {
    await sendNotifyMail({
      subject: newStatus === "resolved"
        ? "【Issue Board】Issueが解決されました"
        : "【Issue Board】Issueが未解決に戻されました",
      text: `
      Issueのステータスが変更されました
  
      タイトル: ${data.title ?? ""}
      実行者: ${profile?.display_name ?? "不明"}
      新しいステータス: ${newStatus}
      解決内容: ${
        newStatus === "resolved" ? data.resolution ?? "" : "-"
      }
      Issue ID: ${data.id}
      `.trim(),
    })
  } catch (mailError) {
    console.error("メール送信失敗", mailError)
  }

  return c.json({ message: "Issue updated", issue: data }, 200);
});

issues.get("/:id/comments", requireRole(["admin", "member", "viewer"]), async (c) => {
  const issueId = c.req.param("id");

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const { data: comments, error: commentsError } = await supabaseAdmin
    .from("issue_comments")
    .select(`
      id,
      issue_id,
      user_id,
      body,
      created_at,
      user_profile:profiles!issue_comments_user_id_fkey (
        id,
        role,
        display_name
      )
    `)
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });

  if (commentsError) {
    return c.json({ error: "Failed to fetch comments" }, 500);
  }

  return c.json({
    ok: true,
    comments,
  }, 200);
});

issues.post("/:id/comments", requireRole(["admin", "member"]), async (c) => {
  try {
    const issueId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json();
    const result = createCommentSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
    }

    const { comment } = result.data

    const { data: issue, error: issueError } = await supabaseAdmin
      .from("issues")
      .select("id")
      .eq("id", issueId)
      .single();

    if (issueError || !issue) {
      return c.json({ error: "Issue not found" }, 404);
    }

    const { data: insertComment, error: insertError } = await supabaseAdmin
      .from("issue_comments")
      .insert({
        issue_id: issueId,
        user_id: user.id,
        body: comment,
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      return c.json({ error: "Failed to create comment" }, 500);
    }

    await createAuditLog({
      userId: user.id,
      action: "comment.create",
      targetType: "comment",
      targetId: insertComment.id,
      issueId: issueId,
      detail: {
        body: insertComment.body,
      }
    })

    return c.json({ message: "comment created", comment: insertComment }, 201);
  } catch (e) {
    console.error(e);
    return c.json({ error: "invalid request" }, 400);
  }
})

issues.delete("/:issueId/comments/:commentId", requireRole(["admin"]), async (c) => {
  const issueId = c.req.param("issueId");
  const commentId = c.req.param("commentId");
  const user = c.get("user");

  const { data: comment, error: commentError } = await supabaseAdmin
    .from("issue_comments")
    .select("id, issue_id, body")
    .eq("id", commentId)
    .eq("issue_id", issueId)
    .single();

  if (commentError || !comment) {
    return c.json({ error: "Comment not found" }, 404);
  }

  const { error } = await supabaseAdmin
    .from("issue_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error(error);
    return c.json({ error: "Failed to delete comment" }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "comment.delete",
    targetType: "comment",
    targetId: comment.id,
    issueId: comment.issue_id,
    detail: {
      body: comment.body
    },
  });

  return c.json({
    message: "Comment deleted",
  }, 200)
})

issues.get("/:id/checks", requireRole(["admin", "member", "viewer"]), async (c) => {
  const issueId = c.req.param("id");

  // 該当するissueが存在するかをチェックする
  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  // 該当するissueにチェック済みがあるかどうかを調べる。ついでにjoinしてチェックしたユーザーの情報も併せてprofilesテーブルから取得する
  const { data: checks, error: checksError } = await supabaseAdmin
    .from("issue_checks")
    .select(`
    id,
    issue_id,
    user_id,
    checked_at,
    user_profile:profiles!issue_checks_user_id_fkey (
      id,
      role,
      display_name
    )
    `)
    .eq("issue_id", issueId)
    .order("checked_at", { ascending: true });

  if (checksError) {
    return c.json({ error: "Failed to fetch checks" }, 500);
  }

  return c.json({ ok: true, checks }, 200);
})

issues.post("/:id/check", requireRole(["admin", "member", "viewer"]), async (c) => {
  const issueId = c.req.param("id");
  const user = c.get("user");

  // ここで対象となるissueが存在するのかを確認する
  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (issueError || !issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  // 次にissue_checkテーブルから該当するissueとログインしているユーザーのidが存在しているかをチェックする
  const { data: existingCheck, error: existingCheckError } = await supabaseAdmin
    .from("issue_checks")
    .select("id")
    .eq("issue_id", issueId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingCheckError) {
    console.error(existingCheckError);
    return c.json({ error: "Failed to check existing record" }, 500);
  }

  // もしもテーブルにデータがあればすでにチェック済なのでinsertはしないようにする
  if (existingCheck) {
    return c.json({
      message: "Already checked",
      alreadyChecked: true,
    }, 200);
  }

  // テーブルにデータがないということは未チェックなのでここでinsertをする
  const { data: check, error: insertError } = await supabaseAdmin
    .from("issue_checks")
    .insert({
      issue_id: issueId,
      user_id: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error(insertError);
    return c.json({ error: "Failed to create check" }, 500);
  }

  await createAuditLog({
    userId: user.id,
    action: "issue.check",
    targetType: "check",
    targetId: check.id,
    issueId: issueId,
    detail: {
      checked_at: check.checked_at,
    }
  })

  return c.json(
    {
      message: "Issue checked",
      alreadyChecked: false,
      check,
    },
    201
  );
});

issues.get("/:id/audit-logs", requireRole(["admin"]), async (c) => {
  const issueId = c.req.param("id");
  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .single();

  if (!issue || issueError) {
    return c.json({ error: "issue not found" }, 404);
  }

  const { data: logs, error: logsError } = await supabaseAdmin
    .from("audit_logs")
    .select(`
      id,
      user_id,
      action,
      target_type,
      target_id,
      issue_id,
      detail,
      created_at,
      user_profile:profiles!audit_logs_user_id_fkey (
      id,
      role,
      display_name
      )
    `)
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false });

  if (logsError) {
    console.error(logsError);
    return c.json({ error: "Failed to fetch audit logs" }, 500);
  }

  return c.json({
    ok: true,
    logs: logs ?? []
  }, 200)
});

export default issues;

