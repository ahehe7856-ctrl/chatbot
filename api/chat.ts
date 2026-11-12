import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'node:path';

export interface VercelRequest extends IncomingMessage {
  body?: any;
  query?: { [key: string]: string | string[] };
}

export interface VercelResponse extends ServerResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  send: (body: any) => VercelResponse;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 챗봇의 시스템 프롬프트 상수
 * 사용자의 요구사항에 따라 쉽게 수정할 수 있도록 분리되어 있습니다.
 */
export const SYSTEM_PROMPT = `당신은 친절하고 유능한 '영어 단어 퀴즈 챗봇'입니다.
사용자가 원하는 주제나 난이도에 맞추어 영어 단어를 학습시키고 짧은 복습 퀴즈를 출제합니다.

다음 규칙을 엄격하게 준수하세요:
1. 답변은 한국어로 간결하고 친절하게 작성하세요.
2. 사용자가 학습할 주제(예: 여행, 비즈니스, 일상 회화 등)나 난이도(초급, 중급, 고급 등)를 말하지 않았다면, 단어를 바로 제시하지 말고 필요한 정보(주제나 난이도)를 먼저 다정하게 물어보세요.
3. 사용자가 주제나 난이도를 제시하면, 관련된 영어 단어를 한 번에 최대 3개만 알려주세요.
4. 각 단어마다 다음 형식을 갖추어 보여주세요:
   - 단어와 품사
   - 한국어 뜻
   - 짧은 영어 예문 및 한국어 번역
5. 단어 소개 마지막에는 오늘 배운 단어를 복습할 수 있는 퀴즈를 딱 1개만 내주세요 (객관식 또는 빈칸 채우기 등).
6. 사용자가 퀴즈 답을 입력하면, 정답 여부와 해설을 짧게 알려주고 다음 학습을 이어갈 수 있도록 안내하세요.`;

/**
 * API Key를 안전하게 로드하는 헬퍼 함수
 * 1. process.env.OPENAI_API_KEY
 * 2. 로컬 개발 환경의 .env.local 파일 직접 탐색 (dev 서버 재시작 없이도 즉시 반영)
 */
function getApiKey(): string | undefined {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, 'utf-8');
      const match = content.match(/^\s*OPENAI_API_KEY\s*=\s*(.*)\s*$/m);
      if (match && match[1]) {
        const cleaned = match[1].trim().replace(/^["']|["']$/g, '');
        if (cleaned) {
          process.env.OPENAI_API_KEY = cleaned;
          return cleaned;
        }
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}

/**
 * OpenAI Responses API 응답에서 텍스트를 추출하는 헬퍼 함수
 */
function extractResponseText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item?.content)) {
        for (const block of item.content) {
          if (block?.type === 'output_text' && typeof block?.text === 'string') {
            return block.text;
          }
          if (typeof block?.text === 'string') {
            return block.text;
          }
        }
      }
    }
  }

  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 및 메서드 확인
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'POST 요청만 지원합니다.',
    });
  }

  // API Key 확인 (서버 환경 변수 OPENAI_API_KEY에서 읽음)
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY_MISSING',
      message: '서버 환경 변수 OPENAI_API_KEY가 설정되지 않았습니다. .env.local 파일에 OpenAI API 키를 입력해 주세요.',
    });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'messages 배열이 비어있거나 형식이 올바르지 않습니다.',
      });
    }

    // OpenAI Responses API 규격에 맞는 input 생성
    const inputPayload = messages.map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

    // OpenAI Responses API 호출 (gpt-6-luna, reasoning.effort: none)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-6-luna',
        instructions: SYSTEM_PROMPT,
        input: inputPayload,
        reasoning: {
          effort: 'none',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // text format error
      }

      console.error('OpenAI Responses API 에러:', response.status, errorText);

      return res.status(response.status).json({
        error: 'OPENAI_API_ERROR',
        message: errorJson?.error?.message || `OpenAI API 호출 실패 (${response.status})`,
        details: errorJson,
      });
    }

    const data = await response.json();
    const replyText = extractResponseText(data);

    if (!replyText) {
      console.warn('응답 텍스트 추출 실패, 응답 원본:', JSON.stringify(data));
      return res.status(502).json({
        error: 'EMPTY_RESPONSE',
        message: 'OpenAI 모델로부터 유효한 텍스트 답변을 받지 못했습니다.',
        raw: data,
      });
    }

    return res.status(200).json({
      reply: replyText,
      usage: data?.usage,
    });
  } catch (error: any) {
    console.error('서버 내부 에러:', error);
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error?.message || '서버 내부 오류가 발생했습니다.',
    });
  }
}
