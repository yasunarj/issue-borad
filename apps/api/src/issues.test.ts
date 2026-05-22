import { beforeEach, describe, it, expect, vi } from "vitest";
import { createAuditLog } from "./lib/auditLog.js";

type AppLike = {
  fetch: (request: Request) => Response | Promise<Response>
}

vi.mock("./middleware/auth", () => {
  return {
    authMiddleware: async (c: any, next: () => Promise<void>) => {
      const role = c.req.header("x-test-role");

      if (!role) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      c.set("user", {
        id: "user-1",
        email: "test@example.com",
      });

      c.set("role", role);

      await next();
    }
  }
})

vi.mock("./lib/auditLog", () => {
  return {
    createAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

const sendMailMock = vi.fn().mockRejectedValue(undefined);

vi.mock("./lib/sendMail", () => {
  return {
    sendMail: sendMailMock,
    sendNotifyMail: sendMailMock,
  }
})

const fromMock = vi.fn(); //まだ中身のない関数 mockImplementationで中身を追加する

vi.mock("./lib/supabase", () => {
  return {
    supabaseAdmin: {
      from: fromMock,
    }
  }
})

const responsesCreateMock = vi.fn();

vi.mock("openai", () => {
  class OpenAIMock {
    responses = {
      create: responsesCreateMock,
    };
  }

  return {
    default: OpenAIMock,
  }
})

const getUserByIdMock = vi.fn();

vi.mock("./lib/supabase", () => {
  return {
    supabaseAdmin: {
      from: fromMock,
      auth: {
        admin: {
          getUserById: getUserByIdMock,
        }
      }
    }
  }
})

const createUploadSignedUrlMock = vi.fn();
const createDownloadSignedUrlMock = vi.fn();
const deleteS3ObjectMock = vi.fn()
const getIssueAttachmentKeyMock = vi.fn();

vi.mock("./lib/s3", () => {
  return {
    createUploadSignedUrl: createUploadSignedUrlMock,
    createDownloadSignedUrl: createDownloadSignedUrlMock,
    deleteS3Object: deleteS3ObjectMock,
    getIssueAttachmentKey: getIssueAttachmentKeyMock,
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockReset();
  sendMailMock.mockResolvedValue(undefined);
  responsesCreateMock.mockReset();
  getUserByIdMock.mockReset();


  createUploadSignedUrlMock.mockReset();
  createDownloadSignedUrlMock.mockReset();
  deleteS3ObjectMock.mockReset();
  getIssueAttachmentKeyMock.mockReset();

  createUploadSignedUrlMock.mockResolvedValue("https://example.com/upload-url");
  createDownloadSignedUrlMock.mockResolvedValue("https://example.com/download-url");
  deleteS3ObjectMock.mockResolvedValue(undefined);
  getIssueAttachmentKeyMock.mockReturnValue("issues/issue-1/attachments/attachment-1-test.jpg");


  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.INTERNAL_API_SECRET = "test-internal-secret";
  process.env.APP_BASE_URL = "http://localhost:3000";
  //この環境変数はなぜbeforeEachに書いているのか？これを書くと環境変数もmock化してくれるのか？
});

const request = async (
  app: AppLike,
  path: string,
  init?: RequestInit
) => {
  const res = app.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers ?? {}
    }
  }))

  return res;
}

const mockTables = (tables: Record<string, unknown>) => {
  fromMock.mockImplementation((table: string) => {
    return (tables[table] ?? {}) as object;
  })
}

const buildIssueSelectFoundMock = () => ({
  select: () => ({
    eq: () => ({
      single: async () => ({
        data: {
          id: "issue-1",
          title: "Test title",
          due_date: "2026-04-10",
          description: "Test description",
          status: "open",
          created_by: "test-user",
        },
        error: null
      })
    })
  })
})

const buildIssueMaybeFoundMock = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: { id: "issue-1" },
        error: null,
      })
    })
  })
})

const buildIssueNotFoundMock = () => ({
  select: () => ({
    eq: () => ({
      single: async () => ({
        data: null,
        error: { message: "DB issue not found" }
      })
    })
  })
})

const buildIssueMaybeNotFoundMock = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: null,
        error: null,
      })
    })
  })
})

const buildIssueInsertMock = () => ({
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: {
          id: "issue-1",
          title: "Test title",
          description: "Test description",
          due_date: "2026-04-10",
          created_by: "test-user"
        }
      })
    })
  })
})

const buildIssueStatusFoundMock = (status: string) => ({
  select: () => ({
    eq: () => ({
      single: async () => ({
        data: {
          status: status,
        },
        error: null,
      })
    })
  })
})

const buildIssueStatusUpdateResolvedSuccessMock = () => ({
  ...buildIssueStatusFoundMock("open"),
  update: () => ({
    eq: () => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "issue-1",
            title: "Test Issue",
            status: "resolved",
          },
          error: null
        })
      })
    })
  })
})

const buildIssueStatusUpdateOpenSuccessMock = () => ({
  ...buildIssueStatusFoundMock("resolved"),
  update: () => ({
    eq: () => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "issue-1",
            title: "Test Issue",
            status: "open",
          },
          error: null
        })
      })
    })
  })
})

const buildIssueStatusUpdateFailedMock = () => ({
  ...buildIssueStatusFoundMock("open"),
  update: () => ({
    eq: () => ({
      select: () => ({
        single: async () => ({
          data: null,
          error: {
            message: "DB update failed",
          }
        })
      })
    })
  })
})

const buildProfileFoundMock = () => ({
  select: () => ({
    eq: () => ({
      single: async () => ({
        data: { display_name: "user-1" },
        error: null
      })
    })
  })
})

const buildCommentInsertMock = () => ({
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: {
          issue_id: "issue-1",
          user_id: "user-1",
          body: "Test comment",
        }
      })
    })
  })
})

const buildIssueDeleteSuccessMock = () => ({
  ...buildIssueSelectFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: null
    })
  })
})

const buildIssueDeleteFailedMock = () => ({
  ...buildIssueSelectFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: { message: "DB delete failed" },
    })
  })
})

const buildIssueUpdateSuccessMock = () => ({
  ...buildIssueSelectFoundMock(),
  update: () => ({
    eq: () => ({
      select: () => ({
        single: async () => ({
          data: {
            id: "issue-1",
            title: "Updated title",
            description: "Updated description",
            due_date: "2026-04-04",
          },
          error: null,
        })
      })
    })
  })
})

const buildIssueUpdateFailedMock = () => ({
  ...buildIssueSelectFoundMock(),
  update: () => ({
    eq: () => ({
      select: () => ({
        single: async () => ({
          data: null,
          error: { message: "DB update failed" }
        })
      })
    })
  })
})

const buildCommentsListMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: [{
          id: "comment-1",
          issue_id: "issue-1",
          body: "Test Comment",
        }],
        error: null
      })
    })
  })
})

const buildIssueCommentFoundMock = () => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            id: "comment-1",
            issue_id: "issue-1",
            body: "Test comment",
          },
          error: null,
        })
      })
    })
  })
})

const buildIssueCommentNotFoundMock = () => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        single: async () => ({
          data: null,
          error: { message: "comment not found" }
        })
      })
    })
  })
})

const buildIssueCommentDeleteSuccessMock = () => ({
  ...buildIssueCommentFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: null,
    })
  })
})

const buildIssueCommentDeleteFailedMock = () => ({
  ...buildIssueCommentFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: { message: "Failed to delete comment" }
    })
  })
})

const buildCommentsListFailedMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: null,
        error: { message: "DB comments not found" }
      })
    })
  })
})

const buildChecksListMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: [{
          id: "check-1",
          issue_id: "issue-1"
        }],
        error: null,
      })
    })
  })
})

const buildChecksListFailedMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: null,
        error: { message: "DB checks not found" }
      })
    })
  })
})

const buildExistingCheckNoneMock = () => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: null,
          error: null
        })
      })
    })
  })
})

const buildExistingCheckFoundMock = () => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: "check-1", issue_id: "issue-1" },
          error: null,
        })
      })
    })
  })
})

const buildCheckInsertSuccessMock = () => ({
  ...buildExistingCheckNoneMock(),
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: {
          id: "check-1",
          issue_id: "issue-1"
        },
        error: null
      })
    })
  })
})

const buildCheckInsertFailedMock = () => ({
  ...buildExistingCheckNoneMock(),
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: null,
        error: { message: "DB failed to create check" }
      })
    })
  })
})

const buildExistingCheckFailedMock = () => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: null,
          error: { message: "DB failed to check existing record" },
        })
      })
    })
  })
})

const buildReminderIssuesEmptyMock = () => ({
  select: () => ({
    eq: () => ({
      not: () => ({
        not: async () => ({
          data: [],
          error: null,
        })
      })
    })
  })
});

const buildReminderIssuesFailedMock = () => ({
  select: () => ({
    eq: () => ({
      not: () => ({
        not: async () => ({
          data: null,
          error: "DB reminder fetch filed",
        })
      })
    })
  })
})

const buildAttachmentInsertSuccessMock = () => ({
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: {
          id: "attachment-1",
          issue_id: "issue-1",
          uploaded_by: "user-1",
          s3_key: "issues/issue-1/attachments/attachment-1-test.jpg",
          file_name: "test.jpg",
          content_type: "image/jpeg",
          size_bytes: 123456,
          created_at: "2026-05-17T00:00:00.000Z",
        },
        error: null
      })
    })
  })
})

const buildAttachmentInsertFailedMock = () => ({
  insert: () => ({
    select: () => ({
      single: async () => ({
        data: null,
        error: { message: "DB insert failed" }
      })
    })
  })
})

const buildAttachmentsListMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: [
          {
            id: "attachment-1",
            issue_id: "issue-1",
            uploaded_by: "user-1",
            s3_key: "issues/issue-1/attachments/attachment-1-test.jpg",
            file_name: "test.jpg",
            content_type: "image/jpeg",
            size_bytes: 123456,
            created_at: "2026-05-17T00:00:00.000Z",
          }
        ],
        error: null
      })
    })
  })
})

const buildAttachmentsListFailedMock = () => ({
  select: () => ({
    eq: () => ({
      order: async () => ({
        data: null,
        error: { message: "DB fetch attachment failed" }
      })
    })
  })
})

const buildAttachmentFoundMock = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: {
          id: "attachment-1",
          issue_id: "issue-1",
          s3_key: "issues/issue-1/attachments/attachment-1-test.jpg",
          file_name: "test.jpg",
        },
        error: null,
      })
    })
  })
})

const buildAttachmentNotFoundMock = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: null,
        error: null,
      })
    })
  })
})

const buildAttachmentDifferentIssueMock = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: {
          id: "attachment-1",
          issue_id: "other-issue",
          s3_key: "issues/issue-1/attachments/attachment-1-test.jpg",
          file_name: "test.jpg",
        },
        error: null,
      })
    })
  })
})

const buildAttachmentDeleteSuccessMock = () => ({
  ...buildAttachmentFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: null
    })
  })
})

const buildAttachmentDeleteFailedMock = () => ({
  ...buildAttachmentFoundMock(),
  delete: () => ({
    eq: async () => ({
      error: { message: "attachment delete fetch failed" }
    })
  })
})

describe("app", () => {
  it("GET /health で ok: true を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await app.fetch(new Request("http://localhost/health"));

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("認証なしで /issues にアクセスすると401", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues")

    expect(res.status).toBe(401);
  });

  it("viewer は issue を作成できない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "x-test-role": "viewer"
      },
      body: JSON.stringify({
        title: "test",
        description: "test",
      })
    })
    expect(res.status).toBe(403);
  })

  it("空コメントは 400 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments", {
      method: "POST",
      headers: {
        "x-test-role": "member"
      },
      body: JSON.stringify({
        comment: "   ",
      })
    })

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toEqual({
      error: "comment is required",
    })
  });

  it("open → resolved にトグルされる", async () => {
    mockTables({
      issues: buildIssueStatusUpdateResolvedSuccessMock(),
      profiles: buildProfileFoundMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/resolve", {
      method: "PATCH",
      headers: {
        "x-test-role": "member"
      }
    })

    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.issue.status).toBe("resolved");

    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "issue.resolve"
    }));
  });

  it("resolved -> open にトグルされる", async () => {
    mockTables({
      issues: buildIssueStatusUpdateOpenSuccessMock(),
      profiles: buildProfileFoundMock(),
    })
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/resolve", {
      method: "PATCH",
      headers: {
        "x-test-role": "member"
      }
    })

    expect(res.status).toBe(200);

    const body = await res.json() as any;

    expect(body.issue.status).toBe("open");
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "issue.reopen"
    }));
  });

  it("issue が見つからない時 404 を返す", async () => {
    mockTables({ issues: buildIssueNotFoundMock() });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-999/resolve", {
      method: "PATCH",
      headers: {
        "x-test-role": "member"
      }
    })

    expect(res.status).toBe(404);

    const body = await res.json();

    expect(body).toEqual({
      error: "Issue not found",
    })
  });

  it("update に失敗すると 500 を返す", async () => {
    mockTables({
      issues: buildIssueStatusUpdateFailedMock(),
      profiles: buildProfileFoundMock(),
    })
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/resolve", {
      method: "PATCH",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(500);

    const body = await res.json();

    expect(body).toEqual({ error: "DB update failed" });

    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("viewer は issue を削除できない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "viewer",
      }
    })

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string }
    expect(body.error).toBe("Forbidden");

    expect(fromMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("admin は issue を削除できる", async () => {
    mockTables({
      issues: buildIssueDeleteSuccessMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    })

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body).toEqual({ message: "Issue deleted" });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "issue.delete",
    }))
  })

  it("delete に失敗すると 500 を返し auditLog が呼ばれない", async () => {
    mockTables({
      issues: buildIssueDeleteFailedMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin"
      }
    })

    expect(res.status).toBe(500);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to delete issue");

    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("delete対象の issue が見つからない時 404 を返し auditLog は呼ばれない", async () => {
    mockTables({ issues: buildIssueNotFoundMock() })
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    })

    expect(res.status).toBe(404);

    const body = await res.json() as { error: string }

    expect(body.error).toBe("Issue not found");
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("admin 以外は issue を削除できず 403 を返し auditLog は呼ばれない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(403);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");

    expect(fromMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("admin 以外は issue を更新できず 403 を返し auditLog は呼ばれない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-1", {
      method: "PATCH",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");

    expect(fromMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("admin は issue を更新できる", async () => {
    mockTables({
      issues: buildIssueUpdateSuccessMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "PATCH",
      headers: {
        "x-test-role": "admin"
      },
      body: JSON.stringify({
        title: "Updated title",
        description: "Updated description",
        dueDate: "2026-04-04",
      })
    })

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.message).toBe("Issue updated");
    expect(body.issue.title).toBe("Updated title");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.update"
      })
    );
  })

  it("update対象の issue が見つからない時 404 を返し auditLog は呼ばれない", async () => {
    mockTables({ issues: buildIssueNotFoundMock() });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "PATCH",
      headers: {
        "x-test-role": "admin"
      },
      body: JSON.stringify({
        title: "Updated title",
        description: "Updated description",
        dueDate: "2026-04-05",
      })
    })

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("updateに失敗すると 500 を返し auditLog は呼ばれない", async () => {
    mockTables({
      issues: buildIssueUpdateFailedMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1", {
      method: "PATCH",
      headers: {
        "x-test-role": "admin"
      },
      body: JSON.stringify({
        title: "Updated title",
        description: "Updated description",
        dueDate: "2026-04-05",
      })
    })

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to update issue");
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("member は Issue を作成できる", async () => {
    mockTables({
      profiles: buildProfileFoundMock(),
      issues: buildIssueInsertMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        title: "Test title",
        description: "Test description",
        dueDate: "2026-04-10",
      })
    })

    expect(res.status).toBe(201);
    const body = await res.json() as any;

    expect(body.message).toBe("Issue created");
    expect(body.issue.title).toBe("Test title");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.create"
      })
    )
    expect(sendMailMock).toHaveBeenCalled();
  })

  it("admin は Issue を作成できる", async () => {
    mockTables({
      profiles: buildProfileFoundMock(),
      issues: buildIssueInsertMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "admin",
      },
      body: JSON.stringify({
        title: "Admin title",
        description: "Admin description",
        dueDate: "",
      })
    })

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.message).toBe("Issue created");
    expect(body.issue.title).toBe("Test title");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.create" })
    );
    expect(sendMailMock).toHaveBeenCalled();
  })

  it("title が空だと 400 を返し auditLog は呼ばれない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "x-test-role": "admin",
      },
      body: JSON.stringify({
        title: "  ",
        description: "Admin description",
        dueDate: "2026-04-10",
      })
    })

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("title is required");
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("issue 作成に失敗すると 500 を返し auditLog は呼ばれない", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { display_name: "user-3" },
                error: null,
              })
            })
          })
        }
      }

      if (table === "issues") {
        return {
          insert: () => ({
            select: () => ({
              single: () => ({
                data: null,
                error: { message: "DB insert failed" }
              })
            })
          })
        }
      }
      return {}
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "x-test-role": "admin",
      },
      body: JSON.stringify({
        title: "test-title",
        description: "test-description",
        dueDate: "2026-04-05",
      })
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("DB insert failed");
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("sendMail が失敗しても issueは作成され 201 を返し auditLog も呼ばれる", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("mail failed"));

    mockTables({
      profiles: buildProfileFoundMock(),
      issues: buildIssueInsertMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues", {
      method: "POST",
      headers: {
        "x-test-role": "admin",
      },
      body: JSON.stringify({
        title: "test-title",
        description: "test-description",
        dueDate: ""
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.message).toBe("Issue created");
    expect(body.issue.description).toBe("Test description");

    expect(createAuditLog).toHaveBeenCalled();
  })

  it("member はコメントを作成できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_comments: buildCommentInsertMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({ comment: "Test comment" })
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.message).toBe("comment created");
    expect(body.comment.body).toBe("Test comment");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment.create" })
    )
  })

  it("viewer はコメントを作成できない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-2/comments", {
      method: "POST",
      headers: {
        "x-test-role": "viewer",
      },
      body: JSON.stringify("Test comment2")
    })

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");

    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("issue が存在しない場合コメント作成は 404", async () => {
    mockTables({ issues: buildIssueNotFoundMock() })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-3/comments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({ comment: "Test comment" })
    })

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");

    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("コメント作成に失敗すると 500", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "issue-4" },
                error: null
              })
            })
          })
        }
      }
      if (table === "issue_comments") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: "DB insert comment failed"
              })
            })
          })
        }
      }
      return {}
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-4/comments", {
      method: "POST",
      headers: {
        "x-test-role": "admin",
      },
      body: JSON.stringify({ comment: "Test comment" })
    })

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to create comment");

    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it("member は comment を取得できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_comments: buildCommentsListMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe("Test Comment")
  })

  it("comments 取得時に issue が見つからないと 404 を返す", async () => {
    mockTables({ issues: buildIssueNotFoundMock() });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string }
    expect(body.error).toBe("Issue not found");
  })

  it("comments 取得失敗時に 500 を返す", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_comments: buildCommentsListFailedMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to fetch comments");
  })

  it("viewer も comments 取得できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_comments: buildCommentsListMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-1/comments", {
      method: "GET",
      headers: {
        "x-test-role": "viewer",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.ok).toBe(true);
    expect(body.comments[0].body).toBe("Test Comment");
  })

  it("admin 以外は comment を削除できず 403 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments/comment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "member"
      }
    })

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");
    expect(fromMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("admin は comment を削除できる", async () => {
    mockTables({
      issue_comments: buildIssueCommentDeleteSuccessMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/comments/comment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.message).toBe("Comment deleted");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "comment.delete"
      })
    );
  })

  it("comment が見つからない場合 404 を返し auditLog は呼ばれない", async () => {
    mockTables({
      issue_comments: buildIssueCommentNotFoundMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-4/comments/comment-4", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin"
      }
    })

    expect(res.status).toBe(404)
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Comment not found");
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("comment の削除に失敗すると 500 を返し auditLog は呼ばれない", async () => {
    mockTables({
      issue_comments: buildIssueCommentDeleteFailedMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-2/comments/comment-2", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    })

    expect(res.status).toBe(500)
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to delete comment");

    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("member は checks を取得できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildChecksListMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/checks", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.checks[0].id).toBe("check-1");
  });

  it("viewer も checks を取得できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildChecksListMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-1/checks", {
      method: "GET",
      headers: {
        "x-test-role": "viewer",
      }
    })

    expect(res.status).toBe(200);
    const body = await res.json() as any
    expect(body.ok).toBe(true);
    expect(body.checks[0].id).toBe("check-1")
  });

  it("checks取得時に issue が見つからないと 404 を返す", async () => {
    mockTables({ issues: buildIssueNotFoundMock() })

    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-1/checks", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");
  });

  it("checks の取得に失敗すると 500 を返す", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildChecksListFailedMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/checks", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to fetch checks");
  });

  it("member は issue を check できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildCheckInsertSuccessMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any
    expect(body.message).toBe("Issue checked");
    expect(body.alreadyChecked).toBe(false);
    expect(body.check.id).toBe("check-1");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.check" })
    )
  });

  it("viewer も issue を check できる", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildCheckInsertSuccessMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "viewer",
      }
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any
    expect(body.message).toBe("Issue checked");
    expect(body.alreadyChecked).toBe(false);
    expect(body.check.id).toBe("check-1");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.check" })
    )
  });

  it("check対象の issue が見つからないと 404 を返す", async () => {
    mockTables({ issues: buildIssueNotFoundMock() });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("existing check の確認に失敗すると 500 を返し auditLog は呼ばれない", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildExistingCheckFailedMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to check existing record");

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("すでに check 済みなら Already checked を返し insert と auditLog は呼ばれない", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildExistingCheckFoundMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();
    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.message).toBe("Already checked");
    expect(body.alreadyChecked).toBe(true);

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("check の作成に失敗すると 500 を返し auditLog は呼ばれない", async () => {
    mockTables({
      issues: buildIssueSelectFoundMock(),
      issue_checks: buildCheckInsertFailedMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/check", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      }
    })

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to create check");
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("OPENAI_API_KEY が無いと 500 を返す", async () => {
    delete process.env.OPENAI_API_KEY;

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/ai/format-text", {
      method: "POST",
      body: JSON.stringify({ text: "テスト" })
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean, message: string };
    expect(body).toEqual({
      ok: false,
      message: "OPENAI_API_KEY is not set"
    })

  })

  it("POST /ai/format-text は文章を整形して返す", async () => {
    responsesCreateMock.mockResolvedValue({
      output_text: "整形された文章",
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/ai/format-text", {
      method: "POST",
      body: JSON.stringify({ text: "テスト文章" }),
    });

    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean, text: string };

    expect(body).toEqual({
      ok: true,
      text: "整形された文章"
    })

    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        //objectContainingは最低限指定した内容が入っていれば良いという意味
        model: "gpt-4.1-mini",
        input: expect.stringContaining("テスト文章")
        //stringContainingも一緒で全文一致ではなく、指定した文章が入っていればOKという意味
      })
    )
  })

  it("text が空の場合には 400 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/ai/format-text", {
      method: "POST",
      body: JSON.stringify({ text: "" })
    })

    expect(res.status).toBe(400);

    const body = await res.json() as { ok: boolean, message: string };

    expect(body).toEqual({
      ok: false,
      message: "text is required",
    })

    expect(responsesCreateMock).not.toHaveBeenCalled();
  })

  it("OPENAI 呼び出しに失敗すると 500 を返す", async () => {
    responsesCreateMock.mockRejectedValue(new Error("OPENAI failed"));
    // mockResolvedValue は成功したPromiseを返す場合に使用する
    // mockRejectedValue は失敗したPromiseを返す場合に使用する
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/ai/format-text", {
      method: "POST",
      body: JSON.stringify({ text: "テスト文章" }),
    })

    expect(res.status).toBe(500);

    const body = await res.json() as { ok: boolean, message: string };

    expect(body).toEqual({
      ok: false,
      message: "AI formatting failed",
    });
  });

  it("GET ai/test は応援メッセージを返す", async () => {
    responsesCreateMock.mockResolvedValue({
      output_text: "応援メッセージ",
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/ai/test", {
      method: "GET",
    })

    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean, text: string };

    expect(body).toEqual({
      ok: true,
      text: "応援メッセージ",
    });

    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
  });

  it("認証なしで /reminders/run にアクセスすると 401 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/internal/reminders/run");

    expect(res.status).toBe(401);

    const body = await res.json() as { error: string };

    expect(body).toEqual({
      error: "Unauthorized"
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("reminder対象の issue がないと 200 であり,空の配列を返す", async () => {
    mockTables({
      issues: buildReminderIssuesEmptyMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/internal/reminders/run", {
      method: "GET",
      headers: {
        "x-internal-secret": "test-internal-secret",
      }
    });

    expect(res.status).toBe(200);

    const body = await res.json() as { message: string, targets: unknown[] };

    expect(body).toEqual({
      message: "No reminder targets",
      targets: [],
    })

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  })

  it("reminder対象の issue の取得に失敗すると 500 を返す", async () => {
    mockTables({
      issues: buildReminderIssuesFailedMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/internal/reminders/run", {
      method: "GET",
      headers: {
        "x-internal-secret": "test-internal-secret"
      }
    })

    expect(res.status).toBe(500);

    const body = await res.json() as { error: string };

    expect(body).toEqual({
      error: "Failed to fetch reminder targets",
    })

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("期日３日前の reminder があるとメールを送信して sentCount を返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-04-07T00:00:00+09:00");

    const updateEqMock = getUserByIdMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                not: async () => ({
                  data: [
                    {
                      id: "issue-1",
                      title: "Test Issue",
                      status: "open",
                      due_date: "2026-04-10",
                      assigned_to: "user-1",
                      reminder_3days_sent_at: null,
                      reminder_due_sent_at: null,
                      assigned_to_profile: {
                        id: "user-1",
                        display_name: "担当者A",
                      }
                    }
                  ],
                  error: null
                })
              })
            })
          }),
          update: () => ({
            eq: updateEqMock,
          })
        }
      }
      return {}
    })

    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          email: "test@example.com"
        }
      }
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/internal/reminders/run", {
      method: "GET",
      headers: {
        "x-internal-secret": "test-internal-secret",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      message: string,
      sentCount: number,
      skippedCount: number,
      targets: Array<{ shouldSend3Days: boolean, shouldSendDue: boolean }>
    }

    expect(body.message).toBe("Reminder check completed");
    expect(body.sentCount).toBe(1);
    expect(body.skippedCount).toBe(0);
    expect(body.targets).toHaveLength(1);
    expect(body.targets[0].shouldSend3Days).toBe(true);
    expect(body.targets[0].shouldSendDue).toBe(false);

    expect(getUserByIdMock).toHaveBeenCalledWith("user-1");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: "[Issue Board] 期限3日前: Test Issue"
      })
    )

    expect(updateEqMock).toHaveBeenCalledWith("id", "issue-1")

    vi.useRealTimers();
  })

  it("メール送信に失敗すると skippedCount が増え update は走らない", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00+09:00"));

    sendMailMock.mockRejectedValueOnce(new Error("mail failed"));

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                not: async () => ({
                  data: [
                    {
                      id: "issue-1",
                      title: "Test Issue",
                      status: "open",
                      due_date: "2026-04-10",
                      assigned_to: "user-1",
                      reminder_3days_sent_at: null,
                      reminder_due_sent_at: null,
                      assigned_to_profile:
                        [
                          {
                            id: "user-1",
                            display_name: "担当者A",
                          }
                        ]
                    }
                  ],
                  error: null
                })
              })
            })
          }),
          update: () => ({
            eq: updateEqMock,
          })
        }
      }
      return {}
    })

    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          email: "test@example.com"
        }
      }
    })

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/internal/reminders/run", {
      method: "GET",
      headers: {
        "x-internal-secret": "test-internal-secret",
      }
    });

    expect(res.status).toBe(200);

    const body = await res.json() as {
      message: string,
      sentCount: number,
      skippedCount: number,
      targets: Array<{ shouldSend3Days: boolean, shouldSendDue: boolean }>
    }

    expect(body.message).toBe("Reminder check completed");
    expect(body.sentCount).toBe(0);
    expect(body.skippedCount).toBe(1);
    expect(body.targets).toHaveLength(1);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(updateEqMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("member は attachment upload-url を取得できる", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock()
    });

    const { createApp } = await import("./app.js");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/upload-url", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    });

    expect(res.status).toBe(200);

    const body = await res.json() as any;

    expect(body.uploadUrl).toBe("https://example.com/upload-url");
    expect(body.s3Key).toBe("issues/issue-1/attachments/attachment-1-test.jpg");
    expect(body.fileName).toBe("test.jpg");
    expect(body.contentType).toBe("image/jpeg")
    expect(body.sizeBytes).toBe(123456);
    expect(body.uploadedBy).toBe("user-1");

    expect(createUploadSignedUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "issues/issue-1/attachments/attachment-1-test.jpg",
        contentType: "image/jpeg",
      })
    )

    expect(getIssueAttachmentKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        fileName: "test.jpg",
      })
    )
  })

  it("viewer は attachment upload-url が発行されない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/upload-url", {
      method: "POST",
      headers: {
        "x-test-role": "viewer"
      },
      body: JSON.stringify({
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    })

    expect(res.status).toBe(403);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");
    expect(fromMock).not.toHaveBeenCalled();
    expect(createUploadSignedUrlMock).not.toHaveBeenCalled();
  })

  it("attachment upload-url の body が不正の場合 400 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/upload-url", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        fileName: "",
        contentType: "image/jpeg",
        sizeBytes: -1
      })
    })

    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };

    expect(body.error).toBe("Invalid request body");

    expect(fromMock).not.toHaveBeenCalled();
    expect(createUploadSignedUrlMock).not.toHaveBeenCalled();
  })

  it("attachment upload-url で issue が見つからない場合 404 を返す", async () => {
    mockTables({
      issues: buildIssueMaybeNotFoundMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-999/attachments/upload-url", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456
      })
    })

    expect(res.status).toBe(404);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");

    expect(createUploadSignedUrlMock).not.toHaveBeenCalled();
  })

  it("member は S3 にアップロード済み attachment を DB に登録できる", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock(),
      issue_attachments: buildAttachmentInsertSuccessMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        attachmentId: "550e8400-e29b-41d4-a716-446655440000",
        s3Key: "issues/issue-1/attachments/550e8400-e29b-41d4-a716-446655440000-test.jpg",
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    })

    expect(res.status).toBe(200);

    const body = await res.json() as any;

    expect(body.attachment).toEqual({
      id: "attachment-1",
      issue_id: "issue-1",
      uploaded_by: "user-1",
      s3_key: "issues/issue-1/attachments/attachment-1-test.jpg",
      file_name: "test.jpg",
      content_type: "image/jpeg",
      size_bytes: 123456,
      created_at: "2026-05-17T00:00:00.000Z"
    })
  });

  it("viewer は DB に attachment を登録できない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "POST",
      headers: {
        "x-test-role": "viewer"
      },
      body: JSON.stringify({
        attachmentId: "550e8400-e29b-41d4-a716-446655440000",
        s3Key: "issues/issue-1/attachments/550e8400-e29b-41d4-a716-446655440000-test.jpg",
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    });

    expect(res.status).toBe(403);

    const body = await res.json() as { error: string };

    expect(body.error).toBe("Forbidden");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("attachment 登録 body が不正なら 400 を返す", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        attachmentId: "1",
        s3Key: "issues-1",
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: -1,
      })
    })

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid request body");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("attachment 登録時に issue が見つからないと 404 を返す", async () => {
    mockTables({
      issues: buildIssueMaybeNotFoundMock()
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-999/attachments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        attachmentId: "550e8400-e29b-41d4-a716-446655440000",
        s3Key: "issues/issue-999/attachments/550e8400-e29b-41d4-a716-446655440000-test.jpg",
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    })

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");
  });

  it("attachment 登録に失敗すると 500 を返す", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock(),
      issue_attachments: buildAttachmentInsertFailedMock()
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "POST",
      headers: {
        "x-test-role": "member",
      },
      body: JSON.stringify({
        attachmentId: "550e8400-e29b-41d4-a716-446655440000",
        s3Key: "issues/issue-1/attachments/550e8400-e29b-41d4-a716-446655440000-test.jpg",
        fileName: "test.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123456,
      })
    })

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to create attachment");
  });

  it("member は attachment 一覧を取得できる", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock(),
      issue_attachments: buildAttachmentsListMock()
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.attachments).toHaveLength(1);

    expect(body.attachments[0]).toEqual({
      id: "attachment-1",
      issueId: "issue-1",
      uploadedBy: "user-1",
      s3Key: "issues/issue-1/attachments/attachment-1-test.jpg",
      fileName: "test.jpg",
      contentType: "image/jpeg",
      sizeBytes: 123456,
      createdAt: "2026-05-17T00:00:00.000Z",
      url: "https://example.com/download-url"
    })
  })

  it("viewer も attachment 一覧を取得できる", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock(),
      issue_attachments: buildAttachmentsListMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "GET",
      headers: {
        "x-test-role": "viewer",
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].url).toBe("https://example.com/download-url")
  });

  it("attachment 一覧取得時に issue が無い場合 404 を返す", async () => {
    mockTables({
      issues: buildIssueMaybeNotFoundMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-999/attachments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Issue not found");

    expect(createDownloadSignedUrlMock).not.toHaveBeenCalled();
  });

  it("attachment 一覧取得に失敗すると 500 を返す", async () => {
    mockTables({
      issues: buildIssueMaybeFoundMock(),
      issue_attachments: buildAttachmentsListFailedMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments", {
      method: "GET",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to fetch attachments");
    expect(createDownloadSignedUrlMock).not.toHaveBeenCalled()
  });

  it("admin は attachment を削除できる", async () => {
    mockTables({
      issue_attachments: buildAttachmentDeleteSuccessMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/attachment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    })

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body).toEqual({ ok: true });
    expect(deleteS3ObjectMock).toHaveBeenCalledWith({
      key: "issues/issue-1/attachments/attachment-1-test.jpg",
    });

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue_attachment.delete",
        targetType: "issue_attachment",
        targetId: "attachment-1",
        issueId: "issue-1",
      })
    )
  })

  it("member は attachment を削除できない", async () => {
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/attachment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "member",
      }
    });

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");
    expect(deleteS3ObjectMock).not.toHaveBeenCalled();
  })

  it("attachment が見つからない時に 404 を返す", async () => {
    mockTables({
      issue_attachments: buildAttachmentNotFoundMock(),
    });

    const { createApp } = await import("./app")
    const app = createApp();

    const res = await request(app, "/issues/issues-1/attachments/attachment-999", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Attachment not found");

    expect(deleteS3ObjectMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("attachment が 別の issue に紐づいている場合に 404 を返す", async () => {
    mockTables({
      issue_attachments: buildAttachmentDifferentIssueMock(),
    });

    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/attachment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin"
      }
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Attachment not found in this issue");

    expect(deleteS3ObjectMock).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  })

  it("S3 attachment の削除に失敗すると 500 を返し createAuditLog は呼ばれない", async () => {
    deleteS3ObjectMock.mockRejectedValueOnce(new Error("S3 delete failed"));

    mockTables({
      issue_attachments: buildAttachmentDeleteSuccessMock()
    });

    const { createApp } = await import("./app")
    const app = createApp();

    const res = await request(app, "/issues/issue-1/attachments/attachment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin",
      }
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to delete S3 object")

    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("DB で削除に失敗した場合 500 を返し createAuditLog は呼ばれない", async () => {
    mockTables({
      issue_attachments: buildAttachmentDeleteFailedMock(),
    })

    const { createApp } = await import("./app");
    const app = createApp();
    
    const res = await request(app, "/issues/issue-1/attachments/attachment-1", {
      method: "DELETE",
      headers: {
        "x-test-role": "admin"
      }
    });

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Failed to delete attachment");

    expect(deleteS3ObjectMock).toHaveBeenCalledWith({
      key: "issues/issue-1/attachments/attachment-1-test.jpg"
    })

    expect(createAuditLog).not.toHaveBeenCalled();
  })
})
