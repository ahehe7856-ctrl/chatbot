export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ChatApiResponse {
  reply: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
  message?: string;
}

/**
 * Vercel 서버리스 함수(/api/chat)로 메시지 목록을 전송하고 AI 답변을 받아옵니다.
 * 프런트엔드에서는 OpenAI API를 직접 호출하지 않고 보안을 위해 /api/chat만 호출합니다.
 */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const payload = messages.map(({ role, content }) => ({ role, content }));

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: payload }),
  });

  const data: ChatApiResponse = await response.json().catch(() => ({
    reply: '',
    error: 'PARSE_ERROR',
    message: '서버 응답을 분석할 수 없습니다.',
  }));

  if (!response.ok) {
    if (data.error === 'OPENAI_API_KEY_MISSING') {
      throw new Error(
        '서버에 OPENAI_API_KEY가 설정되지 않았습니다.\n로컬 환경이라면 프로젝트 루트의 .env.local 파일에 API 키를 입력해 주세요.'
      );
    }
    throw new Error(data.message || `API 요청에 실패했습니다. (상태 코드: ${response.status})`);
  }

  if (!data.reply) {
    throw new Error('챗봇으로부터 답변을 수신하지 못했습니다.');
  }

  return data.reply;
}

