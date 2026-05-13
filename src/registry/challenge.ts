export type BearerChallengeParams = {
  realm: string;
  service?: string;
  scope?: string;
};

export function parseBearerChallenge(
  wwwAuthenticate: string | null,
): BearerChallengeParams | null {
  if (!wwwAuthenticate) return null;
  const trimmed = wwwAuthenticate.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;

  const rest = trimmed.slice("bearer ".length).trim();
  const params: Record<string, string> = {};
  const tokenRe =
    /([a-zA-Z0-9_]+)\s*=\s*("([^"]*)"|([^\s,]+))\s*(?:,\s*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rest))) {
    const key = m[1];
    const quoted = m[3];
    const bare = m[4];
    const value = quoted !== undefined ? quoted : (bare ?? "");
    params[key] = value;
  }

  const realm = params.realm;
  if (!realm) return null;

  return {
    realm,
    service: params.service,
    scope: params.scope,
  };
}
