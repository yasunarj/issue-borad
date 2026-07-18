"use client";

import { apiFetch } from "@/app/lib/api/client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { IssueCheck, IssueComment, IssueDetail } from "../types";

type MessageState = {
  text: string;
  type: "success" | "error";
} | null;

type UseIssueDetailArgs = {
  issueId: string;
  isAdmin: boolean;
  setMessage: React.Dispatch<React.SetStateAction<MessageState>>;
  onResolved?: () => Promise<void> | void;
};

const useIssueDetail = ({
  issueId,
  isAdmin,
  setMessage,
  onResolved,
}: UseIssueDetailArgs) => {
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentInput, setCommentInput] = useState<string>("");
  const [commentSubmitting, setCommentSubmitting] = useState<boolean>(false);
  const [checks, setChecks] = useState<IssueCheck[]>([]);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  const fetchIssue = useCallback(async () => {
    try {
      const res = await apiFetch(`/issues/${issueId}`);
      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "Issueの取得に失敗しました",
          type: "error",
        });
        return;
      }

      setIssue(data.issue ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setMessage({ text: message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [issueId, setMessage]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiFetch(`/issues/${issueId}/comments`);
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: "コメントの取得に失敗しました", type: "error" });
        return;
      }

      setComments(data.comments ?? []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setMessage({ text: message, type: "error" });
    }
  }, [issueId, setMessage]);

  const fetchChecks = useCallback(async () => {
    try {
      const res = await apiFetch(`/issues/${issueId}/checks`);
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: "確認状況の取得に失敗しました", type: "error" });
        return;
      }

      setChecks(data.checks ?? []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setMessage({ text: message, type: "error" });
    }
  }, [issueId, setMessage]);

  useEffect(() => {
    if (!issueId) return;

    fetchIssue();
    fetchComments();
    fetchChecks();
  }, [fetchChecks, fetchComments, fetchIssue, issueId]);

  const handleCreateComment = useCallback(async () => {
    const comment = commentInput.trim();
    if (!comment) {
      setMessage({ text: "コメントを入力してください", type: "error" });
      return;
    }

    setCommentSubmitting(true);

    try {
      const res = await apiFetch(`/issues/${issueId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "コメントの投稿に失敗しました",
          type: "error",
        });
        return;
      }

      setCommentInput("");
      setMessage({ text: "コメントを投稿しました", type: "success" });
      await fetchComments();
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setMessage({ text: message, type: "error" });
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentInput, fetchComments, issueId, setMessage]);

  const handleCheckIssue = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await apiFetch(`/issues/${issueId}/check`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "確認登録に失敗しました",
          type: "error",
        });
        return;
      }

      await fetchChecks();
      setCheckMessage(data.alreadyChecked ? "既に確認済です" : "確認しました");
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setMessage({ text: message, type: "error" });
    } finally {
      setIsChecking(false);
    }
  }, [fetchChecks, issueId, setMessage]);

  const handleDeleteIssue = useCallback(async () => {
    if (!confirm("本当に削除してよろしいですか？")) return;

    setIsDeleting(true);
    try {
      const res = await apiFetch(`/issues/${issueId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "削除に失敗しました",
          type: "error",
        });
        return;
      }

      router.push("/issues");
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "削除中にエラーが発生しまいした",
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [issueId, router, setMessage]);

  const handleResolvedIssue = useCallback(async (resolution?: string) => {
    setIsResolving(true);

    try {
      const res = await apiFetch(`/issues/${issueId}/resolve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resolution,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "ステータスの更新に失敗しました",
          type: "error",
        });
        return;
      }

      setMessage({
        text:
          data.issue.status === "resolved"
            ? "Issueを解決しました"
            : "Issueを未解決に戻しました",
        type: "success",
      });

      await fetchIssue();

      if (isAdmin) {
        await onResolved?.();
      }
    } catch (e) {
      setMessage({
        text:
          e instanceof Error ? e.message : "ステータスを更新できませんでした",
        type: "error",
      });
    } finally {
      setIsResolving(false);
    }
  }, [fetchIssue, isAdmin, issueId, onResolved, setMessage]);

  return {
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
  };
};

export { useIssueDetail };
