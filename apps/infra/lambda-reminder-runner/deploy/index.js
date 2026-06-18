import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
const region = process.env.AWS_REGION ?? "ap-northeast-1";
const ssmClient = new SSMClient({
    region,
});
const getInternalApiSecret = async () => {
    const paramName = process.env.INTERNAL_API_SECRET_PARAM_NAME;
    if (!paramName) {
        throw new Error("INTERNAL_API_SECRET_PARAM_NAME is missing");
    }
    const result = await ssmClient.send(new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
    }));
    if (!result.Parameter?.Value) {
        throw new Error("INTERNAL_API_SECRET parameter value is missing");
    }
    return result.Parameter.Value;
};
export const handler = async (event) => {
    console.log("reminder runner invoked");
    console.log("event:", JSON.stringify(event, null, 2));
    const url = process.env.REMINDER_RUN_URL;
    if (!url) {
        throw new Error("REMINDER_RUN_URL is missing");
    }
    const internalSecret = await getInternalApiSecret();
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "x-internal-secret": internalSecret,
        },
    });
    const text = await response.text();
    console.log("reminder api status:", response.status);
    console.log("reminder api response:", text);
    if (!response.ok) {
        throw new Error(`Reminder API failed: ${response.status} ${text}`);
    }
    return {
        ok: true,
        status: response.status,
        body: text,
    };
};
//# sourceMappingURL=index.js.map