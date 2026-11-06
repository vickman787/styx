import { Buffer } from "buffer";

// NEAR SDK transaction serializers use Buffer as a global in browser builds.
// Install it before React can load a wallet module or construct an action.
const browserRuntime = globalThis as unknown as { Buffer?: typeof Buffer };
browserRuntime.Buffer ??= Buffer;
