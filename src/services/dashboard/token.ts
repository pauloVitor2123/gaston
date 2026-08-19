import type { Clock } from "@/services/clock";

const encoder = new TextEncoder();

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signToken(userId: number, secret: string, now: Date): Promise<string> {
  const exp = now.getTime() + TOKEN_TTL_MS;
  const signature = await hmacHex(secret, `${userId}.${exp}`);
  return `${exp}.${signature}`;
}

export async function verifyToken(
  userId: number,
  token: string,
  secret: string,
  now: Date,
): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const exp = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isInteger(exp) || exp <= now.getTime()) return false;

  const expected = await hmacHex(secret, `${userId}.${exp}`);
  return constantTimeEquals(expected, signature);
}

export class DashboardLink {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {}

  async build(origin: string, userId: number): Promise<string> {
    const token = await signToken(userId, this.secret, this.clock.now());
    return `${origin}/dashboard?u=${userId}&t=${token}`;
  }
}
