import { NextRequest, NextResponse } from "next/server";
import {
  enterQueue,
  leaveQueue,
  statusQueue,
  withMatchQueue,
  type QueueView,
} from "@/lib/matchQueue";
import { QUEUE_RECIPIENT, verifyQueueSignature } from "@/lib/queueSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(
  body:
    | { ok: true; token?: string; view: QueueView; duplicate?: boolean }
    | { ok: false; error: string },
  status = 200,
) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    accountId?: string;
    publicKey?: string;
    message?: string;
    signature?: string;
    nonce?: string;
    recipient?: string;
    callbackUrl?: string;
    token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Missing queue request." }, 400);
  }

  const now = Date.now();

  if (body.action === "enter") {
    if (
      !body.accountId ||
      !body.publicKey ||
      !body.message ||
      !body.signature ||
      !body.nonce
    ) {
      return json({ ok: false, error: "Missing queue signature." }, 400);
    }
    const signed = await verifyQueueSignature({
      accountId: body.accountId,
      publicKey: body.publicKey,
      message: body.message,
      signature: body.signature,
      nonce: body.nonce,
      recipient: body.recipient ?? QUEUE_RECIPIENT,
      callbackUrl: body.callbackUrl,
      now,
    });
    if (!signed) {
      return json({ ok: false, error: "Queue signature was rejected." }, 401);
    }
    const result = await withMatchQueue((state) =>
      enterQueue(state, signed.accountId, now),
    );
    return json({
      ok: true,
      token: result.token,
      view: result.view,
      duplicate: result.duplicate,
    });
  }

  if (!body.token) {
    return json({ ok: false, error: "Missing queue token." }, 400);
  }

  if (body.action === "status") {
    const view = await withMatchQueue((state) =>
      statusQueue(state, body.token as string, now),
    );
    if (!view) return json({ ok: false, error: "Queue session expired." }, 404);
    return json({ ok: true, view });
  }

  if (body.action === "leave") {
    await withMatchQueue((state) => leaveQueue(state, body.token as string, now));
    return json({ ok: true, view: { status: "expired" } });
  }

  return json({ ok: false, error: "Unknown queue action." }, 400);
}
