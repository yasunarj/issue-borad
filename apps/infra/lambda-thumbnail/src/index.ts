import type { S3Event } from "aws-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const s3Client = new S3Client({});
// 引数の{}はconstructorに特に渡すものがなく(ないというかregion: process.env.AWS_RESIONが自動で入る)、Lambdaの実行環境に任せるということを表している
const ssmClient = new SSMClient({});
const secretsClient = new SecretsManagerClient({});

let supabaseClient: SupabaseClient | null = null;

const getParameterValue = async (name: string, withDecryption = false) => {
  const result = await ssmClient.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: withDecryption,
      // WithDecryptionの意味 - parameter storeには StringとSecureStringがある。SecureStringは暗号化されているのでWithDecryption: trueとして複合して受け取らなければいけない。なので今回は暗号化されているSUPABASE_SERVICE_ROLE_KEY_PARAM_NAMEだけ第二引数に true を入れている。
    })
  );

  if (!result.Parameter?.Value) {
    throw new Error(`Parameter value is missing: ${name}`);
  }

  return result.Parameter.Value;
};

const getSecretString = async (secretId: string) => {
  const result = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: secretId,
    })
  );

  if (!result.SecretString) {
    throw new Error(`SecretString is empty: ${secretId}`);
  }

  return result.SecretString;
}

// SUPABASE_SERVICE_ROLE_KEY を Parameter Store から取得する場合
const getSupabaseClientParameter = async () => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrlParamName = process.env.SUPABASE_URL_PARAM_NAME;
  const supabaseServiceRoleKeyParamName = process.env.SUPABASE_SERVICE_ROLE_KEY_PARAM_NAME;

  if (!supabaseUrlParamName) {
    throw new Error("SUPABASE_URL_PARAM_NAME is missing");
  }

  if (!supabaseServiceRoleKeyParamName) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_PARAM_NAME is missing");
  }

  const supabaseUrl = await getParameterValue(supabaseUrlParamName);
  const supabaseServiceRoleKey = await getParameterValue(supabaseServiceRoleKeyParamName, true);

  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  return supabaseClient;
}

// SUPABASE_SERVICE_ROLE_KEY を Secrets Manager から取得する場合
const getSupabaseClientSecrets = async () => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrlParameterName = process.env.SUPABASE_URL_PARAM_NAME;
  const supabaseServiceRoleKeySecretId = process.env.SUPABASE_SERVICE_ROLE_KEY_SECRET_ID;

  if (!supabaseUrlParameterName) {
    throw new Error("SUPABASE_URL_PARAM_NAME is missing");
  }

  if (!supabaseServiceRoleKeySecretId) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_SECRET_ID is missing");
  }

  const supabaseUrl = await getParameterValue(supabaseUrlParameterName, false);
  const secretString = await getSecretString(supabaseServiceRoleKeySecretId);

  const parsedSecret = JSON.parse(secretString);
  const supabaseServiceRoleKey = parsedSecret.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in secret");
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  return supabaseClient;
}

const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    // isBufferはchunkがBufferであるか調べている
    // fromはchunkがBufferでなければBufferに変換している
  }

  return Buffer.concat(chunks);
  // concatはchunksの配列データを１つのBufferとしてまとめている
}

const getThumbnailKey = (originalKey: string) => {
  return originalKey.replace(
    "/attachments/original/",
    "/attachments/thumbnails/"
  )
}

export const handler = async (event: S3Event) => {
  console.log("event", JSON.stringify(event, null, 2));
  //JSON.stringifyはJavaScriptのオブジェクトをJSONっぽい文字列に変換しているその逆はJSON.parseである。
  //引数の 1 は文字列にしたいJavaScriptのオブジェクト。
  //引数の 2 は変換ルール設定。今回は特にないので null。 
  //引数の 3 はインデント。今回は2スペースなので 2 を指定している。CloudWatch Logs で確認するときに綺麗に見える。

  // const supabase = await getSupabaseClientParameter();
  const supabase = await getSupabaseClientSecrets();

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    // S3イベントで渡ってくる object.key は、URL用にエンコードされた形になっていることがあるので、値が記号の羅列の
    // ようなものになる場合がある、それを読める形に戻すのがdecodeURIComponentである。

    console.log("bucket:", bucket);
    console.log("key:", key);

    if (!key.includes("/attachments/original/")) {
      console.log("skip non-original object:", key);
      continue;
    }

    const thumbnailKey = getThumbnailKey(key);

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      // GetObjectCommand は取得命令の内容を作成している

      const object = await s3Client.send(command);
      // ここは commandを実行している

      if (!object.Body) {
        throw new Error(`object body is empty: ${key}`);
      }

      const imageBuffer = await streamToBuffer(
        object.Body as Readable,
      )

      console.log("image content type", object.ContentType);
      console.log("image size bytes:", imageBuffer.length);

      const metadata = await sharp(imageBuffer).metadata();

      console.log("original width:", metadata.width);
      console.log("original height:", metadata.height);
      console.log("original format", metadata.format);

      const thumbnailBuffer = await sharp(imageBuffer)
        .rotate()
        // スマホで撮影した場合、画像が回転して表示されてしまうのでrotateを使用して回転させる
        .resize({
          width: 400,
          withoutEnlargement: true,
          // 縮小した画像を拡大すると画質が悪くなるので拡大できないようにwithoutEnlargementを使用している
        })
        .jpeg({ quality: 80 })
        // サムネイル画像をjpegにする & 画質を80に設定している
        .toBuffer();
      // 加工した画像をBufferとして受け取りたいのでtoBufferでBuffer化する

      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg",
      });

      await s3Client.send(putCommand);

      const { error: updateError } = await supabase
        .from("issue_attachments")
        .update({
          thumbnail_status: "completed",
          thumbnail_created_at: new Date().toISOString(),
        })
        .eq("thumbnail_s3_key", thumbnailKey);

      if (updateError) {
        console.error("failed to update thumbnail status:", updateError);
        throw new Error(updateError.message);
        // throw updateError;
        // throw new Error()は引数に文字列を入れるのが基本なので、オブジェクトであるupdateErrorを入れるのは好ましくない。オブジェクトごとエラーを投げるのであれば throw updateError と書くことが一般的
      }

      console.log("thumbnail status updated:", thumbnailKey);

      console.log("thumbnail saved key:", thumbnailKey);

      console.log("thumbnail size bytes:", thumbnailBuffer.length);

      const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();

      console.log("thumbnail width:", thumbnailMetadata.width);
      console.log("thumbnail height:", thumbnailMetadata.height);
      console.log("thumbnail format:", thumbnailMetadata.format);
    } catch (e) {
      console.error("thumbnail generation failed:", e);

      const { error: failedUpdateError } = await supabase
        .from("issue_attachments")
        .update({
          thumbnail_status: "failed",
        })
        .eq("thumbnail_s3_key", thumbnailKey);

      if (failedUpdateError) {
        console.error("failed to update thumbnail status to failed:", failedUpdateError);
      }
      throw e;
      // catchは throw を使用しないとエラー判定にならない。ログでエラーが出たことがわかるように throw eを入れる
    }
  }
  return {
    ok: true
  }
};



// cd apps/infra
// npm run typeCheck
// npm run build

// rm -rf lambda-thumbnail/deploy
// mkdir -p lambda-thumbnail/deploy

// cp lambda-thumbnail/dist/index.js lambda-thumbnail/deploy/index.js

// cat > lambda-thumbnail/deploy/package.json <<'EOF'
// {
//   "type": "module",
//   "dependencies": {
//     "@aws-sdk/client-s3": "^3.1056.0",
//     "@aws-sdk/client-ssm": "^3.1071.0",
//     "@aws-sdk/client-secrets-manager": "^3.1072.0",
//     "@supabase/supabase-js": "^2.106.2",
//     "sharp": "^0.34.5"
//   }
// }
// EOF

// cd lambda-thumbnail/deploy
// npm install --omit=dev --os=linux --cpu=x64 --libc=glibc

// zip -r function.zip index.js package.json node_modules