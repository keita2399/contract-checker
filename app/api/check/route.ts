import { NextRequest, NextResponse } from "next/server";
import { logUsage } from "@/lib/logUsage";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const SYSTEM_PROMPT = `あなたは契約書レビューの専門AIです。契約書の画像を読み取り、フリーランス・個人事業主にとって不利な条項やリスクを検出してください。

## 出力形式（必ずこのJSON形式で）
{
  "document_type": "契約書の種類（業務委託契約、秘密保持契約、売買契約等）",
  "parties": {
    "party_a": "甲の名称",
    "party_b": "乙の名称"
  },
  "contract_date": "契約日（YYYY-MM-DD or 不明）",
  "contract_period": "契約期間の記述",
  "summary": "契約書の概要（2-3文）",
  "overall_risk": "HIGH / MEDIUM / LOW",
  "risk_score": 0.0,
  "clauses": [
    {
      "article": "第X条",
      "title": "条項のタイトル",
      "original_text": "原文（該当部分を抜粋）",
      "risk_level": "HIGH / MEDIUM / LOW / SAFE",
      "issue": "この条項の何が問題か（日本語で具体的に）",
      "recommendation": "こう修正すべき（具体的な対案）",
      "category": "リスクカテゴリ（下記参照）"
    }
  ],
  "missing_clauses": [
    {
      "title": "欠落している条項のタイトル",
      "risk_level": "HIGH / MEDIUM / LOW",
      "reason": "なぜ必要か",
      "recommendation": "追加すべき内容"
    }
  ],
  "warnings": ["その他の注意事項"]
}

## リスクカテゴリと検出ルール

### HIGH（赤 — 必ず確認）
- **自動更新**: 「自動的に更新される」「異議なき場合は更新」→ 解約忘れで縛られるリスク
- **高額違約金**: 契約金額に対して不相応な違約金、損害賠償の予定額
- **無制限の損害賠償**: 「一切の損害を賠償する」「間接損害を含む」→ 上限なしは危険
- **知的財産権の全譲渡**: 「一切の権利は甲に帰属」→ ポートフォリオにも使えなくなる
- **競業避止義務**: 「X年間は同業他社と取引しない」→ 生計に直結
- **一方的な解除権**: 甲のみが即時解除可能で、乙には認められていない
- **報酬の一方的減額**: 甲が報酬を減額できる条項
- **成果物の無限修正義務**: 「甲の満足するまで修正する」→ 際限がない

### MEDIUM（黄 — 確認推奨）
- **支払条件**: 支払日が60日超、検収後支払で検収期限が不明確
- **秘密保持の範囲**: 秘密情報の定義が曖昧すぎる（「甲が指定する一切の情報」等）
- **再委託禁止**: フリーランスのチーム体制を制限
- **契約不適合責任**: 保証期間が1年超
- **管轄裁判所**: 遠方の裁判所が指定されている

### LOW（青 — 参考情報）
- **一般的な条項**: 標準的な表現で特に問題なし
- **軽微な注意点**: 確認しておいた方がよい程度

### 欠落チェック（契約書に含まれるべきなのに欠けている条項）
- 報酬額・支払条件
- 契約期間・更新条件
- 解除条件（双方）
- 秘密保持
- 知的財産権の帰属
- 損害賠償の上限
- 反社会的勢力の排除

## 注意事項
- risk_score は 0.0（安全）〜 1.0（極めて危険）で算出
- HIGH条項が1つでもあれば risk_score は 0.6 以上
- 読み取れない文字がある場合は warningsに記載
- 法的助言ではなくリスク検出であることを明示
- 推測禁止: 読めない箇所は「不明」とし、推測で補完しない
- JSON以外の文字は一切出力しないこと`;

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { image, mimeType, pages } = await req.json();
    if (!image || !mimeType) {
      return NextResponse.json({ error: "image and mimeType are required" }, { status: 400 });
    }

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0.1,
      apiKey: process.env.GEMINI_API_KEY,
    });

    const imageContent: Array<{ type: "image_url"; image_url: { url: string } }> = pages
      ? (pages as string[]).map((pageData: string) => ({
          type: "image_url" as const,
          image_url: { url: `data:image/png;base64,${pageData}` },
        }))
      : [{ type: "image_url" as const, image_url: { url: `data:${mimeType};base64,${image}` } }];

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage({ content: imageContent }),
    ]);

    const raw = typeof response.content === "string" ? response.content : String(response.content);
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    logUsage({
      project: "contract-checker",
      model: "gemini-2.5-flash",
      inputTokens: response.usage_metadata?.input_tokens ?? 0,
      outputTokens: response.usage_metadata?.output_tokens ?? 0,
    });

    let contractData;
    try {
      contractData = JSON.parse(text);
    } catch {
      console.error("JSON parse error. Raw response:", raw);
      return NextResponse.json({ error: "AIの応答をJSONとして解析できませんでした", detail: raw.slice(0, 500) }, { status: 500 });
    }
    return NextResponse.json(contractData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Check error:", message);
    return NextResponse.json({ error: "Failed to process contract", detail: message }, { status: 500 });
  }
}
