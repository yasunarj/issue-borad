export const handler = async (event: unknown) => {
  console.log("reminder runner invoked");
  console.log("event:", JSON.stringify(event, null, 2));

  const url = process.env.REMINDER_RUN_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!url) {
    throw new Error("REMINDER_RUN_URL is missing");
  }

  if (!internalSecret) {
    throw new Error("INTERNAL_API_SECRET is missing");
  }

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