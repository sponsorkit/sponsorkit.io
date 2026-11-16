/** Opening the system browser without a shell. */
import { spawn } from "node:child_process";

/** The command used to open a URL on `platform`. The URL is passed as a single argv entry, never through a shell. */
export function browserCommand(url: string, platform: string = process.platform): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  // rundll32 hands the URL to the default handler without cmd.exe parsing (unlike `cmd /c start`).
  if (platform === "win32") return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  return { command: "xdg-open", args: [url] };
}

/** Opens `url` (http/https only) in the system browser. Rejects if no opener could be started. */
export function openSystemBrowser(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`Invalid URL: ${url}`));
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return Promise.reject(new Error(`Refusing to open ${parsed.protocol} URL`));
  const { command, args } = browserCommand(parsed.href);
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { stdio: "ignore", detached: true, shell: false, windowsHide: true });
    } catch (e) {
      reject(e);
      return;
    }
    // Openers exit quickly; a non-zero exit (e.g. xdg-open without a browser) counts as failure.
    // If the opener is still running after a moment, assume the browser is opening.
    const timer = setTimeout(() => {
      child.unref();
      resolve();
    }, 1500);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
