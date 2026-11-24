import { ASTNode } from '../models/ast.model';
import { TokenType } from '../models/token.model';

export type OpCode = 'PUSH'|'LOAD_IDENTIFIER'|'LOAD_VARIABLE'|'LOAD_ENTITY'|'GET_MEMBER'|'GET_INDEX'|'UNARY'|'BINARY'|'TO_BOOLEAN'|'CALL'|'POP'|'JUMP_IF_FALSE'|'JUMP_IF_TRUE'|'JUMP'|'RETURN';
export interface Instruction { op: OpCode; operand?: unknown; argumentCount?: number; }
export interface BytecodeProgram { readonly instructions: readonly Instruction[]; readonly sourceNodeCount: number; }

/** Compiles expression ASTs into immutable stack bytecode; never generates JavaScript source. */
export class BytecodeCompiler {
  compile(root: ASTNode): BytecodeProgram {
    const instructions: Instruction[] = [];
    let sourceNodeCount = 0;
    const emit = (op: OpCode, operand?: unknown, argumentCount?: number): number => {
      instructions.push({ op, operand, argumentCount }); return instructions.length - 1;
    };
    const patch = (index: number, target: number): void => {
      instructions[index] = { ...instructions[index], operand: target };
    };
    const visit = (node: ASTNode): void => {
      sourceNodeCount++;
      const n = node as any;
      switch (node.type) {
        case 'NumberLiteral': case 'StringLiteral': case 'BooleanLiteral': emit('PUSH', n.value); return;
        case 'NullLiteral': emit('PUSH', null); return;
        case 'Identifier': emit('LOAD_IDENTIFIER', n.name); return;
        case 'VariableReference': emit('LOAD_VARIABLE', n.name); return;
        case 'EntityReference': emit('LOAD_ENTITY', { entityId: n.entityId, field: n.field }); return;
        case 'MemberExpression': visit(n.object); emit('GET_MEMBER', n.property); return;
        case 'ArrayAccess': visit(n.object); visit(n.index); emit('GET_INDEX'); return;
        case 'UnaryExpression': visit(n.operand); emit('UNARY', n.operator); return;
        case 'BinaryExpression': {
          visit(n.left);
          if (n.operator === TokenType.AND || n.operator === TokenType.OR) {
            emit('TO_BOOLEAN');
            const jump = emit(n.operator === TokenType.AND ? 'JUMP_IF_FALSE' : 'JUMP_IF_TRUE', -1);
            emit('POP'); visit(n.right); emit('TO_BOOLEAN');
            patch(jump, instructions.length); return;
          }
          visit(n.right); emit('BINARY', n.operator); return;
        }
        case 'FunctionCall': {
          const name = String(n.name).toUpperCase();
          if (name === 'IF') {
            if (n.arguments.length < 2 || n.arguments.length > 3) throw new Error('IF expects 2 or 3 arguments');
            visit(n.arguments[0]);
            const otherwise = emit('JUMP_IF_FALSE', -1);
            emit('POP'); visit(n.arguments[1]);
            const end = emit('JUMP', -1);
            patch(otherwise, instructions.length);
            emit('POP');
            if (n.arguments[2]) visit(n.arguments[2]); else emit('PUSH', null);
            patch(end, instructions.length); return;
          }
          if (name === 'AND' || name === 'OR') {
            this.compileLogicalFunction(name, n.arguments, visit, emit, patch, () => instructions.length);
            return;
          }
          for (const arg of n.arguments) visit(arg);
          emit('CALL', name, n.arguments.length); return;
        }
        default: throw new Error(`Unsupported AST node: ${node.type}`);
      }
    };
    visit(root);
    emit('RETURN');
    return Object.freeze({ instructions: Object.freeze(instructions.map(i => Object.freeze(i))), sourceNodeCount });
  }

  private compileLogicalFunction(
    name: 'AND'|'OR', args: ASTNode[], visit: (node: ASTNode) => void,
    emit: (op: OpCode, operand?: unknown, argumentCount?: number) => number,
    patch: (index: number, target: number) => void, length: () => number,
  ): void {
    if (!args.length) { emit('PUSH', name === 'AND'); return; }
    const jumps: number[] = [];
    args.forEach((arg, index) => {
      visit(arg); emit('TO_BOOLEAN');
      if (index < args.length - 1) {
        jumps.push(emit(name === 'AND' ? 'JUMP_IF_FALSE' : 'JUMP_IF_TRUE', -1));
        emit('POP');
      }
    });
    const end = emit('JUMP', -1);
    const shortCircuitTarget = length();
    for (const jump of jumps) patch(jump, shortCircuitTarget);
    patch(end, length());
  }
}
