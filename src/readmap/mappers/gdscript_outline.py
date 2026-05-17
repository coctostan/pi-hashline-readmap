#!/usr/bin/env python3
"""
Parse a GDScript file using gdtoolkit (Lark-based parser) and emit a JSON
outline for pi-hashline-readmap.

Usage: python3 gdscript_outline.py <file.gd>

Requires: pip install gdtoolkit
"""
import json
import sys
from typing import Any


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _token_str(tok):
    """Return the string value of a Lark token or tree node."""
    if hasattr(tok, "value"):
        return tok.value
    return str(tok)


def _token_line(tok):
    """Return the 1-indexed line number of a token."""
    if hasattr(tok, "line") and tok.line is not None:
        return tok.line
    # Fallback: walk children
    if hasattr(tok, "children"):
        for ch in tok.children:
            line = _token_line(ch)
            if line:
                return line
    return 0


def _find_var_name(node):
    """Recursively find the variable-name token inside a class_var child."""
    if hasattr(node, "data"):
        if node.data in (
            "class_var_typed_assgnd",
            "class_var_assigned",
            "class_var_typed",
            "class_var",
        ):
            return node.children[0]
        for child in node.children:
            result = _find_var_name(child)
            if result is not None:
                return result
    return node  # leaf token


# ---------------------------------------------------------------------------
# AST walker
# ---------------------------------------------------------------------------

def _build_signature(header) -> str:
    """Build 'name(args) -> ret' from a func_header node."""
    name = _token_str(header.children[0])
    args_node = header.children[1] if len(header.children) > 1 else None
    ret_node = header.children[2] if len(header.children) > 2 else None

    args: list[str] = []
    if args_node and hasattr(args_node, "data") and args_node.data == "func_args":
        for arg in args_node.children:
            if hasattr(arg, "data"):
                if arg.data == "func_arg_typed":
                    args.append(f"{_token_str(arg.children[0])}: {_token_str(arg.children[1])}")
                elif arg.data == "func_arg":
                    args.append(_token_str(arg.children[0]))
                else:
                    args.append(_token_str(arg))
            else:
                args.append(_token_str(arg))

    sig = f"{name}({', '.join(args)})"
    if ret_node and _token_str(ret_node).strip():
        sig += f" -> {_token_str(ret_node)}"
    return sig


def _process_node(node) -> dict[str, Any] | None:
    rule = node.data if hasattr(node, "data") else None
    children = node.children if hasattr(node, "children") else []

    if rule == "extends_stmt":
        return None

    if rule == "classname_stmt":
        return {
            "kind": "class",
            "name": _token_str(children[0]),
            "startLine": _token_line(children[0]),
        }

    if rule == "class_def":
        name_token = children[0]
        name = _token_str(name_token)
        start = _token_line(name_token)
        kids = [c for c in (_process_node(ch) for ch in children[1:]) if c]
        sym: dict[str, Any] = {
            "kind": "class",
            "name": name,
            "startLine": start,
        }
        if kids:
            sym["children"] = kids
        return sym

    if rule == "func_def":
        header = children[0]
        name_token = header.children[0]
        name = _token_str(name_token)
        start = _token_line(name_token)
        return {
            "kind": "function",
            "name": name,
            "startLine": start,
            "signature": _build_signature(header),
        }

    if rule == "const_stmt":
        name_token = children[0]
        return {
            "kind": "constant",
            "name": _token_str(name_token),
            "startLine": _token_line(name_token),
        }

    if rule == "class_var_stmt":
        name_node = _find_var_name(children[0])
        return {
            "kind": "variable",
            "name": _token_str(name_node),
            "startLine": _token_line(name_node),
        }

    if rule == "signal_stmt":
        name_token = children[0]
        return {
            "kind": "signal",
            "name": _token_str(name_token),
            "startLine": _token_line(name_token),
        }

    if rule == "enum_stmt":
        if children and hasattr(children[0], "data") and children[0].data == "enum_named":
            name_token = children[0].children[0]
            return {
                "kind": "enum",
                "name": _token_str(name_token),
                "startLine": _token_line(name_token),
            }

    return None


def extract_outline(tree) -> list[dict[str, Any]]:
    """Walk the Lark AST and extract a flat+nested outline."""
    result: list[dict[str, Any]] = []
    for child in tree.children:
        item = _process_node(child)
        if item:
            result.append(item)
    return result


# ---------------------------------------------------------------------------
# End-line estimation (linear scan, same pattern as other mappers)
# ---------------------------------------------------------------------------

def _estimate_endlines(symbols: list[dict], total_lines: int):
    """Mutate symbols to add endLine = next symbol's startLine - 1."""
    for i, sym in enumerate(symbols):
        # Recurse into children first
        if sym.get("children"):
            _estimate_endlines(sym["children"], total_lines)

        next_start = symbols[i + 1]["startLine"] if i + 1 < len(symbols) else total_lines + 1
        # If this symbol has children, endLine = last child's endLine
        if sym.get("children"):
            sym["endLine"] = sym["children"][-1]["endLine"]
        else:
            sym["endLine"] = next_start - 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: gdscript_outline.py <file.gd>", file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]
    try:
        from gdtoolkit.parser import parser
        import subprocess

        code = open(filepath).read()
        total_lines = code.count("\n") + 1

        tree = parser.parse(code)
        outline = extract_outline(tree)
        _estimate_endlines(outline, total_lines)

        # Collect imports (load, preload, requires)
        imports: list[str] = []
        for child in tree.children:
            if hasattr(child, "data") and child.data in ("load_stmt", "preload_stmt", "requires_stmt"):
                imports.append(_token_str(child.children[0]))

        print(json.dumps({"symbols": outline, "imports": imports}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
