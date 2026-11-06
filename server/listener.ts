import { z } from "zod";
import { accessConfig } from "./access.ts";

export function listenerConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = z
    .object({
      HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
      PORT: z.coerce.number().int().min(1024).max(65535).default(4173),
      STYX_MODE: z.literal("local").default("local"),
    })
    .parse(env);
  if (config.HOST === "0.0.0.0") {
    const access = accessConfig(env, config.PORT);
    if (
      env.STYX_CONTAINER !== "true" ||
      access.mode !== "password" ||
      !access.secure
    )
      throw Error(
        "Container-wide listening requires explicit container mode, password access and HTTPS.",
      );
  }
  return config;
}
