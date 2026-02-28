package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strings"
)

type Symbol struct {
	Name      string   `json:"name"`
	Kind      string   `json:"kind"`
	StartLine int      `json:"startLine"`
	EndLine   int      `json:"endLine"`
	Signature string   `json:"signature,omitempty"`
	Modifiers []string `json:"modifiers,omitempty"`
	Children  []Symbol `json:"children,omitempty"`
	Docstring string   `json:"docstring,omitempty"`
	IsExported bool    `json:"isExported"`
}

type OutlineResult struct {
	Package string   `json:"package"`
	Imports []string `json:"imports,omitempty"`
	Symbols []Symbol `json:"symbols"`
	Error   string   `json:"error,omitempty"`
}

func formatType(expr ast.Expr) string {
	if expr == nil {
		return ""
	}
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.SelectorExpr:
		return formatType(t.X) + "." + t.Sel.Name
	case *ast.StarExpr:
		return "*" + formatType(t.X)
	case *ast.ArrayType:
		return "[]" + formatType(t.Elt)
	case *ast.MapType:
		return "map[" + formatType(t.Key) + "]" + formatType(t.Value)
	case *ast.InterfaceType:
		return "interface{}"
	case *ast.StructType:
		return "struct{}"
	case *ast.FuncType:
		return "func(...)"
	case *ast.ChanType:
		return "chan " + formatType(t.Value)
	case *ast.Ellipsis:
		return "..." + formatType(t.Elt)
	default:
		return "?"
	}
}

func formatParams(fields *ast.FieldList) string {
	if fields == nil || len(fields.List) == 0 {
		return "()"
	}
	var parts []string
	for _, f := range fields.List {
		typeStr := formatType(f.Type)
		if len(f.Names) == 0 {
			parts = append(parts, typeStr)
		} else {
			for _, name := range f.Names {
				parts = append(parts, name.Name+" "+typeStr)
			}
		}
	}
	return "(" + strings.Join(parts, ", ") + ")"
}

func formatResults(fields *ast.FieldList) string {
	if fields == nil || len(fields.List) == 0 {
		return ""
	}
	if len(fields.List) == 1 && len(fields.List[0].Names) == 0 {
		return " " + formatType(fields.List[0].Type)
	}
	var parts []string
	for _, f := range fields.List {
		typeStr := formatType(f.Type)
		if len(f.Names) == 0 {
			parts = append(parts, typeStr)
		} else {
			for _, name := range f.Names {
				parts = append(parts, name.Name+" "+typeStr)
			}
		}
	}
	return " (" + strings.Join(parts, ", ") + ")"
}

func extractSymbols(fset *token.FileSet, file *ast.File) []Symbol {
	var symbols []Symbol

	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			switch d.Tok {
			case token.TYPE:
				for _, spec := range d.Specs {
					ts := spec.(*ast.TypeSpec)
					doc := ts.Doc
					if doc == nil {
						doc = d.Doc
					}
					sym := Symbol{
						Name:       ts.Name.Name,
						StartLine:  fset.Position(d.Pos()).Line,
						EndLine:    fset.Position(d.End()).Line,
						Docstring:  getDocstringFirstLine(doc),
						IsExported: isExportedName(ts.Name.Name),
					}
					switch t := ts.Type.(type) {
					case *ast.StructType:
						sym.Kind = "struct"
						// Extract struct fields as children
						if t.Fields != nil {
							for _, field := range t.Fields.List {
								for _, name := range field.Names {
									sym.Children = append(sym.Children, Symbol{
										Name:      name.Name,
										Kind:      "field",
										StartLine: fset.Position(field.Pos()).Line,
										EndLine:   fset.Position(field.End()).Line,
										Signature: formatType(field.Type),
									})
								}
							}
						}
					case *ast.InterfaceType:
						sym.Kind = "interface"
						// Extract interface methods as children
						if t.Methods != nil {
							for _, method := range t.Methods.List {
								for _, name := range method.Names {
									if ft, ok := method.Type.(*ast.FuncType); ok {
										sym.Children = append(sym.Children, Symbol{
											Name:      name.Name,
											Kind:      "method",
											StartLine: fset.Position(method.Pos()).Line,
											EndLine:   fset.Position(method.End()).Line,
											Signature: formatParams(ft.Params) + formatResults(ft.Results),
										})
									}
								}
							}
						}
					default:
						sym.Kind = "type"
					}
					symbols = append(symbols, sym)
				}
			case token.CONST, token.VAR:
				kind := "variable"
				if d.Tok == token.CONST {
					kind = "constant"
				}
				for _, spec := range d.Specs {
					vs := spec.(*ast.ValueSpec)
					for _, name := range vs.Names {
						if name.Name == "_" {
							continue
						}
						sym := Symbol{
							Name:       name.Name,
							Kind:       kind,
							StartLine:  fset.Position(vs.Pos()).Line,
							EndLine:    fset.Position(vs.End()).Line,
							Docstring:  getDocstringFirstLine(d.Doc),
							IsExported: isExportedName(name.Name),
						}
						if vs.Type != nil {
							sym.Signature = formatType(vs.Type)
						}
						symbols = append(symbols, sym)
					}
				}
			}
		case *ast.FuncDecl:
			sym := Symbol{
				Name:       d.Name.Name,
				StartLine:  fset.Position(d.Pos()).Line,
				EndLine:    fset.Position(d.End()).Line,
				Signature:  formatParams(d.Type.Params) + formatResults(d.Type.Results),
				Docstring:  getDocstringFirstLine(d.Doc),
				IsExported: isExportedName(d.Name.Name),
			}
			if d.Recv != nil && len(d.Recv.List) > 0 {
				sym.Kind = "method"
				// Add receiver info
				recv := d.Recv.List[0]
				recvType := formatType(recv.Type)
				sym.Signature = "(" + recvType + ") " + sym.Name + sym.Signature
				sym.Name = recvType + "." + d.Name.Name
			} else {
				sym.Kind = "function"
			}
			symbols = append(symbols, sym)
		}
	}

	return symbols
}

func getDocstringFirstLine(doc *ast.CommentGroup) string {
	if doc == nil {
		return ""
	}
	text := doc.Text()
	if text == "" {
		return ""
	}
	lines := strings.SplitN(text, "\n", 2)
	return strings.TrimSpace(lines[0])
}

func isExportedName(name string) bool {
	if len(name) == 0 {
		return false
	}
	r := []rune(name)
	return r[0] >= 'A' && r[0] <= 'Z'
}

func extractImports(file *ast.File) []string {
	var imports []string
	for _, imp := range file.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if imp.Name != nil && imp.Name.Name != "." && imp.Name.Name != "_" {
			imports = append(imports, imp.Name.Name+" "+path)
		} else {
			imports = append(imports, path)
		}
	}
	return imports
}

func main() {
	if len(os.Args) < 2 {
		result := OutlineResult{Error: "usage: go_outline <file.go>"}
		json.NewEncoder(os.Stdout).Encode(result)
		os.Exit(1)
	}

	filePath := os.Args[1]

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filePath, nil, parser.ParseComments)
	if err != nil {
		result := OutlineResult{Error: fmt.Sprintf("parse error: %v", err)}
		json.NewEncoder(os.Stdout).Encode(result)
		os.Exit(1)
	}

	result := OutlineResult{
		Package: file.Name.Name,
		Imports: extractImports(file),
		Symbols: extractSymbols(fset, file),
	}

	json.NewEncoder(os.Stdout).Encode(result)
}
