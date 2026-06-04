import { RouterOSAPI } from "node-routeros";

export type PPPoESecret = {
  ".id": string;
  name: string;
  service?: string;
  profile?: string;
  "local-address"?: string;
  "remote-address"?: string;
  disabled?: string;
  comment?: string;
};

export type PPPoEProfile = {
  ".id": string;
  name: string;
  "local-address"?: string;
  "remote-address"?: string;
  "rate-limit"?: string;
  comment?: string;
};

export type ActivePPPoESession = {
  ".id": string;
  name?: string;
  user?: string;
  service?: string;
  address?: string;
  uptime?: string;
  "session-id"?: string;
  "caller-id"?: string;
};

export type SystemResource = {
  uptime?: string;
  version?: string;
  "cpu-load"?: string;
  "free-memory"?: string;
  "total-memory"?: string;
  "board-name"?: string;
  platform?: string;
};

export type RouterIdentity = {
  name?: string;
};

export class MikrotikError extends Error {
  constructor(
    message: string,
    public code:
      | "CONFIG_MISSING"
      | "CONNECTION_FAILED"
      | "LOGIN_FAILED"
      | "NOT_FOUND"
      | "UNKNOWN",
  ) {
    super(message);
    this.name = "MikrotikError";
  }
}

type RouterConnection = InstanceType<typeof RouterOSAPI>;

function getMikrotikConfig() {
  const host = process.env.MIKROTIK_HOST;
  const user = process.env.MIKROTIK_USER;
  const password = process.env.MIKROTIK_PASS;
  const port = Number(process.env.MIKROTIK_PORT ?? 8728);

  if (!host || !user || password === undefined || Number.isNaN(port)) {
    throw new MikrotikError(
      "Cannot connect to MikroTik. Check ZeroTier connection.",
      "CONFIG_MISSING",
    );
  }

  return { host, user, password, port };
}

function normalizeMikrotikError(error: unknown): MikrotikError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("cannot log in") ||
    lowerMessage.includes("invalid user name") ||
    lowerMessage.includes("invalid username") ||
    lowerMessage.includes("cantlogin") ||
    lowerMessage.includes("can't login")
  ) {
    return new MikrotikError("Invalid MikroTik API credentials.", "LOGIN_FAILED");
  }

  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("ehostunreach") ||
    lowerMessage.includes("enetunreach") ||
    lowerMessage.includes("getaddrinfo") ||
    lowerMessage.includes("connect")
  ) {
    return new MikrotikError(
      "Cannot connect to MikroTik. Check ZeroTier connection.",
      "CONNECTION_FAILED",
    );
  }

  return new MikrotikError(message || "MikroTik request failed.", "UNKNOWN");
}

async function withMikrotik<T>(handler: (connection: RouterConnection) => Promise<T>) {
  const connection = await connectMikrotik();

  try {
    return await handler(connection);
  } catch (error) {
    if (error instanceof MikrotikError) {
      throw error;
    }

    throw normalizeMikrotikError(error);
  } finally {
    if (connection.connected) {
      await connection.close().catch(() => undefined);
    }
  }
}

async function findPPPoESecret(connection: RouterConnection, username: string) {
  const accounts = (await connection.write("/ppp/secret/print", [
    `?name=${username}`,
  ])) as PPPoESecret[];

  const account = accounts.find((secret) => secret.name === username);

  if (!account?.[".id"]) {
    throw new MikrotikError("PPPoE account not found.", "NOT_FOUND");
  }

  return account;
}

export async function connectMikrotik() {
  const config = getMikrotikConfig();
  const connection = new RouterOSAPI({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    timeout: 10,
  });

  try {
    return await connection.connect();
  } catch (error) {
    throw normalizeMikrotikError(error);
  }
}

export async function getPPPoESecrets() {
  return withMikrotik(async (connection) => {
    const accounts = (await connection.write("/ppp/secret/print")) as PPPoESecret[];

    return accounts.sort((firstAccount, secondAccount) =>
      firstAccount.name.localeCompare(secondAccount.name),
    );
  });
}

export async function getPPPoEProfiles() {
  return withMikrotik(async (connection) => {
    const profiles = (await connection.write("/ppp/profile/print")) as PPPoEProfile[];

    return profiles.sort((firstProfile, secondProfile) =>
      firstProfile.name.localeCompare(secondProfile.name),
    );
  });
}

export async function createPPPoESecret(username: string, password: string, profile: string, comment: string) {
  return withMikrotik(async (connection) => {
    await connection.write("/ppp/secret/add", [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profile}`,
      `=service=pppoe`,
      `=comment=${comment}`,
    ]);

    return { ok: true, username };
  });
}


export async function enablePPPoE(username: string) {
  return withMikrotik(async (connection) => {
    const account = await findPPPoESecret(connection, username);

    await connection.write("/ppp/secret/enable", [`=.id=${account[".id"]}`]);

    return { ok: true, username };
  });
}

export async function disablePPPoE(username: string) {
  return withMikrotik(async (connection) => {
    const account = await findPPPoESecret(connection, username);

    await connection.write("/ppp/secret/disable", [`=.id=${account[".id"]}`]);

    return { ok: true, username };
  });
}

export async function getActivePPPoESessions() {
  return withMikrotik(async (connection) => {
    const sessions = (await connection.write("/ppp/active/print")) as ActivePPPoESession[];

    return sessions.sort((firstSession, secondSession) =>
      (firstSession.name ?? firstSession.user ?? "").localeCompare(
        secondSession.name ?? secondSession.user ?? "",
      ),
    );
  });
}

export async function disconnectPPPoE(username: string) {
  return withMikrotik(async (connection) => {
    const sessions = (await connection.write("/ppp/active/print", [
      `?name=${username}`,
    ])) as ActivePPPoESession[];
    const session = sessions.find(
      (activeSession) => activeSession.name === username || activeSession.user === username,
    );

    if (!session?.[".id"]) {
      throw new MikrotikError("PPPoE account not found.", "NOT_FOUND");
    }

    await connection.write("/ppp/active/remove", [`=.id=${session[".id"]}`]);

    return { ok: true, username };
  });
}

export async function changePPPoEProfile(username: string, profile: string) {
  return withMikrotik(async (connection) => {
    const account = await findPPPoESecret(connection, username);

    await connection.write("/ppp/secret/set", [
      `=.id=${account[".id"]}`,
      `=profile=${profile}`,
    ]);

    return { ok: true, username, profile };
  });
}

export async function updatePPPoESecret(
  username: string,
  updates: { password?: string; profile?: string; comment?: string }
) {
  return withMikrotik(async (connection) => {
    const account = await findPPPoESecret(connection, username);
    const args: string[] = [`=.id=${account[".id"]}`];

    if (updates.password !== undefined) {
      args.push(`=password=${updates.password}`);
    }
    if (updates.profile !== undefined) {
      args.push(`=profile=${updates.profile}`);
    }
    if (updates.comment !== undefined) {
      args.push(`=comment=${updates.comment}`);
    }

    await connection.write("/ppp/secret/set", args);
    return { ok: true, username };
  });
}


export async function getSystemResource() {
  return withMikrotik(async (connection) => {
    const [resource] = (await connection.write("/system/resource/print")) as SystemResource[];

    return resource ?? {};
  });
}

export async function getRouterIdentity() {
  return withMikrotik(async (connection) => {
    const [identity] = (await connection.write("/system/identity/print")) as RouterIdentity[];

    return identity ?? {};
  });
}