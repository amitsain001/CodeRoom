import dotenv from "dotenv";

// Load environment variables from apps/server/.env.
dotenv.config();

async function checkGemini(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing from apps/server/.env"
    );
  }

  // Dynamically import the ESM-only Gemini SDK.
  // This avoids the CommonJS/ESM import conflict.
  const { GoogleGenAI } = await import("@google/genai");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model:
        process.env.GEMINI_PRIMARY_MODEL ??
        "gemini-2.5-flash",
      contents:
        "Reply with exactly: CodeRoom Gemini connection successful",
    });

    console.log("Gemini connection successful!");
    console.log("Response:", response.text);
  } catch (error: unknown) {
    console.error("Gemini connection check failed.");

    if (error instanceof Error) {
      // Avoid printing credentials or other sensitive information.
      console.error(error.message);
    } else {
      console.error("An unexpected error occurred.");
    }

    process.exitCode = 1;
  }
}

checkGemini().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Unexpected error"
  );
  process.exitCode = 1;
});