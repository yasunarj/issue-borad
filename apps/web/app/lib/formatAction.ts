export const formatAction = (action: string) => {
  switch (action) {
    case "issue.create":
      return "Issueを作成しました";
    case "issue.update":
      return "Issueを更新しました";
    case "issue.delete":
      return "Issueを削除しました";
    case "issue.resolve":
      return "Issueを解決しました";
    case "comment.create":
      return "コメントを投稿しました";
    case "comment.delete":
      return "コメントを削除しました";
    case "issue.check":
      return "確認しました";
    case "issue.assign":
      return "担当者を設定しました";
    case "issue.attachment.delete":
      return "画像を削除しました";
    default:
      return action;
  }
}