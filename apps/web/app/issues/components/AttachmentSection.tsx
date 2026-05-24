"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/app/lib/api/client";
import LoadingButton from "@/app/components/LoadingButton";

type Attachment = {
  id: string;
  issueId: string;
  uploadedBy: string;
  s3Key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

type MessageSetter = (
  message: {
    text: string;
    type: "success" | "error";
  } | null,
) => void;

type AttachmentSectionProps = {
  issueId: string;
  canUpload: boolean;
  isAdmin: boolean;
  setMessage: MessageSetter;
  onChanged?: () => Promise<void> | void;
};

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxSizeBytes = 5 * 1024 * 1024;

const AttachmentSection = ({
  issueId,
  canUpload,
  isAdmin,
  setMessage,
  onChanged,
}: AttachmentSectionProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoadingAttachment, setIsLoadingAttachment] =
    useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);

  const fetchAttachments = useCallback(async () => {
    setIsLoadingAttachment(true);
    try {
      const res = await apiFetch(`/issues/${issueId}/attachment`);
      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.error ?? "添付画像の取得に失敗しました",
          type: "error",
        });
        return;
      }

      setAttachments(attachments ?? []);
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "添付画像の取得に失敗しました",
        // e instanceof Errorの意味を知りたい。これはeがErrorでない時もあるということ？
        type: "error",
      });
    } finally {
      setIsLoadingAttachment(false);
    }
  }, [issueId, attachments, setMessage]);

  useEffect(() => {
    if (issueId) return;
    fetchAttachments(); //await は必要ないのか？ handleUploadやhandleDeleteではawaitが使用されているが、、、
  }, [issueId, fetchAttachments]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({
        text: "画像を選択してください",
        type: "error",
      });
      return;
    }

    if (allowedTypes.includes(selectedFile.type)) {
      setMessage({
        text: "アップロードできる画像は jpeg ping webp のみです",
        type: "error",
      });
      return;
    }

    if (selectedFile.size > maxSizeBytes) {
      setMessage({
        text: "画像サイズは5MB以下にしてください",
        type: "error",
      });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const uploadUrlRes = await apiFetch(
        `/issues/${issueId}/attachments/upload-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType: selectedFile.type,
            sizeBytes: selectedFile.size,
          }),
        },
      );

      const uploadUrlData = await uploadUrlRes.json();

      if (!uploadUrlRes.ok) {
        setMessage({
          text: uploadUrlData.error ?? "アップロードURLの取得に失敗しました",
          type: "error",
        });
        return;
      }

      const s3Res = await apiFetch(uploadUrlData.uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": selectedFile.type, //これはどんな形式？？そもそもselectedFileの中身はどんなかんじなの？？
        },
        body: selectedFile, //JSON形式でなくてOKなのか？
      });

      //ここの部分はaws側のapiなのでどのようになっているかわからないが、成功した場合にはどのような結果が返ってくるのか？

      if (!s3Res.ok) {
        setMessage({
          text: "s3へのアップロードに失敗しました",
          type: "error",
        });
        return;
      }

      const createRes = await apiFetch(`/issues/${issueId}/attachments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attachmentId: uploadUrlData.attachmentId,
          s3Key: uploadUrlData.s3Key,
          fileName: selectedFile.name,
          contentType: selectedFile.type,
          sizeBytes: selectedFile.size,
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        setMessage({
          text: createData.error ?? "添付画像の保存に失敗しました",
          type: "error",
        });
        return;
      }

      setSelectedFile(null);
      setMessage({ text: "画像を添付しました", type: "success" });

      await fetchAttachments();
      await onChanged?.(); //onChanged関数はcreateLogを更新する関数であっているか？
    } catch (e) {
      setMessage({
        text:
          e instanceof Error ? e.message : "画像のアップロードに失敗しました",
        type: "error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (confirm("添付画像を削除してよろしいですか？")) return;

    setDeletingAttachmentId(attachmentId);
    setMessage(null);

    try {
      const res = await apiFetch(
        `/issues/${issueId}/attachments/${attachmentId}`,
        {
          method: "DELETE",
        },
      );

      const deletedData = await res.json();

      if (!res.ok) {
        setMessage({
          text: deletedData.error ?? "添付画像の削除に失敗しました",
          type: "error",
        });
        return;
      }

      setMessage({ text: "添付画像を削除しました", type: "success" });

      await fetchAttachments();
      await onChanged?.();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "添付画像の削除に失敗しました",
        type: "error",
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  return (
    <section className="rounded-md border border-slate-100 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">添付画像</h3>
          <p className="mt-1 text-xs text-slate-500">
            jpg / png / webp、最大5MBまで添付できます
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {attachments.length}件
        </span>
      </div>

      {canUpload && (
        <div className="mb-5 flex flex-col gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp" //acceptとは何？？
            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            onChange={(e) => {
              setSelectedFile(e.target.files?.[0] ?? null);
            }}
            // files[0]となっているということは複数も可能ということになっているのか？？今回は１つだけの選択?
            // 今回はファイルを選択する形になっているが、カメラボタンを作成してカメラを起動して撮った写真をそのまま添付するような実装も可能なのか？？(カメラはモバイルだけで良いかと思う)
          />

          {selectedFile && (
            <p>
              選択中: {selectedFile.name} /{" "}
              {(selectedFile.size / 1024 / 1024).toFixed(2)}MB
              {/* toFixedは指定した桁数以下の切り捨てだった気がするが詳細を教えて */}
            </p>
          )}

          <LoadingButton
            className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleUpload}
            isLoading={isUploading}
            loadingText="アップロード中..."
            disabled={!selectedFile}
          >
            画像を添付
          </LoadingButton>
        </div>
      )}

      {isLoadingAttachment ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          添付画像を読み込み中...
        </p>
      ) : attachments.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          添付画像はありません
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
            >
              <a href={attachment.url} target="_blank" rel-noreferrer>
                <img
                  src={attachment.url}
                  alt={attachment.fileName}
                  className="h-48 w-full object-cover"
                />
                {/* // Imageを推奨するような警告が出ているのですが、変えますか */}
              </a>

              <div className="flex flex-col gap-2 p-3">
                <div className="truncate text-sm font-medium text-slate-800">
                  {/* // truncateとは何か？ */}
                  <p className="text-xs text-slate-500">
                    {attachment.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(attachment.sizeBytes / 1024 / 1024).toFixed(2)}MB /{" "}
                    {new Date(attachment.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                {isAdmin && (
                  <LoadingButton 
                  className="w-fit rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(attachment.id)}
                  isLoading={deletingAttachmentId === attachment.id}
                  loadingText="削除中..."
                  >
                    削除
                  </LoadingButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AttachmentSection;
