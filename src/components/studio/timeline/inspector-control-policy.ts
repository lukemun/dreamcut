import ts from 'typescript';

/** Inspect JSX syntax rather than comments/string matches. Shared owners alone may
 * create numeric HTML inputs; new consumers must compose the standard controls. */
export function customNumericInputs(code: string, filename = 'controls.tsx'): string[] {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const type = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'type');
      if (type && ts.isJsxAttribute(type) && type.initializer) {
        const value = ts.isStringLiteral(type.initializer) ? type.initializer.text
          : ts.isJsxExpression(type.initializer) && type.initializer.expression && ts.isStringLiteral(type.initializer.expression) ? type.initializer.expression.text : null;
        if (value === 'number' || value === 'range') violations.push(node.tagName.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}
