import { readdir, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import mime from "mime";

const port = Number(Bun.env.PORT ?? 3001);
const publicRoot = resolve(import.meta.dir, "..", "public");
const streamsRoot = resolve(import.meta.dir, "..", "streams");

const HLS_CONTENT_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function getCacheControl(filePath: string): string {
  const extension = extname(filePath);

  if (extension === ".m3u8") {
    return "public, max-age=0, must-revalidate";
  }

  if (extension === ".ts") {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }

  return "public, max-age=300";
}

function getContentType(filePath: string): string {
  const extension = extname(filePath);

  return HLS_CONTENT_TYPES[extension] ?? mime.getType(filePath) ?? "application/octet-stream";
}

function safeResolve(baseDir: string, requestPath: string): string | null {
  if (!requestPath || requestPath.endsWith("/") || requestPath.includes("\0")) {
    return null;
  }

  const targetPath = resolve(baseDir, requestPath);
  const relativePath = relative(baseDir, targetPath);

  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return null;
  }

  return targetPath;
}

async function collectPlaylists(currentDir: string, relativeDir = ""): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const playlists: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nextRelativeDir = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      playlists.push(...(await collectPlaylists(resolve(currentDir, entry.name), nextRelativeDir)));
      continue;
    }

    if (!entry.isFile() || entry.name !== "master.m3u8") {
      continue;
    }

    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    playlists.push(`/streams/${relativePath}`);
  }

  return playlists.sort();
}

async function playlistsResponse(): Promise<Response> {
  try {
    const playlists = await collectPlaylists(streamsRoot);
    return Response.json({ playlists });
  } catch (error) {
    console.error(error);
    return Response.json({ playlists: [] }, { status: 500 });
  }
}

async function fileResponse(baseDir: string, requestPath: string): Promise<Response> {
  const resolvedPath = safeResolve(baseDir, requestPath);

  if (!resolvedPath) {
    return new Response("Not found", { status: 404 });
  }

  const file = Bun.file(resolvedPath);

  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  const fileStat = await stat(resolvedPath);

  if (!fileStat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "accept-ranges": "bytes",
      "cache-control": getCacheControl(resolvedPath),
      "content-type": getContentType(resolvedPath),
      "access-control-allow-origin": "*",
    },
  });
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return fileResponse(publicRoot, "index.html");
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/streams") {
      return playlistsResponse();
    }

    if (url.pathname.startsWith("/streams/")) {
      const relativePath = url.pathname.replace(/^\/streams\//, "");
      return fileResponse(streamsRoot, relativePath);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    return fileResponse(publicRoot, url.pathname.replace(/^\/+/, ""));
  },
  error(error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  },
});

console.log(`HLS demo server listening on http://localhost:${server.port}`);
console.log("Put generated playlists and segments under ./streams, then open / in your browser.");
