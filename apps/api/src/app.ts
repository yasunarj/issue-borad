import { User } from "@supabase/supabase-js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import auditLogs from "./routes/auditLogs.js";
import issues from "./routes/issues.js";
import me from "./routes/me.js";
import internal from "./routes/internal.js";
import ai from "./routes/ai.js";
import attachments from "./routes/attachments.js";

export type Role = "member" | "admin" | "viewer";

export type AppEnv = {
  Variables: {
    user: User;
    role: Role;
  };
};

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: [
        "http://localhost:3000",
        "https://issue-board-web-umber.vercel.app",
      ],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/me", me);
  app.route("/issues", issues);
  app.route("/issues/:id/attachments", attachments)
  app.route("/audit-logs", auditLogs);
  app.route("/internal", internal);
  app.route("/ai", ai)

  return app;
};

const app = createApp();

export default app;
