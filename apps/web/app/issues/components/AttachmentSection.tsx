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

type MessageSetter = (message: {
  text: string;
  type: "success" | "error" 
} | null) => void;

type AttachmentSectionProps = {
  issueId: string;
  canUpload: boolean;
  isAdmin: boolean;
  setMessage: MessageSetter;
  onChanged?: () => Promise<void> | void;
}