// lexer.service.ts
import { Injectable } from '@angular/core';
import { Token, TokenType } from '../models/token.model';

export interface LexerError {
  message: string;
  position: number;
}

@Injectable({ providedIn: 'root' })
export class LexerService {
  private input: string = '';
  private position: number = 0;
  private tokens: Token[] = [];
  private errors: LexerError[] = [];

  tokenize(input: string): { tokens: Token[]; errors: LexerError[] } {
    this.input = input;
    this.position = 0;
    this.tokens = [];
    this.errors = [];

    while (this.position < this.input.length) {
      this.skipWhitespace();
      if (this.position >= this.input.length) break;

      const char = this.input[this.position];

      // Entity Reference: @Q123ewr.A3tffdd
      if (char === '@') {
        this.readEntityReference();
        continue;
      }

      // Variable Reference: [%myvar%]
      if (char === '[' && this.peek(1) === '%') {
        this.readVariableReference();
        continue;
      }

      // String literal
      if (char === '"' || char === "'") {
        this.readString(char);
        continue;
      }

      // Number
      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }

      // Operators and punctuation
      if (!this.readOperatorOrPunctuation()) {
        this.errors.push({
          message: `Unexpected character: '${char}'`,
          position: this.position,
        });
        this.position++;
      }
    }

    this.tokens.push({ type: TokenType.EOF, value: null, position: this.position, length: 0 });
    return { tokens: this.tokens, errors: this.errors };
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++;
    }
    // Skip comments
    if (this.input.slice(this.position, this.position + 2) === '//') {
      while (this.position < this.input.length && this.input[this.position] !== '\n') {
        this.position++;
      }
      this.skipWhitespace();
    }
  }

  private peek(offset: number = 0): string {
    return this.input[this.position + offset] || '';
  }

  private advance(): string {
    return this.input[this.position++] || '';
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  private readEntityReference(): void {
    const start = this.position;
    this.advance(); // skip @

    // Read entity ID (e.g., Q123ewr)
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    const entityId = this.input.slice(start + 1, this.position);

    if (this.peek() !== '.') {
      this.errors.push({
        message: `Expected '.' after entity ID in entity reference`,
        position: this.position,
      });
      return;
    }
    this.advance(); // skip '.'

    // Read field name (e.g., A3tffdd)
    const fieldStart = this.position;
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }
    const field = this.input.slice(fieldStart, this.position);

    if (!field) {
      this.errors.push({
        message: `Expected field name after '.' in entity reference`,
        position: this.position,
      });
      return;
    }

    this.tokens.push({
      type: TokenType.ENTITY_REF,
      value: { entityId, field },
      position: start,
      length: this.position - start,
    });
  }

  private readVariableReference(): void {
    const start = this.position;
    this.advance(); // '['
    this.advance(); // '%'

    const nameStart = this.position;
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '_') {
      this.advance();
    }
    const name = this.input.slice(nameStart, this.position);

    if (this.peek() !== '%' || this.peek(1) !== ']') {
      this.errors.push({
        message: `Unclosed variable reference, expected '%]'`,
        position: this.position,
      });
      return;
    }
    this.advance(); // '%'
    this.advance(); // ']'

    this.tokens.push({
      type: TokenType.VARIABLE_REF,
      value: name,
      position: start,
      length: this.position - start,
    });
  }

  private readString(quote: string): void {
    const start = this.position;
    this.advance(); // opening quote

    let value = '';
    while (this.position < this.input.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        value += this.escapeCharacter(escaped);
      } else {
        value += this.advance();
      }
    }

    if (this.peek() !== quote) {
      this.errors.push({
        message: `Unterminated string literal`,
        position: start,
      });
      return;
    }
    this.advance(); // closing quote

    this.tokens.push({
      type: TokenType.STRING,
      value,
      position: start,
      length: this.position - start,
    });
  }

  private escapeCharacter(char: string): string {
    const escapes: Record<string, string> = {
      n: '\n',
      t: '\t',
      r: '\r',
      '\\': '\\',
      '"': '"',
      "'": "'",
    };
    return escapes[char] || char;
  }

  private readNumber(): void {
    const start = this.position;
    let hasDecimal = false;

    // Integer part
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      hasDecimal = true;
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      const nextChar = this.peek(1);
      if (this.isDigit(nextChar) || nextChar === '+' || nextChar === '-') {
        this.advance(); // e/E
        if (this.peek() === '+' || this.peek() === '-') {
          this.advance();
        }
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
    }

    const value = parseFloat(this.input.slice(start, this.position));
    this.tokens.push({
      type: TokenType.NUMBER,
      value: isNaN(value) ? 0 : value,
      position: start,
      length: this.position - start,
    });
  }

  private readOperatorOrPunctuation(): boolean {
    const start = this.position;
    const char = this.peek();
    const twoChar = this.input.slice(this.position, this.position + 2);
    const threeChar = this.input.slice(this.position, this.position + 3);

    // Three character operators
    if (threeChar === '===' || threeChar === '!==') {
      this.position += 3;
      this.tokens.push({
        type: threeChar === '===' ? TokenType.EQ : TokenType.NEQ,
        value: threeChar,
        position: start,
        length: 3,
      });
      return true;
    }

    // Two character operators
    const twoCharOps: Record<string, TokenType> = {
      '==': TokenType.EQ,
      '!=': TokenType.NEQ,
      '&&': TokenType.AND,
      '||': TokenType.OR,
      '<=': TokenType.LTE,
      '>=': TokenType.GTE,
      '**': TokenType.POWER,
      '+=': TokenType.PLUS, // Treat as addition (simplified)
      '-=': TokenType.MINUS,
    };

    if (twoCharOps[twoChar]) {
      this.position += 2;
      this.tokens.push({
        type: twoCharOps[twoChar],
        value: twoChar,
        position: start,
        length: 2,
      });
      return true;
    }

    // Single character operators
    const singleCharOps: Record<string, TokenType> = {
      '+': TokenType.PLUS,
      '-': TokenType.MINUS,
      '*': TokenType.MULTIPLY,
      '/': TokenType.DIVIDE,
      '%': TokenType.MODULO,
      '>': TokenType.GT,
      '<': TokenType.LT,
      '!': TokenType.NOT,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      ',': TokenType.COMMA,
    };

    if (singleCharOps[char]) {
      this.position++;
      this.tokens.push({
        type: singleCharOps[char],
        value: char,
        position: start,
        length: 1,
      });
      return true;
    }

    // Identifier or keyword
    if (this.isAlpha(char)) {
      const nameStart = this.position;
      while (this.isAlphaNumeric(this.peek())) {
        this.advance();
      }
      const name = this.input.slice(nameStart, this.position);

      // Check for boolean literals
      if (name === 'true') {
        this.tokens.push({
          type: TokenType.BOOLEAN,
          value: true,
          position: nameStart,
          length: name.length,
        });
        return true;
      }
      if (name === 'false') {
        this.tokens.push({
          type: TokenType.BOOLEAN,
          value: false,
          position: nameStart,
          length: name.length,
        });
        return true;
      }
      if (name === 'null') {
        this.tokens.push({
          type: TokenType.NULL,
          value: null,
          position: nameStart,
          length: name.length,
        });
        return true;
      }

      // Check if it's a function call
      if (this.peek() === '(') {
        this.tokens.push({
          type: TokenType.FUNCTION,
          value: name,
          position: nameStart,
          length: name.length,
        });
        return true;
      }

      this.tokens.push({
        type: TokenType.IDENTIFIER,
        value: name,
        position: nameStart,
        length: name.length,
      });
      return true;
    }

    return false;
  }
}