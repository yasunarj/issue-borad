"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { IssueListItem } from "../types";
import IssueCard from "../components/IssueCard";
import { apiFetch } from "@/app/lib/api/client";

const AssignedIssuesPage = () => {
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    type: "error" | "success";
  } | null>(null);

  const openIssues = issues.filter((issue) => issue.status === "open");
  const resolvedIssues = issues.filter((issue) => issue.status === "resolved");

  const fetchAssignedIssues = useCallback(async () => {
    try {
      const res = await apiFetch("/issues?scope=assigned");
      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "担当中のIssueの取得に失敗しました",
          type: "error",
        });
        return;
      }

      setIssues(data.issues ?? []);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "不明なエラーです";

      setMessage({
        text: errorMessage,
        type: "error",
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAssignedIssues();
  }, [fetchAssignedIssues]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 border-b border-slate-200 pb-5">
          <Link
            href="/issues"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            一覧に戻る
          </Link>

          <p className="mt-5 text-sm font-medium text-blue-700">担当Issue</p>

          <h1 className="mt-1 text-3xl font-bold">担当中Issue一覧</h1>

          <p className="mt-2 text-sm text-slate-600">
            あなたが担当者に設定されているIssueを表示しています。
          </p>
        </div>

        {message && (
          <p
            className={`mb-4 rounded-md border px-4 py-3 text-sm ${
              message.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">対応中</h2>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {openIssues.length}件
            </span>
          </div>

          {openIssues.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              現在担当している未解決Issueはありません
            </p>
          ) : (
            openIssues.map((issue) => (
              <div
                key={issue.id}
                className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
              >
                <IssueCard issue={issue} />
              </div>
            ))
          )}

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">解決済み</h2>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {resolvedIssues.length}件
            </span>
          </div>

          {resolvedIssues.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              担当した解決済みIssueはありません
            </p>
          ) : (
            resolvedIssues.map((issue) => (
              <div
                key={issue.id}
                className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
              >
                <IssueCard issue={issue} />
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
};

export default AssignedIssuesPage;
