import { ASTNode } from '../models/ast.model';
export interface ExpressionDependency {
  kind: 'identifier' | 'variable' | 'entity' | 'dynamic-index' | 'function';
  path: string;
  dynamic: boolean;
}

/** Extracts complete property paths instead of losing parent-object information. */
export class ExpressionAnalyzer {
  analyze(root: ASTNode): ExpressionDependency[] {
    const result = new Map<string, ExpressionDependency>();
    const add = (dependency: ExpressionDependency) => result.set(`${dependency.kind}:${dependency.path}`, dependency);
    const pathOf = (node: ASTNode): string | undefined => {
      const n = node as any;
      if (node.type === 'Identifier') return n.name;
      if (node.type === 'MemberExpression') {
        const parent = pathOf(n.object);
        return parent ? `${parent}.${n.property}` : undefined;
      }
      if (node.type === 'ArrayAccess') {
        const parent = pathOf(n.object);
        return parent ? `${parent}[*]` : undefined;
      }
      return undefined;
    };
    const visit = (node: ASTNode): void => {
      const n = node as any;
      switch (node.type) {
        case 'Identifier': add({ kind: 'identifier', path: n.name, dynamic: false }); break;
        case 'VariableReference': add({ kind: 'variable', path: n.name, dynamic: false }); break;
        case 'EntityReference': add({ kind: 'entity', path: `@${n.entityId}.${n.field}`, dynamic: false }); break;
        case 'MemberExpression': {
          const path = pathOf(node);
          if (path) add({ kind: 'identifier', path, dynamic: false });
          visit(n.object); break;
        }
        case 'ArrayAccess': {
          const parent = pathOf(n.object);
          const literal = n.index.type === 'NumberLiteral' || n.index.type === 'StringLiteral';
          if (parent) add({
            kind: literal ? 'identifier' : 'dynamic-index',
            path: literal ? `${parent}[${n.index.value}]` : `${parent}[*]`,
            dynamic: !literal,
          });
          visit(n.object); visit(n.index); break;
        }
        case 'BinaryExpression': visit(n.left); visit(n.right); break;
        case 'UnaryExpression': visit(n.operand); break;
        case 'FunctionCall':
          add({ kind: 'function', path: String(n.name).toUpperCase(), dynamic: false });
          n.arguments.forEach(visit); break;
      }
    };
    visit(root);
    return [...result.values()];
  }
}
