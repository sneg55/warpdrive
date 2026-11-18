const RELEASE_REPO = "sneg55/warpdrive";
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

export const RELEASE_FETCH_USER_AGENT = "warpdrive-version-check";
export const RELEASE_FETCH_TIMEOUT_MS = 10_000;

export const RELEASE_CHECK_CRON = "0 */6 * * *";

export const RELEASE_DISMISS_KEY = "warpdrive.dismissed_version";
