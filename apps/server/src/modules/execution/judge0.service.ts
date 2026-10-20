
const JUDGE0_API_URL = (
  process.env.JUDGE0_API_URL || "https://ce.judge0.com"
).replace(/\/+$/, "");

interface Judge0Language {
  id: number;
  name: string;
}

interface Judge0Status {
  id: number;
  description: string;
}

export interface Judge0Result {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  status: Judge0Status;
}

interface Judge0SubmissionToken {
  token: string;
}

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Used by Judge0 CE instances configured with X-Auth-Token.
  // Providers such as RapidAPI may require different headers.
  if (process.env.JUDGE0_API_KEY) {
    headers["X-Auth-Token"] = process.env.JUDGE0_API_KEY;
  }

  return headers;
}

async function judge0Request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${JUDGE0_API_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Judge0 request failed (${response.status}): ${errorText.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Fetch available languages from Judge0.
 */
export async function getLanguages(): Promise<Judge0Language[]> {
  return judge0Request<Judge0Language[]>("/languages/");
}

/**
 * Submit code and wait for the asynchronous execution result.
 */
export async function executeCode(
  sourceCode: string,
  languageId: number,
  stdin = "",
): Promise<Judge0Result> {
  // Create a new execution submission.
  const submission = await judge0Request<Judge0SubmissionToken>(
    "/submissions/?base64_encoded=false&wait=false",
    {
      method: "POST",
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin,
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 128000,
      }),
    },
  );

  // Poll until Judge0 finishes, or our overall wait limit is reached.
  const maxAttempts = 15;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await judge0Request<Judge0Result>(
      `/submissions/${submission.token}?base64_encoded=false`,
    );

    // Status 1 = In Queue; status 2 = Processing.
    if (result.status.id !== 1 && result.status.id !== 2) {
      return result;
    }
  }

  throw new Error(
    "Code execution is taking too long. Please try again.",
  );
}
