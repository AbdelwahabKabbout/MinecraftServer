import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RawProcessMetrics {
  /** CPU seconds consumed by the process (cumulative). */
  cpuSeconds: number;
  /** Resident memory in bytes. */
  memoryBytes: number;
}

/**
 * Reads cumulative CPU time and resident memory for a process. Implemented for
 * the platforms the manager targets; returns null on anything else (metrics
 * simply are not collected).
 */
export async function readProcessMetrics(pid: number): Promise<RawProcessMetrics | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === "linux") {
      return readLinuxProc(pid);
    }
    if (process.platform === "win32") {
      return await readWindowsProcess(pid);
    }
    return null;
  } catch {
    return null;
  }
}

function readLinuxProc(pid: number): RawProcessMetrics | null {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  const cpuSeconds = parseCpuSecondsFromStat(stat, 100);
  const rssKb = parseVmRssKb(status);
  if (cpuSeconds === null || rssKb === null) return null;
  return { cpuSeconds, memoryBytes: rssKb * 1024 };
}

/** `ps` metadata for a single Windows process: `CPUseconds WorkingSetBytes`. */
async function readWindowsProcess(pid: number): Promise<RawProcessMetrics | null> {
  const script = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | ForEach-Object { "{0} {1}" -f $_.CPU, $_.WorkingSet64 }`;
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 16 * 1024,
  });
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const cpuSeconds = Number(parts[0]);
  const memoryBytes = Number(parts[1]);
  if (!Number.isFinite(cpuSeconds) || !Number.isFinite(memoryBytes)) return null;
  return { cpuSeconds, memoryBytes };
}

/**
 * Parses CPU seconds (utime + stime) from `/proc/<pid>/stat`. The comm field
 * may contain spaces and parentheses, so only the last `)` is used as the
 * boundary. `clkTck` is the number of clock ticks per second
 * (`sysconf(_SC_CLK_TCK)`, 100 on typical Linux).
 */
export function parseCpuSecondsFromStat(statText: string, clkTck = 100): number | null {
  const close = statText.lastIndexOf(")");
  if (close === -1) return null;
  const rest = statText.slice(close + 1).trim().split(/\s+/);
  // After `(comm)`: state(3) ppid(4) ... cmajflt(13) utime(14) stime(15).
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
  return (utime + stime) / clkTck;
}

export function parseVmRssKb(statusText: string): number | null {
  const match = /^VmRSS:\s+(\d+)\s+kB\s*$/m.exec(statusText);
  if (!match) return null;
  const kb = Number(match[1]);
  return Number.isFinite(kb) ? kb : null;
}

/** Percentage CPU used between two samples, clamped to [0, 100]. */
export function computeCpuPercent(prevCpuSec: number, nowCpuSec: number, prevSec: number, nowSec: number): number {
  const deltaSec = nowSec - prevSec;
  if (deltaSec <= 0 || nowCpuSec < prevCpuSec) return 0;
  const percent = ((nowCpuSec - prevCpuSec) / deltaSec) * 100;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

export function bytesToMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}