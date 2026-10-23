import "dotenv/config";

import { generateInterviewFeedback } from "../modules/ai/gemini.service";

async function main(): Promise<void> {
  try {
    console.log("Generating CodeRoom interview feedback...\n");

    const result = await generateInterviewFeedback({
      questionTitle: "Two Sum",
      questionDescription:
        "Given an array of integers and a target, return the indices " +
        "of two numbers that add up to the target. Assume exactly one " +
        "valid solution exists.",
      language: "JavaScript",
      submittedCode: `
function twoSum(nums, target) {
  const seen = new Map();

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];

    if (seen.has(complement)) {
      return [seen.get(complement), i];
    }

    seen.set(nums[i], i);
  }

  return [];
}
`,
    });

    console.log("Feedback generated successfully!\n");
    console.log("Model:", result.model);
    console.log(
      JSON.stringify(result.feedback, null, 2),
    );
  } catch (error: unknown) {
    console.error("Feedback generation failed:");

    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    );

    process.exitCode = 1;
  }
}

void main();