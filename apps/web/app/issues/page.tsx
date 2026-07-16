"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { IssueListItem } from "./types";
import { useMe } from "../hooks/useMe";
import IssueCard from "./components/IssueCard";
import IssueForm from "./components/IssueForm";
import Link from "next/link";
import { apiFetch } from "../lib/api/client";
import { supabase } from "@/lib/supabase/client";

const IssuesPage = () => {
  const { isAdmin } = useMe();
  const router = useRouter();
  const [issues, setIssues] = useState<IssueListItem[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    type: "error" | "success";
  } | null>(null);

  const openIssues = issues.filter((issue) => issue.status === "open");
  const resolvedIssues = issues.filter((issue) => issue.status === "resolved");

  const fetchIssues = useCallback(async () => {
    try {
      const res = await apiFetch("/issues");
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error ?? "取得に失敗しました", type: "error" });
        return;
      }

      const fetchedIssues = data.issues ?? [];

      const sortedIssues = [...fetchedIssues].sort((a, b) => {
        //[...]スプレット構文を使用している理由はsortは元のstateまで変えてしまうのでコピーして使用するのが良い
        if (a.status !== b.status) {
          return a.status === "open" ? -1 : 1;
        }

        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      setIssues(sortedIssues);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラーです";
      setMessage({ text: message, type: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchIssues();
  }, [fetchIssues]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-medium text-blue-700">Issue 管理</p>
            <h1 className="mt-1 text-3xl font-bold">Issue Board</h1>
          </div>
          <div className="flex flex-col gap-4">
            <button
              className="text-sm font-medium text-blue-700"
              onClick={handleLogout}
            >
              ログアウト
            </button>

            <Link
              href="/issues/assigned"
              className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-100"
            >
              担当中のIssue
            </Link>

            {isAdmin && (
              <Link
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"
                href="/admin/audit-logs"
              >
                監査ログ
              </Link>
            )}
          </div>
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

        <IssueForm onCreatedIssue={fetchIssues} setMessage={setMessage} />

        <div className="flex flex-col gap-5">
          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">未解決</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {openIssues.length}件
            </span>
          </div>
          {openIssues.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              未解決のIssueはありません
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
              解決済みのIssueはありません
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

export default IssuesPage;
