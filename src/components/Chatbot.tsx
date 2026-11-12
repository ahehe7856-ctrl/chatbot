import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { sendChatMessage, type ChatMessage } from '../api/chat';
import './Chatbot.css';

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  content: `안녕하세요! 🎓 **영어 단어 퀴즈 챗봇**입니다.

원하시는 **주제**(예: 여행, 비즈니스, 일상 회화, IT 등)나 **난이도**(초급, 중급, 고급)를 입력해 주세요!

맞춤 단어 3개와 뜻, 짧은 예문, 그리고 마지막에 함께 풀어볼 1개의 복습 퀴즈를 준비해 드릴게요. 😊`,
  timestamp: Date.now(),
};

const QUICK_PROMPTS = [
  '✈️ 여행 영어 (초급)',
  '💼 비즈니스 미팅 (중급)',
  '☕ 카페/식당 일상 표현 (초급)',
  '💻 IT & 개발 용어 (중급)',
  '📚 토익 빈출 어휘 (고급)',
];

export function Chatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 자동 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // 메시지 전송 로직
  const handleSend = async (textToSend?: string) => {
    const content = (textToSend ?? input).trim();
    if (!content || isLoading) return;

    setErrorMessage(null);
    setInput('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const replyText = await sendChatMessage(newMessages);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorMessage(err.message || '답변을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      // 전송 후 입력창 포커스
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  // 엔터 키 입력 처리 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 대화 초기화
  const handleReset = () => {
    if (window.confirm('대화 내용을 초기화하고 처음부터 다시 시작하시겠습니까?')) {
      setMessages([INITIAL_MESSAGE]);
      setInput('');
      setErrorMessage(null);
    }
  };

  return (
    <div className="chatbot-container">
      {/* 챗봇 헤더 */}
      <header className="chatbot-header">
        <div className="chatbot-header-info">
          <span className="chatbot-header-icon" role="img" aria-label="Vocab Bot">
            📖
          </span>
          <div>
            <h1 className="chatbot-header-title">영어 단어 퀴즈 챗봇</h1>
            <p className="chatbot-header-subtitle">
              주제와 난이도를 알려주시면 단어 3개와 복습 퀴즈를 출제합니다
            </p>
          </div>
        </div>
        <button
          type="button"
          className="chatbot-reset-btn"
          onClick={handleReset}
          title="새로운 주제로 다시 시작"
        >
          🔄 새로고침
        </button>
      </header>

      {/* 추천 퀵 칩 */}
      <div className="chatbot-quick-chips">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="chatbot-quick-chip"
            disabled={isLoading}
            onClick={() => handleSend(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* 에러 메시지 알림 배너 */}
      {errorMessage && (
        <div className="chatbot-error-banner" role="alert">
          <div>
            <strong>오류 안내:</strong>
            <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{errorMessage}</p>
          </div>
          <button
            type="button"
            className="chatbot-error-close"
            onClick={() => setErrorMessage(null)}
            aria-label="에러 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="chatbot-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chatbot-message-wrapper ${msg.role === 'user' ? 'user' : 'assistant'}`}
          >
            {msg.role === 'assistant' && (
              <div className="chatbot-avatar" aria-hidden="true">
                🤖
              </div>
            )}
            <div className="chatbot-message-bubble">{msg.content}</div>
          </div>
        ))}

        {/* 로딩 인디케이터 */}
        {isLoading && (
          <div className="chatbot-message-wrapper assistant">
            <div className="chatbot-avatar" aria-hidden="true">
              🤖
            </div>
            <div className="chatbot-message-bubble">
              <span style={{ marginRight: '8px', fontSize: '0.88rem', color: '#6b7280' }}>
                단어와 퀴즈를 준비하고 있습니다
              </span>
              <div className="chatbot-loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <form
        className="chatbot-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          ref={textareaRef}
          className="chatbot-input-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="주제(예: 여행, 요리)나 난이도(초급/중급)를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
          rows={1}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="chatbot-send-btn"
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '생성 중...' : '전송'}
        </button>
      </form>
    </div>
  );
}

export default Chatbot;

