import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const attachments = new Hono();

attachments.use("*", authMiddleware);

attachments.post("/upload-url", requireRole(["admin", "member"]), async (c) => {
  
})


export default attachments;