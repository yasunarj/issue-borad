import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION;
const bucketName = process.env.AWS_S3_BUCKET_NAME;

if (!region) {
  throw new Error("AWS_REGION missing");
}

if (!bucketName) {
  throw new Error("AWS_S3_BUCKET_NAME missing");
}

export const s3Client = new S3Client({ region });

export const getIssueAttachmentKey = ({
  issueId,
  attachmentId,
  fileName,
}: {
  issueId: string;
  attachmentId: string;
  fileName: string;
}) => {
  const safeFileName = fileName.replace(/[^\w.\-]/g, "_");

  return `issues/${issueId}/attachments/${attachmentId}-${safeFileName}`;
};

export const createUploadSignedUrl = async ({
  key,
  contentType,
}: {
  key: string;
  contentType: string;
}) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
};

export const createDownloadSignedUrl = async ({ key }: { key: string }) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
};

export const deleteS3Object = async ({ key }: { key: string }) => {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
};

