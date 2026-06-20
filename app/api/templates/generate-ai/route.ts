import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { asRecord } from "@/lib/tsSafe";
import {
  generateTemplateAiContent,
  TemplateAiGenerationError,
} from "@/lib/templateAiGeneration";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;

    const body = asRecord(await req.json().catch(() => ({})) as unknown);
    const generated = await generateTemplateAiContent({
      supabase,
      userId: user.id,
      input: body,
    });

    return NextResponse.json(generated);
  } catch (e) {
    if (e instanceof TemplateAiGenerationError) {
      return NextResponse.json(
        {
          error: e.message,
          ...(e.code ? { code: e.code } : {}),
        },
        { status: e.status, headers: e.headers },
      );
    }

    console.error("templates/generate-ai", e);
    return NextResponse.json({ error: "La génération IA n’a pas pu aboutir." }, { status: 500 });
  }
}
