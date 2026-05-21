import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function POST(req) {
  const { question } = await req.json();

  if (!question) {
    return NextResponse.json({ error: "質問がありません" }, { status: 400 });
  }

  try {
    // ① 質問をベクター化
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: question,
    });
    const vector = embeddingRes.data[0].embedding;

    // ② Pineconeで類似検索
    const index = pc.index(process.env.PINECONE_INDEX_NAME || "book-index");
    const results = await index.query({
      vector,
      topK: 3,
      includeMetadata: true,
    });

    const context = results.matches
      .map((m) => m.metadata?.text || "")
      .join("\n\n");

    console.log("取得したコンテキスト文字数:", context.length);
    console.log("コンテキスト内容:", context.substring(0, 300));
    // ③ GPT-4oで回答生成
    const prompt = `以下の【参考文章】は書籍の一部です。
この内容を元に【質問】に答えてください。
参考文章から読み取れる情報を積極的に使って答えてください。
どうしても参考文章に全く関係ない質問の場合だけ「この書籍には記載がありません」と答えてください。

【参考文章】
${context}

【質問】
${question}

【回答】`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const answer = res.choices[0].message.content;
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("エラー:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
