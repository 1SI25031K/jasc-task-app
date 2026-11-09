import { NextRequest, NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/server-guard";
import { getTodayJST } from "@/lib/time";
import {
  buildAiSearchContext,
  checkAiSearchRateLimit,
  AI_SEARCH_SYSTEM_PROMPT,
  extractGroundedTaskIds,
  logAiQueryToSheet,
  AiSearchRateLimitError,
} from "@/lib/ai-search";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let queryId = `Q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let memberId = "";
  let queryText = "";
  let spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || process.env.SPREADSHEET_ID || "";

  try {
    // 1. 認証と active=TRUE メンバー検証（S1）
    const { member, data } = await requireActiveMember();
    memberId = member.memberId;

    // 2. リクエストボディの検証
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body.query || "").trim();
    if (!rawQuery) {
      return NextResponse.json({ error: "質問内容を入力してください。" }, { status: 400 });
    }
    if (rawQuery.length > 1000) {
      return NextResponse.json(
        { error: "質問内容は 1,000 文字以内で入力してください。" },
        { status: 400 }
      );
    }
    queryText = rawQuery;

    // 3. 機能フラグ（feature_ai_search）の確認
    // FALSE の場合は AI 呼び出しを行わず、安全にフォールバック（通常の検索結果のみ表示）
    const isAiEnabled = (data.settings["feature_ai_search"] || "").trim().toUpperCase() === "TRUE";
    if (!isAiEnabled) {
      return NextResponse.json({
        enabled: false,
        fallback: true,
        message: "AI 検索機能は現在準備中です。通常のキーワード検索結果を表示しています。",
      });
    }

    // 4. レートリミット（S13 / settingsシートから動的設定可能）
    const perMinute = parseInt(data.settings["rate_limit_ai_search_per_minute"] || "5", 10) || 5;
    const perDay = parseInt(data.settings["rate_limit_ai_search_per_day"] || "50", 10) || 50;

    try {
      checkAiSearchRateLimit(member.memberId, { perMinute, perDay });
    } catch (err: any) {
      if (err instanceof AiSearchRateLimitError) {
        if (spreadsheetId) {
          await logAiQueryToSheet({
            spreadsheetId,
            queryId,
            memberId,
            queryText,
            groundedTaskIds: [],
            status: "RATE_LIMITED",
            errorMessage: err.message,
          });
        }
        return NextResponse.json(
          { error: err.message, status: "RATE_LIMITED" },
          { status: 429 }
        );
      }
      throw err;
    }

    // 5. コンテキスト生成（S12 / 個人情報マスキング＆厳格なホワイトリスト適用）
    const today = getTodayJST();
    const context = buildAiSearchContext({
      query: rawQuery,
      currentMember: {
        memberId: member.memberId,
        displayName: member.displayName,
      },
      tasks: data.tasks,
      members: data.members,
      roles: data.roles,
      checkins: data.checkins,
      today,
    });

    queryText = context.maskedQuery;
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    // 6. Gemini API 未設定時のフォールバックストリーミング（ローカル検証・CI用）
    if (!apiKey) {
      const activeTasks = data.tasks.filter((t) => !t.archived);
      const matched = activeTasks.filter(
        (t) =>
          t.title.toLowerCase().includes(rawQuery.toLowerCase()) ||
          t.nextAction.toLowerCase().includes(rawQuery.toLowerCase())
      );

      let mockText = "";
      if (matched.length > 0) {
        mockText = `質問「${context.maskedQuery}」に関連するタスクを ${matched.length} 件見つけました。\n\n`;
        matched.slice(0, 3).forEach((t) => {
          mockText += `- [TASK:${t.taskId}] **${t.title}** (状態: ${t.status}, 期限: ${t.taskDue || "未定"})\n  - 次のアクション: ${t.nextAction || "未設定"}\n`;
        });
        mockText += `\n詳細は各タスクのチップをクリックしてご確認ください。`;
      } else {
        mockText = `質問「${context.maskedQuery}」について、提供されたデータの中には該当するタスクや情報が見つかりませんでした。別のキーワードでお試しください。`;
      }

      const groundedTaskIds = extractGroundedTaskIds(mockText, context.validTaskIds);
      if (spreadsheetId) {
        await logAiQueryToSheet({
          spreadsheetId,
          queryId,
          memberId,
          queryText,
          groundedTaskIds,
          status: "SUCCESS",
        });
      }

      // ReadableStream でモックストリーミング
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const words = mockText.split(" ");
          for (let i = 0; i < words.length; i++) {
            const piece = (i > 0 ? " " : "") + words[i];
            controller.enqueue(encoder.encode(piece));
            await new Promise((r) => setTimeout(r, 20));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "X-Grounded-Tasks": groundedTaskIds.join(","),
        },
      });
    }

    // 7. Gemini API 呼び出し（SSE ストリーミング）
    const isDriveSearchEnabled =
      (data.settings["feature_drive_file_search"] || "").trim().toUpperCase() === "TRUE";
    const storeName =
      (data.settings["gemini_file_search_store_name"] || "").trim() ||
      process.env.GEMINI_FILE_SEARCH_STORE_NAME ||
      "";

    const payload: any = {
      system_instruction: {
        parts: [{ text: AI_SEARCH_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: context.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    };

    // Google Drive File Search Tool の統合（F21）
    if (isDriveSearchEnabled && storeName) {
      payload.tools = [
        {
          file_search: {
            file_search_store_names: [storeName],
          },
        },
      ];
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!geminiRes.ok || !geminiRes.body) {
      const errText = await geminiRes.text();
      console.error("[AiSearch] Gemini API stream error:", geminiRes.status, errText);
      if (spreadsheetId) {
        await logAiQueryToSheet({
          spreadsheetId,
          queryId,
          memberId,
          queryText,
          groundedTaskIds: [],
          status: "ERROR",
          errorMessage: `Gemini API Error: ${geminiRes.status}`,
        });
      }
      return NextResponse.json(
        { error: "AI アシスタントへの接続に失敗しました。後ほど再試行してください。" },
        { status: 502 }
      );
    }

    // 8. SSE レスポンスをパースして純粋なテキストチャンクをクライアントへ転送
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);
              const partText =
                data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (partText) {
                accumulatedText += partText;
                controller.enqueue(encoder.encode(partText));
              }
            } catch {
              // JSON パースエラーは無視して継続
            }
          }
        }
      },
      async flush() {
        // ストリーム完了時にログ保存（S12: 回答本文は保存せず、引用した task_id のみ保存）
        const groundedTaskIds = extractGroundedTaskIds(
          accumulatedText,
          context.validTaskIds
        );
        if (spreadsheetId) {
          await logAiQueryToSheet({
            spreadsheetId,
            queryId,
            memberId,
            queryText,
            groundedTaskIds,
            status: "SUCCESS",
          });
        }
      },
    });

    const responseStream = geminiRes.body.pipeThrough(transformStream);

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: any) {
    console.error("[AiSearch] Unhandled exception:", err);
    if (spreadsheetId && memberId) {
      await logAiQueryToSheet({
        spreadsheetId,
        queryId,
        memberId,
        queryText: queryText || "unknown",
        groundedTaskIds: [],
        status: "ERROR",
        errorMessage: err?.message || String(err),
      });
    }
    return NextResponse.json(
      { error: err?.message || "予期せぬエラーが発生しました。" },
      { status: 500 }
    );
  }
}

