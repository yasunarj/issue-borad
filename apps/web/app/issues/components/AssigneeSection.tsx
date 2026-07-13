"use client";

import { useState } from "react";
import { IssueCheck } from "../types";
import LoadingButton from "@/app/components/LoadingButton";

type AssigneeSectionProps = {
  currentAssigneeName: string | null;
  selectedAssignee: string;
  setSelectedAssignee: (value: string) => void;
  onAssignee: () => Promise<void>;
  checks: IssueCheck[];
  isUpdatingAssignee: boolean;
};

const AssigneeSection = ({
  currentAssigneeName,
  selectedAssignee,
  setSelectedAssignee,
  onAssignee,
  checks,
  isUpdatingAssignee,
}: AssigneeSectionProps) => {
  const [isEditingAssignee, setIsEditingAssignee] = useState<boolean>(false);

  const hasAssignee = Boolean(currentAssigneeName);
  const shouldShowSelect = !hasAssignee || isEditingAssignee;

  const handleSubmitAssignee = async () => {
    await onAssignee();
    setIsEditingAssignee(false);
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex gap-3 items-center">
            <h3 className="text-sm font-semibold text-slate-900">解決担当者</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                hasAssignee
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {hasAssignee ? "設定済" : "未設定"}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            「みました」を押したユーザーから解決担当者を選択できます。
          </p>
        </div>
      </div>

      {hasAssignee && !isEditingAssignee && (
        <div className="rounded-lg border border-blue-100 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">現在の担当者</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {currentAssigneeName}
          </p>

          <div className="mt-4 flex">
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setIsEditingAssignee(true)}
              disabled={isUpdatingAssignee || checks.length === 0}
            >
              担当者を変更
            </button>
          </div>
        </div>
      )}

      {shouldShowSelect && (
        <div className="flex flex-col gap-3">
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            disabled={isUpdatingAssignee || checks.length === 0}
          >
            <option value="">
              {checks.length === 0
                ? "確認をしたユーザーがいません"
                : "選択してください"}
            </option>
            {checks.map((check) => (
              <option key={check.id} value={check.user_id}>
                {check.user_profile?.display_name ?? "不明"}
              </option>
            ))}
          </select>

          <div className="flex justify-start gap-2">
            {hasAssignee && isEditingAssignee && (
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setIsEditingAssignee(false)}
                disabled={isUpdatingAssignee}
              >
                キャンセル
              </button>
            )}

            <LoadingButton
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              onClick={handleSubmitAssignee}
              disabled={!selectedAssignee}
              isLoading={isUpdatingAssignee}
              loadingText="更新中..."
            >
              {hasAssignee ? "変更を保存" : "担当者を決定"}
            </LoadingButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssigneeSection;
