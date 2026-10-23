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

const REQUEST_TIMEOUT_MS = 15_000;
const EXECUTION_TIMEOUT_MS = 45_000;

// Adaptive polling configuration.
const INITIAL_POLL_INTERVAL_MS = 300;
const MAX_POLL_INTERVAL_MS = 1_000;
const POLL_INTERVAL_MULTIPLIER = 1.4;

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.JUDGE0_API_KEY) {
    headers["X-Auth-Token"] = process.env.JUDGE0_API_KEY;
  }

  return headers;
}

async function judge0Request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${JUDGE0_API_URL}${path}`, {
      ...options,
      headers: {
        ...getHeaders(),
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");

      throw new Error(
        `Judge0 returned HTTP ${response.status}: ${
          errorText.slice(0, 300) || response.statusText
        }`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Judge0 request timed out after ${
          REQUEST_TIMEOUT_MS / 1000
        } seconds.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedSeconds(startTime: number): string {
  return ((performance.now() - startTime) / 1000).toFixed(3);
}

/**
 * Fetch available languages from Judge0.
 */
export async function getLanguages(): Promise<Judge0Language[]> {
  return judge0Request<Judge0Language[]>("/languages/");
}

/**
 * Submit source code and poll Judge0 until execution completes.
 *
 * Records:
 * - Submission request duration
 * - Poll attempt count
 * - Polling duration
 * - Judge0-reported execution time
 * - Judge0-reported memory usage
 * - Final execution status
 * - End-to-end server latency
 */
export async function executeCode(
  sourceCode: string,
  languageId: number,
  stdin = "",
): Promise<Judge0Result> {
  const requestStartedAt = performance.now();

  console.log("\n========== CODEROOM EXECUTION METRICS ==========");
  console.log(`[Execution] Language ID: ${languageId}`);

  try {
    // 1. Submit code to Judge0.
    const submissionStartedAt = performance.now();

    const submission = await judge0Request<Judge0SubmissionToken>(
      "/submissions/?base64_encoded=false&wait=false",
      {
        method: "POST",
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: languageId,
          stdin,
          cpu_time_limit: 5,
          wall_time_limit: 10,
          memory_limit: 128000,
        }),
      },
    );

    console.log(
      `[Execution] Submission request: ${elapsedSeconds(
        submissionStartedAt,
      )}s`,
    );

    console.log(`[Execution] Submission token: ${submission.token}`);

    // 2. Poll Judge0 with an overall deadline.
    const pollingStartedAt = performance.now();
    const deadline = requestStartedAt + EXECUTION_TIMEOUT_MS;

    let attempts = 0;
    let pollInterval = INITIAL_POLL_INTERVAL_MS;

    while (performance.now() < deadline) {
      const remainingTime = deadline - performance.now();

      await delay(Math.min(pollInterval, remainingTime));

      if (performance.now() >= deadline) {
        break;
      }

      attempts++;

      const result = await judge0Request<Judge0Result>(
        `/submissions/${encodeURIComponent(
          submission.token,
        )}?base64_encoded=false`,
      );

      // Judge0 status 1 = In Queue, 2 = Processing.
      // Other statuses indicate a terminal result.
      if (result.status.id !== 1 && result.status.id !== 2) {
        const pollingTime = elapsedSeconds(pollingStartedAt);
        const totalTime = elapsedSeconds(requestStartedAt);

        console.log(`[Execution] Poll attempts: ${attempts}`);
        console.log(`[Execution] Polling duration: ${pollingTime}s`);

        console.log(
          `[Execution] Judge0 execution time: ${
            result.time ?? "N/A"
          }s`,
        );

        console.log(
          `[Execution] Memory usage: ${
            result.memory ?? "N/A"
          } KB`,
        );

        console.log(
          `[Execution] Final status: ${result.status.description}`,
        );

        console.log(
          `[Execution] End-to-end server latency: ${totalTime}s`,
        );

        console.log("================================================\n");

        return result;
      }

      // Start with short intervals to detect fast completions.
      // Gradually increase the interval to limit polling traffic.
      pollInterval = Math.min(
        Math.ceil(pollInterval * POLL_INTERVAL_MULTIPLIER),
        MAX_POLL_INTERVAL_MS,
      );
    }

    throw new Error(
      `Judge0 execution exceeded the ${
        EXECUTION_TIMEOUT_MS / 1000
      }-second waiting deadline.`,
    );
  } catch (error) {
    console.error(
      `[Execution] Failed after ${elapsedSeconds(requestStartedAt)}s`,
    );

    console.error(
      `[Execution] Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    console.log("================================================\n");

    throw error;
  }
}