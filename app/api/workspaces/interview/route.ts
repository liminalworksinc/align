import { checkCreateCode } from "@/lib/create-access";
import { cappedJson, handle, requireJson } from "@/lib/http";
import { InterviewRequest, checkConversation, interviewEnabled, interviewTurn, takeInterviewTurn } from "@/lib/interview";
import { clientOf } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";

// One turn of the intake interview on /new (lib/interview.ts). Same entry rule as creating a workspace: the
// person's own unspent invite code (or open create / Mode L's code), checked read-only, never spent here and never
// sent to the model. Answers 404 when the interviewer is off, so the route looks absent; the same-site check runs
// first, so another site's request is refused 403 either way and learns nothing about whether it's on.
export async function POST(req: Request) {
  return handle(async () => {
    requireJson(req);
    if (!interviewEnabled()) throw new HttpError(404, "Not found");
    const parsed = InterviewRequest.safeParse(await cappedJson(req, 48 * 1024, "This conversation is too long"));
    if (!parsed.success) throw new HttpError(400, "Send the conversation as {messages: [{role, text}]}");
    const client = clientOf(req);
    await checkCreateCode(client, parsed.data.signup_code);
    checkConversation(parsed.data.messages);
    takeInterviewTurn(client, parsed.data.signup_code ?? "");
    const out = await interviewTurn(parsed.data.messages);
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  });
}
