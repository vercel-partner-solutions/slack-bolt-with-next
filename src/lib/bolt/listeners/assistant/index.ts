import type { App } from "@slack/bolt";
import { assistant } from "./assistant";

const register = (app: App) => {
  app.assistant(assistant);
};

export default { register };
