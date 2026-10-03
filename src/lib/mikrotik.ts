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
  "bytes-in"?: string;
  "bytes-out"?: string;
  "packets-in"?: string;
  "packets-out"?: string;
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
      | "CONNECTION_TIMEOUT"
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
  const port = Number(process.env.MIKROTIK_PORT ?? 10251);
  const timeout = Number(process.env.MIKROTIK_TIMEOUT ?? 15);

  if (!host || !user || password === undefined || Number.isNaN(port)) {
    throw new MikrotikError(
      "MikroTik API credentials not configured. Set MIKROTIK_HOST, MIKROTIK_PORT, MIKROTIK_USER, and MIKROTIK_PASS.",
      "CONFIG_MISSING",
    );
  }

  return { host, user, password, port, timeout: Number.isNaN(timeout) ? 15 : timeout };
}

function normalizeMikrotikError(error: unknown): MikrotikError {
  console.error("[MikroTik API Connection Error Details]:", error);

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // node-routeros RosException often has an empty message with the real
  // error stored in the `errno` property (libuv error codes).
  const errno = (error as Record<string, unknown>)?.errno;

  // ── Check errno first (Windows libuv codes) ────────────────────────────
  if (typeof errno === "number") {
    // ETIMEDOUT: -4039 (Windows) / -110 (Linux)
    if (errno === -4039 || errno === -110) {
      return new MikrotikError(
        "MikroTik connection timed out. The router or AccessTunnel may be unreachable.",
        "CONNECTION_TIMEOUT",
      );
    }
    // ECONNREFUSED: -4078 (Windows) / -111 (Linux)
    if (errno === -4078 || errno === -111) {
      return new MikrotikError(
        "Connection refused by AccessTunnel (port 10251). Verify the AccessTunnel port mapping is active and the router is connected.",
        "CONNECTION_FAILED",
      );
    }
    // EHOSTUNREACH: -4062 (Windows) / -113 (Linux)
    if (errno === -4062 || errno === -113) {
      return new MikrotikError(
        "MikroTik host unreachable. Check network connectivity to AccessTunnel.",
        "CONNECTION_FAILED",
      );
    }
    // ECONNRESET: -4077 (Windows) / -104 (Linux)
    if (errno === -4077 || errno === -104) {
      return new MikrotikError(
        "Connection reset by AccessTunnel (port 10251). The tunnel may not be forwarding to the router's API port, or the router's API service is not running.",
        "CONNECTION_FAILED",
      );
    }
    // ENETUNREACH: -4059 (Windows) / -101 (Linux)
    if (errno === -4059 || errno === -101) {
      return new MikrotikError(
        "Network unreachable. Check your internet connection.",
        "CONNECTION_FAILED",
      );
    }
    // ENOTFOUND (DNS): -4058 (Windows) / -3008 (Linux via c-ares)
    if (errno === -4058 || errno === -3008) {
      return new MikrotikError(
        "DNS lookup failed for AccessTunnel hostname. Check MIKROTIK_HOST value.",
        "CONNECTION_FAILED",
      );
    }
  }

  // ── Check message strings (fallback) ───────────────────────────────────
  if (
    lowerMessage.includes("cannot log in") ||
    lowerMessage.includes("invalid user name") ||
    lowerMessage.includes("invalid username") ||
    lowerMessage.includes("cantlogin") ||
    lowerMessage.includes("can't login")
  ) {
    return new MikrotikError("Invalid MikroTik API credentials.", "LOGIN_FAILED");
  }

  if (lowerMessage.includes("timeout")) {
    return new MikrotikError(
      "MikroTik connection timed out. The router or AccessTunnel may be unreachable.",
      "CONNECTION_TIMEOUT",
    );
  }

  if (
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("ehostunreach") ||
    lowerMessage.includes("enetunreach") ||
    lowerMessage.includes("getaddrinfo") ||
    lowerMessage.includes("connect")
  ) {
    return new MikrotikError(
      "Cannot connect to MikroTik. Check AccessTunnel VPN connection.",
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

  console.log(`[MikroTik] Connecting to ${config.host}:${config.port} (timeout: ${config.timeout}s)`);

  const connection = new RouterOSAPI({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    timeout: config.timeout,
  });

  // Attach error listener to prevent uncaught exceptions from background socket events
  connection.on("error", (error) => {
    console.error("[MikroTik] Background socket error:", error);
  });

  try {
    const result = await connection.connect();
    console.log(`[MikroTik] Connection successful`);
    return result;
  } catch (error) {
    console.error(`[MikroTik] Connection failed to ${config.host}:${config.port}`);
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
    // Fetch all fields — bytes-in/bytes-out are included by default on all RouterOS versions
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

// ─── Interface Traffic ─────────────────────────────────────────────────────────

export type InterfaceStats = {
  name: string;
  type: string;
  running: string;
  disabled: string;
  "rx-byte": string;
  "tx-byte": string;
  "rx-packet": string;
  "tx-packet": string;
};

/**
 * Fetch /interface/print with stats — returns cumulative RX/TX byte counters.
 * Returns ALL interfaces including virtual PPPoE client interfaces (<pppoe-username>).
 */
export async function getInterfaceStats() {
  return withMikrotik(async (connection) => {
    const ifaces = (await connection.write("/interface/print", [
      "=.proplist=name,type,running,disabled,rx-byte,tx-byte,rx-packet,tx-packet",
    ])) as InterfaceStats[];
    return ifaces ?? [];
  });
}

// ─── Update PPPoE Secret Fields ────────────────────────────────────────────────

export interface PPPoESecretUpdate {
  password?: string;
  comment?:  string;
  newName?:  string;
  profile?:  string;
}

/**
 * Update editable fields on a PPPoE secret (password, comment, name, profile).
 */
export async function updatePPPoESecretFields(username: string, updates: PPPoESecretUpdate) {
  return withMikrotik(async (connection) => {
    const account = await findPPPoESecret(connection, username);
    const args: string[] = [`=.id=${account[".id"]}`];

    if (updates.newName  !== undefined && updates.newName !== username) args.push(`=name=${updates.newName}`);
    if (updates.password !== undefined && updates.password !== "") args.push(`=password=${updates.password}`);
    if (updates.comment  !== undefined) args.push(`=comment=${updates.comment}`);
    if (updates.profile  !== undefined) args.push(`=profile=${updates.profile}`);

    if (args.length > 1) {
      await connection.write("/ppp/secret/set", args);
    }
    return { ok: true, username: updates.newName ?? username };
  });
}