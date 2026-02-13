import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

export const sampleMessageCallback = async ({
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  try {
    await say(`demo days!`);
  } catch (error) {
    logger.error(error);
  }
};
