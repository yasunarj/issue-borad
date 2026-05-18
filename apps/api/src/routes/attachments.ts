import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { supabaseAdmin } from "../lib/supabase";
import { createDownloadSignedUrl, createUploadSignedUrl, getIssueAttachmentKey, deleteS3Object } from "../lib/s3";
import { createAuditLog } from "../lib/auditLog";

const attachments = new Hono();

attachments.use("*", authMiddleware);

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
  // numberは数字であること、intは整数であること、positiveは0よりも大きいこと
  // 5 * 1024 * 1024 これは 5MB までということ
});

const createAttachmentSchema = z.object({
  attachmentId: z.uuid(),
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024), //5MB
})

attachments.post("/upload-url", requireRole(["admin", "member"]), async (c) => {
  const user = c.get("user");
  const issueId = c.req.param("id");

  if (!issueId) {
    return c.json({ error: "IssueId not found" }, 400);
  }

  const json = await c.req.json().catch(() => null);

  const parsed = uploadUrlSchema.safeParse(json);

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid request body",
        details: parsed.error.issues[0]?.message,
      },
      400,
    );
  }

  const { fileName, contentType, sizeBytes } = parsed.data

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .maybeSingle();
  // maybeSingleはもしもデータが存在しなかったらエラーではなくnullを返すようにするための関数

  if (issueError) {
    return c.json({ error: "Failed to fetch issue" }, 500);
  }

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const attachmentId = randomUUID();

  const s3Key = getIssueAttachmentKey({
    issueId,
    attachmentId,
    fileName,
  })

  const uploadUrl = await createUploadSignedUrl({
    key: s3Key,
    contentType,
  });

  return c.json({
    attachmentId,
    s3Key,
    fileName,
    contentType,
    sizeBytes,
    uploadUrl,
    uploadedBy: user.id,
  });
});

attachments.post("/", requireRole(["admin", "member"]), async (c) => {
  const user = c.get("user");
  const issueId = c.req.param("id");

  if (!issueId) {
    return c.json({ error: "IssueId not found" }, 400);
  }

  const json = await c.req.json().catch(() => null);

  const parsed = createAttachmentSchema.safeParse(json);

  if (!parsed.success) {
    return c.json({
      error: "Invalid request body",
      details: parsed.error.issues[0]?.message,
    }, 400)
  }

  const { attachmentId, s3Key, fileName, contentType, sizeBytes } = parsed.data;

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .maybeSingle();

  if (issueError) {
    return c.json({
      error: "Failed to fetch issue"
    }, 500);
  }

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const { data: attachment, error: insertError } = await supabaseAdmin
    .from("issue_attachments")
    .insert({
      id: attachmentId,
      issue_id: issueId,
      uploaded_by: user.id,
      s3_key: s3Key,
      file_name: fileName,
      content_type: contentType,
      size_bytes: sizeBytes,
    })
    .select("id, issue_id, uploaded_by, s3_key, file_name, content_type, size_bytes, created_at")
    .single()

  if (insertError) {
    return c.json({ error: "Failed to create attachment" }, 500);
  }

  return c.json({
    attachment,
  });
});

attachments.get("/", requireRole(["admin", "member", "viewer"]), async (c) => {
  const issueId = c.req.param("id");

  if (!issueId) {
    return c.json({
      error: "IssueId not found"
    }, 400);
  }

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .maybeSingle()

  if (issueError) {
    return c.json({ error: "Failed to fetch issue" }, 500);
  }

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from("issue_attachments")
    .select("id, issue_id, uploaded_by, s3_key, file_name, content_type, size_bytes, created_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })

  if (attachmentsError) {
    return c.json({
      error: "Failed to fetch attachments"
    }, 500);
  }

  const attachmentsWithUrls = await Promise.all(
    (attachments ?? []).map(async (attachment) => {
      const url = await createDownloadSignedUrl({ key: attachment.s3_key });

      return {
        id: attachment.id,
        issueId: attachment.issue_id,
        uploadedBy: attachment.uploaded_by,
        s3Key: attachment.s3_key,
        fileName: attachment.file_name,
        contentType: attachment.content_type,
        sizeBytes: attachment.size_bytes,
        createdAt: attachment.created_at,
        url,
      }
    })
  )

  return c.json({
    attachments: attachmentsWithUrls
  })
})


export default attachments;

