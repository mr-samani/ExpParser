import { Injectable } from '@angular/core';
import { Token, TokenType } from '../models/token.model';

export interface LexerError {
  message: string;
  position: number;
}

@Injectable({ providedIn: 'root' })
export class LexerService {
  private input = '';
  private position = 0;
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
      if (char === '@') { this.readEntityReference(); continue; }
      if (char === '[' && this.peek(1) === '%') { this.readVariableReference(); continue; }
      if (char === '"' || char === "'") { this.readString(char); continue; }
      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }
      if (!this.readOperatorOrPunctuation()) {
        this.errors.push({ message: `Unexpected character: '${char}'`, position: this.position });
        this.position++;
      }
    }

    this.tokens.push({ type: TokenType.EOF, value: null, position: this.position, length: 0 });
    return { tokens: this.tokens, errors: this.errors };
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) this.position++;
    if (this.input.slice(this.position, this.position + 2) === '//') {
      while (this.position < this.input.length && this.input[this.position] !== '\n') this.position++;
      this.skipWhitespace();
    }
  }

  private peek(offset = 0): string { return this.input[this.position + offset] || ''; }
  private advance(): string { return this.input[this.position++] || ''; }
  private isDigit(char: string): boolean { return /[0-9]/.test(char); }
  private isAlpha(char: string): boolean { return /[a-zA-Z_]/.test(char); }
  private isAlphaNumeric(char: string): boolean { return /[a-zA-Z0-9_]/.test(char); }

  private readEntityReference(): void {
    const start = this.position;
    this.advance();
    while (this.isAlphaNumeric(this.peek())) this.advance();
    const entityId = this.input.slice(start + 1, this.position);
    if (this.peek() !== '.') {
      this.errors.push({ message: "Expected '.' after entity ID in entity reference", position: this.position });
      return;
    }
    this.advance();
    const fieldStart = this.position;
    while (this.isAlphaNumeric(this.peek())) this.advance();
    const field = this.input.slice(fieldStart, this.position);
    if (!field) {
      this.errors.push({ message: "Expected field name after '.' in entity reference", position: this.position });
      return;
    }
    this.tokens.push({
      type: TokenType.ENTITY_REF, value: { entityId, field },
      position: start, length: this.position - start,
    });
  }

  private readVariableReference(): void {
    const start = this.position;
    this.advance(); this.advance();
    const nameStart = this.position;
    while (this.isAlphaNumeric(this.peek())) this.advance();
    const name = this.input.slice(nameStart, this.position);
    if (this.peek() !== '%' || this.peek(1) !== ']') {
      this.errors.push({ message: "Unclosed variable reference, expected '%]'", position: this.position });
      return;
    }
    this.advance(); this.advance();
    this.tokens.push({
      type: TokenType.VARIABLE_REF, value: name,
      position: start, length: this.position - start,
    });
  }

  private readString(quote: string): void {
    const start = this.position;
    this.advance();
    let value = '';
    while (this.position < this.input.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        value += this.escapeCharacter(this.advance());
      } else {
        value += this.advance();
      }
    }
    if (this.peek() !== quote) {
      this.errors.push({ message: 'Unterminated string literal', position: start });
      return;
    }
    this.advance();
    this.tokens.push({ type: TokenType.STRING, value, position: start, length: this.position - start });
  }

  private escapeCharacter(char: string): string {
    const escapes: Record<string, string> = {
      n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'",
    };
    return escapes[char] || char;
  }

  private readNumber(): void {
    const start = this.position;
    while (this.isDigit(this.peek())) this.advance();
    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      const next = this.peek(1);
      if (this.isDigit(next) || next === '+' || next === '-') {
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') this.advance();
        while (this.isDigit(this.peek())) this.advance();
      }
    }
    const value = Number(this.input.slice(start, this.position));
    this.tokens.push({
      type: TokenType.NUMBER, value: Number.isFinite(value) ? value : 0,
      position: start, length: this.position - start,
    });
  }

  private readOperatorOrPunctuation(): boolean {
    const start = this.position;
    const char = this.peek();
    const two = this.input.slice(this.position, this.position + 2);
    const three = this.input.slice(this.position, this.position + 3);

    if (three === '===' || three === '!==') {
      this.position += 3;
      this.tokens.push({
        type: three === '===' ? TokenType.EQ : TokenType.NEQ,
        value: three, position: start, length: 3,
      });
      return true;
    }

    const twoCharOps: Record<string, TokenType> = {
      '==': TokenType.EQ, '!=': TokenType.NEQ, '&&': TokenType.AND, '||': TokenType.OR,
      '<=': TokenType.LTE, '>=': TokenType.GTE, '**': TokenType.POWER,
      '+=': TokenType.PLUS, '-=': TokenType.MINUS,
    };
    if (twoCharOps[two]) {
      this.position += 2;
      this.tokens.push({ type: twoCharOps[two], value: two, position: start, length: 2 });
      return true;
    }

    const singles: Record<string, TokenType> = {
      '+': TokenType.PLUS, '-': TokenType.MINUS, '*': TokenType.MULTIPLY,
      '/': TokenType.DIVIDE, '%': TokenType.MODULO, '>': TokenType.GT, '<': TokenType.LT,
      '!': TokenType.NOT, '(': TokenType.LPAREN, ')': TokenType.RPAREN,
      '[': TokenType.LBRACKET, ']': TokenType.RBRACKET, ',': TokenType.COMMA,
      '.': TokenType.DOT,
    };
    if (singles[char]) {
      this.position++;
      this.tokens.push({ type: singles[char], value: char, position: start, length: 1 });
      return true;
    }

    if (this.isAlpha(char)) {
      const nameStart = this.position;
      while (this.isAlphaNumeric(this.peek())) this.advance();
      const name = this.input.slice(nameStart, this.position);
      if (name === 'true' || name === 'false') {
        this.tokens.push({ type: TokenType.BOOLEAN, value: name === 'true', position: nameStart, length: name.length });
        return true;
      }
      if (name === 'null') {
        this.tokens.push({ type: TokenType.NULL, value: null, position: nameStart, length: name.length });
        return true;
      }
      this.tokens.push({
        type: this.peek() === '(' ? TokenType.FUNCTION : TokenType.IDENTIFIER,
        value: name, position: nameStart, length: name.length,
      });
      return true;
    }
    return false;
  }
}
