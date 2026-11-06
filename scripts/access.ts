import { Store } from "../lib/storage/db.ts";
import { AccessService, passwordDigest } from "../lib/auth/service.ts";
const [command, ...args] = process.argv.slice(2),
  options = Object.fromEntries(
    Array.from({ length: Math.floor(args.length / 2) }, (_, i) => [
      args[i * 2].replace(/^--/, ""),
      args[i * 2 + 1],
    ]),
  );
const store = new Store(),
  access = new AccessService(store, "password");
try {
  if (command === "create-user") {
    const secret = process.env.STYX_SETUP_PASSWORD;
    delete process.env.STYX_SETUP_PASSWORD;
    if (!secret)
      throw Error(
        "Set STYX_SETUP_PASSWORD securely in this process environment; no default password is provided.",
      );
    await access.createUser(
      options.username || "",
      secret,
      options.workspace || "",
      (options.role as "owner" | "viewer") || "owner",
      options.name || options.workspace,
    );
    console.log(
      "User created and workspace membership assigned. No external service was called.",
    );
  } else {
    const user = store.db
      .prepare("SELECT id FROM app_user WHERE username=?")
      .get((options.username || "").toLowerCase());
    if (!user) throw Error("User not found.");
    if (command === "grant")
      access.grant(
        String(user.id),
        options.workspace,
        options.role as "owner" | "viewer",
      );
    else if (command === "revoke")
      store.transaction(() => {
        store.db
          .prepare("DELETE FROM membership WHERE user_id=? AND workspace_id=?")
          .run(user.id!, options.workspace);
        store.db
          .prepare(
            "DELETE FROM auth_session WHERE user_id=? AND workspace_id=?",
          )
          .run(user.id!, options.workspace);
      });
    else if (command === "disable")
      store.transaction(() => {
        store.db
          .prepare("UPDATE app_user SET disabled=1 WHERE id=?")
          .run(user.id!);
        store.db
          .prepare("DELETE FROM auth_session WHERE user_id=?")
          .run(user.id!);
      });
    else if (command === "reset-password") {
      const secret = process.env.STYX_SETUP_PASSWORD;
      delete process.env.STYX_SETUP_PASSWORD;
      if (!secret) throw Error("Set STYX_SETUP_PASSWORD securely first.");
      const digest = await passwordDigest(secret);
      store.transaction(() => {
        store.db
          .prepare("UPDATE app_user SET password_digest=? WHERE id=?")
          .run(digest, user.id!);
        store.db
          .prepare("DELETE FROM auth_session WHERE user_id=?")
          .run(user.id!);
      });
    } else
      throw Error(
        "Commands: create-user, grant, revoke, disable, reset-password. See docs/ACCESS.md.",
      );
    console.log(
      "Access updated. Credentials and session tokens have not been printed.",
    );
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  store.close();
}
