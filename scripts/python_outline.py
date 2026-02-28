#!/usr/bin/env python3
"""
Python AST outline extractor.
Outputs JSON with symbols, line ranges, and signatures.
"""

import ast
import json
import sys
from pathlib import Path


def get_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """Extract function signature from AST node."""
    args = []
    
    # Regular arguments
    for arg in node.args.args:
        arg_str = arg.arg
        if arg.annotation:
            arg_str += f": {ast.unparse(arg.annotation)}"
        args.append(arg_str)
    
    # *args
    if node.args.vararg:
        arg_str = f"*{node.args.vararg.arg}"
        if node.args.vararg.annotation:
            arg_str += f": {ast.unparse(node.args.vararg.annotation)}"
        args.append(arg_str)
    
    # **kwargs
    if node.args.kwarg:
        arg_str = f"**{node.args.kwarg.arg}"
        if node.args.kwarg.annotation:
            arg_str += f": {ast.unparse(node.args.kwarg.annotation)}"
        args.append(arg_str)
    
    sig = f"({', '.join(args)})"
    
    # Return type
    if node.returns:
        sig += f" -> {ast.unparse(node.returns)}"
    
    return sig


def get_decorators(node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    """Extract decorator names."""
    decorators = []
    for dec in node.decorator_list:
        if isinstance(dec, ast.Name):
            decorators.append(dec.id)
        elif isinstance(dec, ast.Attribute):
            decorators.append(ast.unparse(dec))
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                decorators.append(dec.func.id)
            elif isinstance(dec.func, ast.Attribute):
                decorators.append(ast.unparse(dec.func))
    return decorators


def extract_imports(tree: ast.Module) -> list[str]:
    """Extract import names from module."""
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level > 0:
                module = "." * node.level + module
            imports.append(module)
    return sorted(set(imports))


def get_end_line(node: ast.AST) -> int:
    """Get end line of a node, handling missing end_lineno."""
    if hasattr(node, 'end_lineno') and node.end_lineno is not None:
        return node.end_lineno
    return getattr(node, 'lineno', 0)


def get_docstring_first_line(node: ast.AST) -> str | None:
    """Extract the first line of a docstring from a class or function."""
    try:
        doc = ast.get_docstring(node)
    except TypeError:
        return None
    if not doc:
        return None
    first_line = doc.split('\n')[0].strip()
    return first_line if first_line else None


def extract_symbols(node: ast.AST, parent_end: int | None = None) -> list[dict]:
    """Recursively extract symbols from AST."""
    symbols = []
    
    if isinstance(node, ast.Module):
        # Process module-level items
        items = list(node.body)
        for i, item in enumerate(items):
            # Estimate end line from next sibling
            next_start = items[i + 1].lineno - 1 if i + 1 < len(items) else None
            symbols.extend(extract_symbols(item, next_start))
    
    elif isinstance(node, ast.ClassDef):
        end_line = get_end_line(node)
        children = []
        
        # Extract methods and nested classes
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                children.extend(extract_symbols(item))
        
        decorators = get_decorators(node)
        modifiers = decorators if decorators else None
        
        symbols.append({
            "name": node.name,
            "kind": "class",
            "startLine": node.lineno,
            "endLine": end_line,
            "modifiers": modifiers,
            "children": children if children else None,
            "docstring": get_docstring_first_line(node),
            "is_exported": not node.name.startswith("_"),
        })
    
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        end_line = get_end_line(node)
        
        modifiers = []
        if isinstance(node, ast.AsyncFunctionDef):
            modifiers.append("async")
        
        decorators = get_decorators(node)
        modifiers.extend(decorators)
        
        symbols.append({
            "name": node.name,
            "kind": "function",
            "startLine": node.lineno,
            "endLine": end_line,
            "signature": get_signature(node),
            "modifiers": modifiers if modifiers else None,
            "docstring": get_docstring_first_line(node),
            "is_exported": not node.name.startswith("_"),
        })
    
    elif isinstance(node, ast.Assign):
        # Module-level assignments (constants)
        if all(isinstance(t, ast.Name) for t in node.targets):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.isupper():
                    symbols.append({
                        "name": target.id,
                        "kind": "constant",
                        "startLine": node.lineno,
                        "endLine": get_end_line(node),
                    })
    
    elif isinstance(node, ast.AnnAssign):
        # Annotated assignments
        if isinstance(node.target, ast.Name):
            name = node.target.id
            kind = "constant" if name.isupper() else "variable"
            symbols.append({
                "name": name,
                "kind": kind,
                "startLine": node.lineno,
                "endLine": get_end_line(node),
            })
    
    return symbols


def main():
    if len(sys.argv) < 2:
        print("Usage: python_outline.py <file>", file=sys.stderr)
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    
    if not file_path.exists():
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)
    
    try:
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(file_path))
    except SyntaxError as e:
        print(json.dumps({"error": f"Syntax error: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    
    imports = extract_imports(tree)
    symbols = extract_symbols(tree)
    
    # Clean up None values
    def clean(obj):
        if isinstance(obj, dict):
            return {k: clean(v) for k, v in obj.items() if v is not None}
        elif isinstance(obj, list):
            return [clean(item) for item in obj]
        return obj
    
    result = clean({
        "imports": imports if imports else None,
        "symbols": symbols,
    })
    
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
