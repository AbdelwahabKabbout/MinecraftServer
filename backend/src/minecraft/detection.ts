import fs from "node:fs";
import path from "node:path";
import { parseBoolean } from "./serverProperties.js";

export const FABRIC_LAUNCHER_PATTERN = /fabric-server-(?:mc-)?[^/\\]*?-launcher\.jar/i;
export const SERVER_JAR_NAME = /server\.jar$/i;

export interface DetectionReport {
  directory: string;
  exists: boolean;
  /** JAR files found in the directory. */
  jars: string[];
  /** Preferred launch jar (fabric launcher first, then server.jar), if any. */
  serverJar: string | null;
  hasServerProperties: boolean;
  serverPropertiesPath: string | null;
  eulaPresent: boolean;
  eulaAgreed: boolean;
  hasModsDir: boolean;
  hasConfigDir: boolean;
  hasWorldDir: boolean;
  hasLogsDir: boolean;
  hasCrashReportsDir: boolean;
  /** Human-readable notes (e.g. "eula.txt is missing"). */
  notes: string[];
  /** Missing requirements that prevent the server from launching. */
  blockingMissing: string[];
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function detectServerDirectory(directory: string): DetectionReport {
  const report: DetectionReport = {
    directory,
    exists: isDir(directory),
    jars: [],
    serverJar: null,
    hasServerProperties: false,
    serverPropertiesPath: null,
    eulaPresent: false,
    eulaAgreed: false,
    hasModsDir: false,
    hasConfigDir: false,
    hasWorldDir: false,
    hasLogsDir: false,
    hasCrashReportsDir: false,
    notes: [],
    blockingMissing: [],
  };

  if (!report.exists) {
    report.blockingMissing.push("directory does not exist");
    report.notes.push(`Directory ${directory} does not exist.`);
    return report;
  }

  try {
    const entries = fs.readdirSync(directory);
    report.jars = entries.filter((e) => /\.jar$/i.test(e)).sort();

    const fabricLauncher = report.jars.find((j) => FABRIC_LAUNCHER_PATTERN.test(j));
    const serverJar = report.jars.find((j) => SERVER_JAR_NAME.test(j));
    report.serverJar = fabricLauncher ?? serverJar ?? null;

    if (!report.serverJar) {
      report.blockingMissing.push("server jar (e.g. fabric-server-*-launcher.jar or server.jar)");
      report.notes.push(
        report.jars.length
          ? `No recognizable server jar. Found: ${report.jars.join(", ")}`
          : "No JAR files found in the directory.",
      );
    }
  } catch {
    report.blockingMissing.push("directory is not readable");
  }

  const propsPath = path.join(directory, "server.properties");
  report.hasServerProperties = isFile(propsPath);
  report.serverPropertiesPath = report.hasServerProperties ? propsPath : null;
  if (!report.hasServerProperties) {
    report.notes.push("server.properties is missing. It will be created on first launch.");
  }

  const eulaPath = path.join(directory, "eula.txt");
  report.eulaPresent = isFile(eulaPath);
  if (report.eulaPresent) {
    try {
      report.eulaAgreed = parseBoolean(
        fs.readFileSync(eulaPath, "utf8").split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("eula="))?.split("=")[1]?.trim(),
      ) === true;
    } catch {
      report.eulaAgreed = false;
    }
  } else {
    report.blockingMissing.push("eula.txt (set eula=true to accept the EULA)");
    report.notes.push("eula.txt is missing. Minecraft will refuse to start until the EULA is accepted.");
  }
  if (report.eulaPresent && !report.eulaAgreed) {
    report.blockingMissing.push("eula=true in eula.txt");
  }

  report.hasModsDir = isDir(path.join(directory, "mods"));
  report.hasConfigDir = isDir(path.join(directory, "config"));
  report.hasWorldDir = isDir(path.join(directory, "world"));
  report.hasLogsDir = isDir(path.join(directory, "logs"));
  report.hasCrashReportsDir = isDir(path.join(directory, "crash-reports"));

  return report;
}