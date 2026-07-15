"use client";
import { useParams } from "next/navigation";
import type { AuditLog } from "../types";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CommentList from "../components/CommentList";
import CheckSection from "../components/CheckSection";
import CommentForm from "../components/CommentForm";
import { useMe } from "@/app/hooks/useMe";
import { formatAction } from "@/app/lib/formatAction";
import { apiFetch } from "@/app/lib/api/client";
import { useIssueDetail } from "../hooks/useIssueDetail";
import AssigneeSection from "../components/AssigneeSection";
import LoadingButton from "@/app/components/LoadingButton";
import { useRequireAuth } from "@/app/hooks/useRequireAuth";
import AttachmentSection from "../components/AttachmentSection";

const IssueDetailPage = () => {
  const params = useParams<{ id: string }>();
  const issueId = params.id as string;
  const { me, isAdmin } = useMe();
  const { isCheckingAuth } = useRequireAuth();
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isShowAuditLogs, setIsShowAuditLogs] = useState<boolean>(false);

  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [isUpdatingAssignee, setIsUpdatingAssignee] = useState<boolean>(false);

  const [editAiText, setEditAiText] = useState<string>("");
  const [isEditAiLoading, setIsEditAiLoading] = useState<boolean>(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const res = await apiFetch(`/issues/${issueId}/audit-logs`);

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "監査ログの取得に失敗しました",
          type: "error",
        });
      }

      const formatLogs = data.logs.map((log: AuditLog) => {
        const action = formatAction(log.action);
        return { ...log, action };
      });

      setAuditLogs(formatLogs ?? []);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "監査ログの取得に失敗しました";
      setMessage({ text: message, type: "error" });
    }
  }, [isAdmin, issueId]);

  const {
    issue,
    isLoading,
    comments,
    commentInput,
    setCommentInput,
    commentSubmitting,
    checks,
    checkMessage,
    isChecking,
    isDeleting,
    isResolving,
    fetchIssue,
    fetchComments,
    handleCreateComment,
    handleCheckIssue,
    handleDeleteIssue,
    handleResolvedIssue,
  } = useIssueDetail({
    issueId,
    isAdmin,
    setMessage,
    onResolved: fetchAuditLogs,
  });

  const canUploadAttachment = me?.role === "admin" || me?.role === "member";
  const canResolveIssue = Boolean(issue && me && issue.assigned_to === me.id);

  useEffect(() => {
    if (!issueId) return;
    if (isAdmin) {
      fetchAuditLogs();
    }
  }, [fetchAuditLogs, isAdmin, issueId]);

  useEffect(() => {
    if (!issue) return;

    setEditTitle(issue.title);
    setEditDescription(issue.description);
    setEditDueDate(issue.due_date ?? "");
    setSelectedAssignee(issue.assigned_to ?? "");
  }, [issue]);

  const handleEditAiFormat = async () => {
    setIsEditAiLoading(true);
    setMessage(null);

    try {
      if (!editDescription.trim()) {
        setMessage({ text: "整形する文章を入力してください", type: "error" });
        return;
      }

      const res = await apiFetch("/ai/format-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: editDescription }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.message ?? "AI整形に失敗しました",
          type: "error",
        });
      }

      setEditAiText(data.text);
    } finally {
      setIsEditAiLoading(false);
    }
  };

  const handleUpdateIssue = async () => {
    setIsUpdating(true);

    try {
      const res = await apiFetch(`/issues/${issueId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          dueDate: editDueDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "更新に失敗しました",
          type: "error",
        });
        return;
      }

      setMessage({ text: "更新しました", type: "success" });
      setIsEditing(false);

      await fetchIssue();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "更新に失敗しました",
        type: "error",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateAssignee = async () => {
    if (!selectedAssignee) {
      setMessage({ text: "解決担当者を選択してください", type: "error" });
      return;
    }

    setIsUpdatingAssignee(true);

    try {
      const res = await apiFetch(`/issues/${issueId}/assignee`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignedTo: selectedAssignee }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "担当者の設定に失敗しました",
          type: "error",
        });
        return;
      }

      setMessage({
        text: `${data.assignedUser ?? "担当者"}を設定しました`,
        type: "success",
      });

      await fetchIssue();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "担当者の設定に失敗しました",
        type: "error",
      });
    } finally {
      setIsUpdatingAssignee(false);
    }
  };

  if (isCheckingAuth) {
    return <p>確認中...</p>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-medium text-blue-700">Issue 詳細</p>
            <h1 className="mt-1 text-3xl font-bold">Issue Detail</h1>
          </div>
          <Link
            href="/issues"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"
          >
            一覧へ戻る
          </Link>
        </div>

        {message && (
          <p
            className={`rounded-md border px-4 py-3 text-sm ${
              message.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {message.text}
          </p>
        )}

        {isLoading ? (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            読み込み中...
          </p>
        ) : !issue ? (
          <p className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Issueが見つかりません
          </p>
        ) : (
          <div className="flex flex-col gap-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {issue.title}
                </h2>
                <span
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                    issue.status === "resolved"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {issue.status}
                </span>
              </div>
              {canUploadAttachment ? (
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  {canResolveIssue && (
                    <LoadingButton
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                      onClick={handleResolvedIssue}
                      isLoading={isResolving}
                      loadingText={
                        issue.status === "open" ? "解決中..." : "更新中..."
                      }
                    >
                      {issue.status === "open" ? "解決" : "未解決に戻す"}
                    </LoadingButton>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"
                        onClick={() => setIsEditing(true)}
                      >
                        編集
                      </button>
                      <LoadingButton
                        className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:hidden"
                        onClick={handleDeleteIssue}
                        disabled={isEditing}
                        isLoading={isDeleting}
                        loadingText="削除中..."
                      >
                        削除
                      </LoadingButton>
                      <button
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"
                        onClick={() => setIsShowAuditLogs((prev) => !prev)}
                      >
                        {isShowAuditLogs ? "ログ非表示" : "ログ表示"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <span></span>
              )}
            </div>

            {isEditing ? (
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                <input
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <textarea
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  rows={8}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />

                <LoadingButton
                  className="w-fit rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleEditAiFormat}
                  isLoading={isEditAiLoading}
                  loadingText="整形中..."
                >
                  AIで整える
                </LoadingButton>

                {editAiText && (
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
                    <p className="text-sm font-medium text-blue-700">
                      AI整形案
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {editAiText}
                    </p>

                    <button
                      type="button"
                      className="mt-3 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      onClick={() => {
                        setEditDescription(editAiText);
                      }}
                    >
                      この文章を使う
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-4 w-full">
                  <label className="shrink-0 text-sm text-slate-500">期日</label>
                  <input
                    type="date"
                    style={{
                      colorScheme: "light",
                      WebkitTextFillColor: "#0f172a",
                      opacity: 1,
                    }}
                    className="block w-full min-w-0 max-w-full box-border rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 flex-1"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <LoadingButton
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleUpdateIssue}
                    isLoading={isUpdating}
                    loadingText="保存中..."
                  >
                    保存
                  </LoadingButton>

                  <button
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setIsEditing(false);
                      setEditAiText("");
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                {issue.description}
              </p>
            )}

            <div className="grid gap-3 rounded-md border border-slate-100 bg-white p-4 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
              <span>
                作成者: {issue.created_by_profile?.display_name ?? "不明"}さん
              </span>
              <span>期限: {issue.due_date ?? "-"}</span>
              <span>
                作成日: {new Date(issue.created_at).toLocaleString("ja-jp")}
              </span>
              <span>
                解決日時:{" "}
                {issue.resolved_at
                  ? new Date(issue.resolved_at).toLocaleString("ja-jp")
                  : "-"}
              </span>
            </div>

            <AttachmentSection 
              issueId={issueId}
              canUpload={canUploadAttachment}
              isAdmin={isAdmin}
              setMessage={setMessage}
              onChanged={fetchAuditLogs}
            />

            <CheckSection
              issueId={issueId}
              checks={checks ?? []}
              onCheck={handleCheckIssue}
              resultMessage={checkMessage ?? null}
              isChecking={isChecking}
            />
            {isAdmin && (
              <AssigneeSection
                currentAssigneeName={
                  issue.assigned_to_profile?.display_name ?? null
                }
                selectedAssignee={selectedAssignee}
                setSelectedAssignee={setSelectedAssignee}
                onAssignee={handleUpdateAssignee}
                checks={checks ?? []}
                isUpdatingAssignee={isUpdatingAssignee}
                isResolved={issue.status === "resolved"}
              />
            )}
            <CommentList
              comments={comments}
              setMessage={setMessage}
              fetchComments={fetchComments}
            />
            <CommentForm
              issueId={issueId}
              value={commentInput}
              onChange={(e) => setCommentInput(e)}
              onSubmitting={handleCreateComment}
              isSubmitting={commentSubmitting}
            />
          </div>
        )}
      </div>

      {isAdmin && isShowAuditLogs && (
        <div className="mx-auto mt-8 flex max-w-5xl flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">監査ログ</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {auditLogs.length}件
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              監査ログはありません
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                >
                  <div className="mb-2 text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString("ja-JP")}
                  </div>
                  <div>
                    実行者: {log.user_profile?.display_name ?? "不明"} (
                    {log.user_id ?? "unknown"})
                  </div>
                  <div>操作: {log.action}</div>
                  <div>対象: {log.target_type}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default IssueDetailPage;


