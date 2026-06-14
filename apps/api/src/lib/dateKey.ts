export const getJstDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    // 指定した date を Asia/Tokyo の日付として分解する
    // 例: year: "2026", month: "06", day: "14" のように取れる
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;

  // formatToParts で取れる month は "06" のような実際の月なので +1 は不要
  const month = parts.find((part) => part.type === "month")?.value;

  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to create JST date key");
  }

  return `${year}-${month}-${day}`;
};

export const addDaysToDateKey = (dateKey: string, days: number) => {
  // "2026-06-14" を "2026-06-14T00:00:00.000Z" にして
  // UTC基準の Date オブジェクトに変換する
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  // UTC基準の日付に days を足す
  // 例: 14日に -3 を足すと 11日になる
  date.setUTCDate(date.getUTCDate() + days);

  // UTC基準で年月日を取り出して YYYY-MM-DD に戻す
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};