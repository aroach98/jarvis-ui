import { getEnv } from "../lib/env.js";

/**
 * Spotify Web API client for the "Good morning" easter egg (ARCHITECTURE.md
 * §5): quietly start AC/DC on the user's active device — no audio file lives
 * in this public repo. Requires SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET /
 * SPOTIFY_REFRESH_TOKEN in .env.local (scopes: user-modify-playback-state,
 * user-read-playback-state). Every step degrades silently — a missing
 * credential or no active device skips the music, never the briefing.
 */
const DUCK_VOLUME = 15;

interface SpotifyDevice {
  id: string;
  is_active: boolean;
  type: string;
  volume_percent: number;
}

export class SpotifyPlayer {
  private previousVolume: number | null = null;

  available(): boolean {
    return Boolean(
      getEnv("SPOTIFY_CLIENT_ID") &&
        getEnv("SPOTIFY_CLIENT_SECRET") &&
        getEnv("SPOTIFY_REFRESH_TOKEN"),
    );
  }

  /**
   * Start AC/DC at ducked volume. Prefers the active device; when Spotify is
   * merely open but idle, playback is transferred to any available device.
   * False = skipped (no credentials, no device at all, or an API error).
   */
  async startMusic(): Promise<boolean> {
    try {
      const token = await this.accessToken();
      if (!token) return false;

      let device = (
        await this.api<{ device?: SpotifyDevice }>(token, "GET", "/me/player")
      )?.device;
      if (!device) {
        const all = await this.api<{ devices?: SpotifyDevice[] }>(
          token,
          "GET",
          "/me/player/devices",
        );
        device =
          all?.devices?.find((d) => d.is_active) ??
          all?.devices?.find((d) => d.type === "Computer") ??
          all?.devices?.[0];
      }
      if (!device) {
        console.log("[voice] spotify: no device available (is Spotify open?) — skipping music");
        return false;
      }
      this.previousVolume = device.volume_percent;

      const search = await this.api<{
        tracks?: { items?: Array<{ uri: string }> };
      }>(token, "GET", "/search?q=" + encodeURIComponent('artist:"AC/DC" track:"Back In Black"') + "&type=track&limit=1");
      const uri = search?.tracks?.items?.[0]?.uri;
      if (!uri) return false;

      const dev = `device_id=${encodeURIComponent(device.id)}`;
      await this.api(token, "PUT", `/me/player/volume?volume_percent=${DUCK_VOLUME}&${dev}`);
      await this.api(token, "PUT", `/me/player/play?${dev}`, { uris: [uri] });
      return true;
    } catch (err) {
      console.warn(`[voice] spotify start failed: ${(err as Error).message}`);
      return false;
    }
  }

  async stopMusic(): Promise<void> {
    try {
      const token = await this.accessToken();
      if (!token) return;
      await this.api(token, "PUT", "/me/player/pause");
      if (this.previousVolume !== null) {
        await this.api(token, "PUT", `/me/player/volume?volume_percent=${this.previousVolume}`);
        this.previousVolume = null;
      }
    } catch {
      /* music stop is best-effort */
    }
  }

  private async accessToken(): Promise<string | null> {
    const id = getEnv("SPOTIFY_CLIENT_ID");
    const secret = getEnv("SPOTIFY_CLIENT_SECRET");
    const refresh = getEnv("SPOTIFY_REFRESH_TOKEN");
    if (!id || !secret || !refresh) return null;
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  }

  private async api<T = unknown>(
    token: string,
    method: string,
    apiPath: string,
    body?: unknown,
  ): Promise<T | null> {
    const res = await fetch(`https://api.spotify.com/v1${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`spotify ${method} ${apiPath} → ${res.status}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  }
}
