import { NextRequest, NextResponse } from "next/server";

const BACKEND_INTERNAL_URL = (
  process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080"
).replace(/\/+$/, "");

export async function proxyToBackend(
  request: NextRequest,
  targetPath: string
): Promise<NextResponse> {
  const incomingUrl = new URL(request.url);
  const targetUrl = `${BACKEND_INTERNAL_URL}${targetPath}${incomingUrl.search}`;

  const headers = new Headers();
  const forwardHeaderNames = [
    "accept",
    "content-type",
    "cookie",
    "x-admin-token",
    "user-agent",
  ];

  for (const name of forwardHeaderNames) {
    const val = request.headers.get(name);
    if (val) {
      headers.set(name, val);
    }
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") ||
    incomingUrl.protocol.replace(":", "");
  headers.set("x-forwarded-proto", forwardedProto);

  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const backendRes = await fetch(targetUrl, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      cache: "no-store",
    });

    const resHeaders = new Headers();
    const contentType = backendRes.headers.get("content-type");
    if (contentType) {
      resHeaders.set("content-type", contentType);
    }
    const cacheControl = backendRes.headers.get("cache-control");
    if (cacheControl) {
      resHeaders.set("cache-control", cacheControl);
    }

    const setCookies =
      typeof backendRes.headers.getSetCookie === "function"
        ? backendRes.headers.getSetCookie()
        : [];
    if (setCookies.length > 0) {
      for (const c of setCookies) {
        resHeaders.append("set-cookie", c);
      }
    } else {
      const singleCookie = backendRes.headers.get("set-cookie");
      if (singleCookie) {
        resHeaders.set("set-cookie", singleCookie);
      }
    }

    const payload = await backendRes.arrayBuffer();
    return new NextResponse(payload, {
      status: backendRes.status,
      headers: resHeaders,
    });
  } catch {
    return NextResponse.json(
      { detail: "Internal Rust backend is starting or unavailable" },
      { status: 502 }
    );
  }
}
