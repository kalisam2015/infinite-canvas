import { spawnSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ffmpegPath from "ffmpeg-static";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release", "windows-x64");
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

const pkg = path.join(root, "node_modules", ".bin", "pkg.cmd");
const result = spawnSync(pkg, [path.join(root, "dist", "index.js"), "--targets", "node20-win-x64", "--output", path.join(release, "InfiniteCanvasMedia.exe")], { cwd: root, stdio: "inherit", windowsHide: true });
if (result.status !== 0) process.exit(result.status || 1);
if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a Windows binary");
await copyFile(ffmpegPath, path.join(release, "ffmpeg.exe"));
await writeFile(path.join(release, "使用说明.txt"), "双击 InfiniteCanvasMedia.exe，复制窗口中的 Local URL 和 Connect token 到 Infinite Canvas 的视频合并窗口。请保持程序运行直到合成完成。\r\n", "utf8");
