import { Hono } from "hono";
import { AppEnv } from "../app";
import { supabaseAdmin } from "../lib/supabase.js";
import { sendMail } from "../lib/sendMail.js";
import { buildIssueMailTemplate } from "../lib/issueMailTemplate.js";
import { sendSesMail } from "../lib/sendSesMail";

const internal = new Hono<AppEnv>();

internal.get("/reminders/run", async (c) => {
  const authHeader = c.req.header("authorization");
  const internalSecret = c.req.header("x-internal-secret");

  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = internalSecret === process.env.INTERNAL_API_SECRET;
  
  if (!isCron && !isManual) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { data: issues, error } = await supabaseAdmin
    .from("issues")
    .select(`
      id,
      title,
      status,
      due_date,
      assigned_to,
      reminder_3days_sent_at,
      reminder_due_sent_at,
      assigned_to_profile:profiles!issues_assigned_to_fkey (
        id,
        display_name
      )
    `)
    .eq("status", "open")
    .not("assigned_to", "is", null)
    .not("due_date", "is", null);

  if (error) {
    console.log(error);
    return c.json({ error: "Failed to fetch reminder targets" }, 500);
  }

  if (!issues || issues.length === 0) {
    return c.json({
      message: "No reminder targets",
      targets: [],
    }, 200);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isSameDate = (a: Date, b: Date) => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  const targets = issues.map((issue) => {
    const dueDate = new Date(issue.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const threeDaysBefore = new Date(dueDate);
    threeDaysBefore.setDate(dueDate.getDate() - 3);

    const shouldSendDue = isSameDate(today, dueDate) && issue.reminder_due_sent_at === null;

    const shouldSend3Days = isSameDate(today, threeDaysBefore) && issue.reminder_3days_sent_at === null;

    return {
      ...issue,
      shouldSend3Days,
      shouldSendDue,
    }
  }).filter((issue) => issue.shouldSend3Days || issue.shouldSendDue);

  let sentCount = 0;
  let skippedCount = 0;

  for (const target of targets) {
    const userResult = await supabaseAdmin.auth.admin.getUserById(target.assigned_to);
    const email = userResult.data.user?.email;

    if (!email) {
      skippedCount += 1;
      continue;
    };

    const issueUrl = `${process.env.APP_BASE_URL}/issues/${target.id}`
    const assigneeName = target.assigned_to_profile?.[0]?.display_name;

    const subject = target.shouldSend3Days
      ? `[Issue Board] 期限3日前: ${target.title}`
      : `[Issue Board] 期限当日: ${target.title}`;

    const mailTemplate = target.shouldSend3Days
      ? buildIssueMailTemplate({
        notificationType: "期限3日前リマインド",
        headline: "担当Issueの期限が3日後に近づいています。",
        issueTitle: target.title,
        dueDate: target.due_date,
        assigneeName,
        issueUrl,
        action: "詳細ページで対応状況を確認し、期限までに完了できるよう対応を進めてください。",
      })
      : buildIssueMailTemplate({
        notificationType: "期限当日リマインド",
        headline: "担当Issueの期限は本日です。",
        issueTitle: target.title,
        dueDate: target.due_date,
        assigneeName,
        issueUrl,
        action: "本日中に対応状況を確認し、完了または必要な更新を行ってください。",
      });

    try {
      await sendMail({
        to: email,
        subject,
        text: mailTemplate.text,
        html: mailTemplate.html,
      })

      if (target.shouldSend3Days) {
        await supabaseAdmin
          .from("issues")
          .update({
            reminder_3days_sent_at: new Date().toISOString(),
          })
          .eq("id", target.id)
      }

      if (target.shouldSendDue) {
        await supabaseAdmin
          .from("issues")
          .update({
            reminder_due_sent_at: new Date().toISOString(),
          })
          .eq("id", target.id)
      }

      sentCount += 1;
    } catch (mailError) {
      console.error("メール送信失敗", mailError);
      skippedCount += 1;
    }
  }

  return c.json({
    message: "Reminder check completed",
    targets,
    sentCount,
    skippedCount,
  }, 200);
});

internal.get("/ses/test", async (c) => {
  const internalSecret = c.req.header("x-internal-secret");

  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const to = process.env.SES_TEST_TO_EMAIL;

  if (!to) {
    return c.json({ error: "SES_TEST_TO_EMAIL missing" }, 500);
  }

  const result = await sendSesMail({
    to,
    subject: "SES SDK test from Issue Board",
    text: "Hono APIからAmazon SES SDKを使って送信したテストメールです。",
    html: "<p>Hono APIからAmazon SES SDKを使って送信したテストメールです。</p>",
  });

  return c.json({
    message: "SES test email sent",
    messageId: result.MessageId,
  });
});

export default internal;
