import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

export const sampleMessageCallback = async ({
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  try {
    await say(`slack!`);
  } catch (error) {
    logger.error(error);
  }
};
