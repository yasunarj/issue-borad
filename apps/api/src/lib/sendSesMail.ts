import {
  SESClient,
  SendEmailCommand,
} from "@aws-sdk/client-ses";

type SendSesMailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export const sendSesMail = async ({
  to,
  subject,
  text,
  html,
}: SendSesMailParams) => {
  const region = process.env.AWS_REGION;
  const fromEmail = process.env.SES_FROM_EMAIL;

  if (!region) {
    throw new Error("AWS_REGION missing");
  }

  if (!fromEmail) {
    throw new Error("SES_FROM_EMAIL missing");
  }
  const sesClient = new SESClient({
    region,
  });
  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: text,
          Charset: "UTF-8",
        },
        ...(html
          ? {
            Html: {
              Data: html,
              Charset: "UTF-8",
            },
          }
          : {}),
      },
    },
  });

  const result = await sesClient.send(command);

  return result;
};