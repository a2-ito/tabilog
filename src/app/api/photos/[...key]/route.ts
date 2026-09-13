import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/cloudflare";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[...key]">) {
	const session = await auth();
	if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

	const { key } = await ctx.params;
	const objectKey = key.join("/");
	// バケット内の想定外のパスは辿らせない
	if (!objectKey.startsWith("trips/")) return new NextResponse("Not Found", { status: 404 });

	const env = await getEnv();
	const object = await env.PHOTOS_BUCKET.get(objectKey);
	if (!object) return new NextResponse("Not Found", { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "private, max-age=86400");
	return new Response(object.body, { headers });
}
