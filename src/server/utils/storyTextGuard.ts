/**
 * 突破/寿元耗尽叙事的流式净化器。
 *
 * 叙事场景要求模型直接输出古风正文，但个别模型会无视指令把正文包成
 * `{"answer": "..."}`（或先输出 ```json 代码块）再吐给客户端。由于 chunk
 * 是边到边展示的，等流结束再清理来不及——必须在流式过程中提前识别。
 *
 * 策略：缓冲流的开头若干字符直到能判定形态：
 * - 普通正文（不以 { 或 ``` 开头）→ 直接透传，零延迟。
 * - `{"answer": "` 形态 → 进入 JSON 提取模式，流式解出字符串字段值
 *   （处理转义），其余包装内容全部丢弃。
 * - ``` 代码块 → 剥离围栏后按普通正文透传。
 * - 疑似 JSON 但并非 answer 形态 → 超过判定窗口后原样透传（不吞正文）。
 */
export class StoryTextGuard {
  private buffer = '';
  private mode: 'detect' | 'plain' | 'json' | 'raw' = 'detect';
  private jsonCursor = 0;
  private jsonEscaped = false;
  private jsonClosed = false;

  constructor(private readonly emit: (text: string) => Promise<void>) {}

  async push(chunk: string): Promise<void> {
    if (this.mode === 'plain') {
      await this.emit(chunk);
      return;
    }
    if (this.mode === 'json') {
      this.buffer += chunk;
      await this.emit(this.drainJson());
      return;
    }
    // detect / raw：持续缓冲，直到能判定
    this.buffer += chunk;
    if (this.mode === 'detect') {
      await this.decide();
    }
  }

  /** 流结束：把尚未放行的缓冲按当前形态收尾输出。 */
  async end(): Promise<void> {
    if (this.mode === 'json') {
      const rest = this.drainJson();
      if (rest) await this.emit(rest);
      return;
    }
    if (this.buffer) {
      const rest = this.buffer;
      this.buffer = '';
      await this.emit(rest);
    }
  }

  private async decide(): Promise<void> {
    const trimmed = this.buffer.replace(/^[ \t\r\n]+/, '');
    if (trimmed.length === 0) return; // 全是空白，继续等

    // JSON 形态：{"answer": " …
    const answerMatch = trimmed.match(/^\{\s*"answer"\s*:\s*"/);
    if (answerMatch) {
      const valueStart = trimmed.length - trimmed.slice(answerMatch[0].length).length;
      this.mode = 'json';
      this.jsonCursor = valueStart;
      this.buffer = trimmed;
      await this.emit(this.drainJson());
      return;
    }

    // 代码块围栏：剥壳后继续判定内容形态
    if (/^```/.test(trimmed)) {
      const newlineIndex = trimmed.indexOf('\n');
      if (newlineIndex === -1) {
        if (trimmed.length <= 12) return; // 还没等到语言标注行
      }
      const body =
        newlineIndex === -1 ? '' : trimmed.slice(newlineIndex + 1);
      const closing = body.match(/```\s*$/);
      this.buffer = closing ? body.slice(0, closing.index) : body;
      // 围栏内可能还是 JSON，也可能直接是正文——重新走判定
      if (this.buffer.replace(/^[ \t\r\n]+/, '').length === 0) return;
      await this.decide();
      return;
    }

    if (trimmed.startsWith('{')) {
      // 疑似 JSON 但不是 answer 形态；等一小段窗口，超窗即按原文透传
      if (trimmed.length < 48) return;
      this.mode = 'raw';
      return;
    }

    // 普通正文
    this.mode = 'plain';
    const rest = this.buffer;
    this.buffer = '';
    await this.emit(rest);
  }

  /** 从 buffer 的 jsonCursor 位置继续消费 JSON 字符串值，返回应输出的文本。 */
  private drainJson(): string {
    if (this.jsonClosed) return '';
    let out = '';
    while (this.jsonCursor < this.buffer.length) {
      const ch = this.buffer[this.jsonCursor++];
      if (this.jsonEscaped) {
        this.jsonEscaped = false;
        switch (ch) {
          case 'n':
            out += '\n';
            break;
          case 'r':
            break;
          case 't':
            out += '\t';
            break;
          case 'u': {
            // \uXXXX：取 4 位十六进制解码（中文常用）
            const hex = this.buffer.slice(this.jsonCursor, this.jsonCursor + 4);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              out += String.fromCharCode(Number.parseInt(hex, 16));
              this.jsonCursor += 4;
            } else {
              out += 'u';
            }
            break;
          }
          default:
            out += ch;
        }
        continue;
      }
      if (ch === '\\') {
        this.jsonEscaped = true;
        continue;
      }
      if (ch === '"') {
        this.jsonClosed = true;
        break;
      }
      out += ch;
    }
    return out;
  }
}
