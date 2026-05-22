#!/usr/bin/env python3
import json
import sys
from pathlib import Path

SYMBOL_KINDS = {
    "class_name": "class",
    "class_decl": "class",
    "func_def": "function",
    "function_def": "function",
    "method_def": "method",
    "var_stmt": "variable",
    "property_stmt": "property",
    "const_stmt": "constant",
    "enum_stmt": "enum",
    "signal_stmt": "signal",
}
IMPORT_KINDS = {"load", "preload", "requires"}


def require_gdtoolkit_parser():
    try:
        from gdtoolkit import parser as gd_parser  # type: ignore
        return gd_parser
    except Exception as exc:
        raise RuntimeError("missing gdtoolkit.parser; install with pip install gdtoolkit") from exc


def node_kind(node):
    return str(getattr(node, "data", getattr(node, "type", "")))


def node_children(node):
    return list(getattr(node, "children", []) or [])


def node_line(node):
    return int(getattr(node, "line", getattr(getattr(node, "meta", None), "line", 1)) or 1)


def node_end_line(node):
    return int(getattr(node, "end_line", getattr(getattr(node, "meta", None), "end_line", node_line(node))) or node_line(node))


def node_value(node):
    value = getattr(node, "value", None)
    if value is not None:
        return str(value)
    if isinstance(node, str):
        return node
    for child in node_children(node):
        child_value = node_value(child)
        if child_value:
            return child_value
    return ""


def walk(node):
    yield node
    for child in node_children(node):
        yield from walk(child)


def parse_source(gd_parser, source):
    parse = getattr(gd_parser, "parse", None)
    if callable(parse):
        return parse(source)
    parser_cls = getattr(gd_parser, "Parser", None)
    if parser_cls is not None:
        return parser_cls().parse(source)
    raise RuntimeError("gdtoolkit.parser does not expose parse or Parser")


def outline(tree):
    imports = []
    seen_imports = set()
    symbols = []
    for node in walk(tree):
        kind = node_kind(node)
        value = node_value(node)
        if kind in IMPORT_KINDS and value and value not in seen_imports:
            imports.append(value)
            seen_imports.add(value)
        symbol_kind = SYMBOL_KINDS.get(kind)
        if symbol_kind and value:
            symbol = {"name": value, "kind": symbol_kind, "startLine": node_line(node), "endLine": node_end_line(node)}
            if symbol_kind in {"function", "method"}:
                symbol["signature"] = value
                if value.startswith("func "):
                    name = value.removeprefix("func ").split("(", 1)[0].strip()
                    if name:
                        symbol["name"] = name
            symbols.append(symbol)
    return {"imports": imports, "symbols": symbols}


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: gdscript_outline.py <file>"}))
        return 0
    try:
        gd_parser = require_gdtoolkit_parser()
        source = Path(sys.argv[1]).read_text(encoding="utf-8")
        tree = parse_source(gd_parser, source)
        print(json.dumps(outline(tree)))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
