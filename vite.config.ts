import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env, .env.local 등 모든 환경 변수 로드
  const env = loadEnv(mode, process.cwd(), '');
  if (env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-vercel-api-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url ? req.url.split('?')[0] : '';
            if (url !== '/api/chat') {
              return next();
            }

            // 요청 본문(body) 수집
            let bodyBuffer = '';
            req.on('data', (chunk) => {
              bodyBuffer += chunk;
            });

            req.on('end', async () => {
              try {
                let parsedBody: any = {};
                if (bodyBuffer) {
                  try {
                    parsedBody = JSON.parse(bodyBuffer);
                  } catch {
                    parsedBody = {};
                  }
                }
                (req as any).body = parsedBody;

                // dev 서버 실행 중 .env.local이 수정되었을 경우를 대비한 동적 로드
                if (!process.env.OPENAI_API_KEY) {
                  const envLocalPath = path.resolve(process.cwd(), '.env.local');
                  if (fs.existsSync(envLocalPath)) {
                    const content = fs.readFileSync(envLocalPath, 'utf-8');
                    const match = content.match(/^OPENAI_API_KEY=(.*)$/m);
                    if (match && match[1]?.trim()) {
                      process.env.OPENAI_API_KEY = match[1].trim();
                    }
                  }
                }

                // Vercel Serverless Function 스타일 응답 헬퍼
                const vercelRes: any = res;
                vercelRes.status = (statusCode: number) => {
                  res.statusCode = statusCode;
                  return vercelRes;
                };
                vercelRes.json = (data: any) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return vercelRes;
                };
                vercelRes.send = (data: any) => {
                  res.end(typeof data === 'string' ? data : JSON.stringify(data));
                  return vercelRes;
                };

                // Vite의 ssrLoadModule을 통해 api/chat.ts 실행
                const chatModule = await server.ssrLoadModule('/api/chat.ts');
                const handler = chatModule.default;

                if (typeof handler === 'function') {
                  await handler(req, vercelRes);
                } else {
                  vercelRes.status(500).json({
                    error: 'HANDLER_NOT_FOUND',
                    message: 'api/chat.ts 파일에서 기본 핸들러(default export)를 찾을 수 없습니다.',
                  });
                }
              } catch (err: any) {
                console.error('[Vite Local API] /api/chat error:', err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    error: 'LOCAL_SERVER_ERROR',
                    message: err?.message || '로컬 서버 함수 처리 중 오류가 발생했습니다.',
                  }));
                }
              }
            });
          });
        },
      },
    ],
  };
});
