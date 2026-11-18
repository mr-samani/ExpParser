export enum TokenType {
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',

  // Identifiers & Variables
  IDENTIFIER = 'IDENTIFIER',
  VARIABLE_REF = 'VARIABLE_REF',
  ENTITY_REF = 'ENTITY_REF',

  // Operators
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  MULTIPLY = 'MULTIPLY',
  DIVIDE = 'DIVIDE',
  MODULO = 'MODULO',
  POWER = 'POWER',

  // Comparison
  EQ = 'EQ',
  NEQ = 'NEQ',
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',

  // Logical
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // Grouping and member access
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  DOT = 'DOT',

  // Functions
  COMMA = 'COMMA',
  FUNCTION = 'FUNCTION',

  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string | number | boolean | null | object;
  position: number;
  length: number;
}

export const OPERATOR_PRECEDENCE: Record<TokenType, number> = {
  [TokenType.OR]: 1,
  [TokenType.AND]: 2,
  [TokenType.EQ]: 3,
  [TokenType.NEQ]: 3,
  [TokenType.LT]: 4,
  [TokenType.GT]: 4,
  [TokenType.LTE]: 4,
  [TokenType.GTE]: 4,
  [TokenType.PLUS]: 5,
  [TokenType.MINUS]: 5,
  [TokenType.MULTIPLY]: 6,
  [TokenType.DIVIDE]: 6,
  [TokenType.MODULO]: 6,
  [TokenType.POWER]: 7,
  [TokenType.NOT]: 8,
  [TokenType.NUMBER]: 0,
  [TokenType.STRING]: 0,
  [TokenType.BOOLEAN]: 0,
  [TokenType.NULL]: 0,
  [TokenType.IDENTIFIER]: 0,
  [TokenType.VARIABLE_REF]: 0,
  [TokenType.ENTITY_REF]: 0,
  [TokenType.LPAREN]: 0,
  [TokenType.RPAREN]: 0,
  [TokenType.LBRACKET]: 0,
  [TokenType.RBRACKET]: 0,
  [TokenType.DOT]: 0,
  [TokenType.COMMA]: 0,
  [TokenType.FUNCTION]: 0,
  [TokenType.EOF]: 0,
};
