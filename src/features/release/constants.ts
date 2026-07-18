// The public OSS mirror we watch for new releases. Self-hosters of a fork can repoint this.
export const RELEASE_REPO = "sneg55/warpdrive";
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

// GitHub asks unauthenticated callers to send a User-Agent; omitting it gets requests rejected.
export const RELEASE_FETCH_USER_AGENT = "warpdrive-version-check";
export const RELEASE_FETCH_TIMEOUT_MS = 10_000;

// Every 6 hours. GitHub's unauthenticated rate limit is 60/hour/IP, so this is negligible.
export const RELEASE_CHECK_CRON = "0 */6 * * *";

// localStorage key the banner writes the dismissed version to; keyed by version so a newer
// release re-shows the banner.
export const RELEASE_DISMISS_KEY = "warpdrive.dismissed_version";
