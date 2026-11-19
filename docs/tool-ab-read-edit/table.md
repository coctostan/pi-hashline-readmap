| set | model | arm | runs | Pass (Δ) | Input tokens (Δ) | Output tokens (Δ) | Cost (Δ) | Wall s (Δ) | Calls before touch (Δ) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| locate | gpt-6-luna | stock | 20 | 95% (10%) | 133,796 (21,082) | 564 (112) | $0.0037 ($0.0004) | 23.2 (4.4) | 0.65 (0.10) |
| locate | gpt-6-luna | no-ls-find | 20 | 100% (0%) | 65,448 (37,300) | 423 (154) | $0.0023 ($0.0006) | 20.3 (6.9) | 1.20 (1.00) |
| locate | gpt-6-luna | pi-edit | 20 | 95% (10%) | 50,873 (19,217) | 413 (59) | $0.0019 ($0.0001) | 18.4 (1.9) | 1.10 (0.20) |
| locate | gpt-6-luna | pi-read | 20 | 100% (0%) | 101,780 (3,327) | 482 (66) | $0.0029 ($0.0000) | 23.5 (0.2) | 1.10 (0.40) |
| locate | gpt-6-luna | pi-read-edit | 20 | 100% (0%) | 75,177 (16,074) | 452 (8) | $0.0026 ($0.0002) | 22.0 (0.7) | 0.70 (1.00) |
| locate | gpt-6-luna | bash-read-edit | 20 | 40% (40%) | 286,548 (125,646) | 965 (122) | $0.0066 ($0.0018) | 48.8 (6.1) | - |
| locate | claude-sonnet-5-5 | stock | 20 | 95% (10%) | 23,486 (2,749) | 751 (61) | $0.0289 ($0.0030) | 8.5 (0.7) | 0.58 (1.06) |
| locate | claude-sonnet-5-5 | no-ls-find | 20 | 100% (0%) | 43,002 (9,599) | 801 (137) | $0.0388 ($0.0047) | 13.1 (1.5) | 0.35 (0.04) |
| locate | claude-sonnet-5-5 | pi-edit | 20 | 100% (0%) | 36,801 (3,824) | 715 (78) | $0.0380 ($0.0011) | 9.2 (1.0) | 0.79 (0.66) |
| locate | claude-sonnet-5-5 | pi-read | 20 | 100% (0%) | 36,120 (6,052) | 698 (82) | $0.0347 ($0.0031) | 8.7 (1.8) | 0.33 (0.22) |
| locate | claude-sonnet-5-5 | pi-read-edit | 20 | 100% (0%) | 33,848 (2,363) | 687 (62) | $0.0370 ($0.0031) | 11.0 (0.8) | 0.39 (0.20) |
| locate | claude-sonnet-5-5 | bash-read-edit | 20 | 100% (0%) | 24,148 (1,182) | 701 (5) | $0.0301 ($0.0011) | 11.1 (1.6) | - |
| edit | gpt-6-luna | stock | 42 | 76% (0%) | 23,124 (2,651) | 326 (113) | $0.0012 ($0.0001) | 12.5 (1.5) | 0.03 (0.06) |
| edit | gpt-6-luna | no-ls-find | 42 | 76% (10%) | 45,318 (255) | 421 (12) | $0.0019 ($0.0001) | 36.1 (15.6) | 0.10 (0.01) |
| edit | gpt-6-luna | pi-edit | 42 | 71% (10%) | 32,992 (15,409) | 571 (134) | $0.0016 ($0.0003) | 25.5 (10.8) | 0.08 (0.03) |
| edit | gpt-6-luna | pi-read | 42 | 81% (10%) | 37,463 (7,111) | 435 (327) | $0.0016 ($0.0000) | 37.4 (20.4) | 0.10 (0.00) |
| edit | gpt-6-luna | pi-read-edit | 42 | 69% (5%) | 34,830 (15,731) | 678 (202) | $0.0016 ($0.0002) | 27.6 (17.8) | 0.11 (0.00) |
| edit | gpt-6-luna | bash-read-edit | 42 | 57% (10%) | 37,786 (1,951) | 460 (203) | $0.0016 ($0.0001) | 21.2 (4.2) | - |
| edit | claude-sonnet-5-5 | stock | 42 | 100% (0%) | 15,267 (793) | 529 (16) | $0.0212 ($0.0006) | 6.9 (0.1) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | no-ls-find | 42 | 98% (5%) | 27,830 (53) | 531 (3) | $0.0256 ($0.0000) | 10.5 (0.0) | 0.03 (0.07) |
| edit | claude-sonnet-5-5 | pi-edit | 42 | 93% (5%) | 23,864 (1,308) | 564 (4) | $0.0262 ($0.0008) | 8.1 (0.1) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | pi-read | 42 | 98% (5%) | 26,437 (19) | 501 (2) | $0.0254 ($0.0004) | 7.5 (0.1) | 0.07 (0.00) |
| edit | claude-sonnet-5-5 | pi-read-edit | 42 | 90% (0%) | 20,611 (1,494) | 532 (108) | $0.0251 ($0.0017) | 9.2 (1.0) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | bash-read-edit | 42 | 100% (0%) | 18,334 (239) | 568 (1) | $0.0242 ($0.0003) | 10.4 (0.4) | - |

| set | model | task | stock | no-ls-find | pi-edit | pi-read | pi-read-edit | bash-read-edit |
|---|---|---|---:|---:|---:|---:|---:|---:|
| locate | gpt-6-luna | rename-format-not-found | 2 | 2 | 2 | 2 | 2 | 1 |
| locate | gpt-6-luna | markdown-extension | 2 | 2 | 2 | 2 | 2 | 0 |
| locate | gpt-6-luna | ls-default-limit | 1 | 2 | 1 | 2 | 2 | 0 |
| locate | gpt-6-luna | bash-search-hint-commands | 2 | 2 | 2 | 2 | 2 | 1 |
| locate | gpt-6-luna | integer-plus-sign | 2 | 2 | 2 | 2 | 2 | 0 |
| locate | gpt-6-luna | find-stat-concurrency | 2 | 2 | 2 | 2 | 2 | 1 |
| locate | gpt-6-luna | outline-script-license | 2 | 2 | 2 | 2 | 2 | 1 |
| locate | gpt-6-luna | ast-search-loop-suggestion | 2 | 2 | 2 | 2 | 2 | 0 |
| locate | claude-sonnet-5-5 | rename-format-not-found | 1 | 2 | 2 | 2 | 2 | 2 |
| edit | gpt-6-luna | language-select-10-json-plain | 2 | 0 | 2 | 2 | 2 | 2 |
| edit | gpt-6-luna | language-insert-1-yaml-plain | 2 | 1 | 2 | 2 | 2 | 1 |
| edit | gpt-6-luna | unique-1000-plain | 2 | 2 | 2 | 2 | 2 | 1 |
| edit | gpt-6-luna | multi-file-1-unicode | 2 | 0 | 2 | 2 | 2 | 2 |
| edit | gpt-6-luna | select-one-1000-plain | 2 | 2 | 2 | 2 | 2 | 1 |
| edit | gpt-6-luna | select-subset-1000-unicode | 2 | 2 | 2 | 2 | 2 | 0 |
| edit | gpt-6-luna | delete-subset-10-plain | 0 | 2 | 0 | 0 | 0 | 1 |
| edit | gpt-6-luna | insert-subset-100-unicode | 2 | 2 | 2 | 2 | 2 | 0 |
| edit | gpt-6-luna | replace-block-10-unicode | 2 | 2 | 2 | 2 | 2 | 1 |
| edit | gpt-6-luna | delete-block-10-plain | 0 | 2 | 0 | 2 | 0 | 1 |
| edit | gpt-6-luna | move-block-1000-unicode | 2 | 2 | 0 | 1 | 1 | 0 |
| edit | gpt-6-luna | copy-block-100-unicode | 1 | 1 | 1 | 1 | 0 | 1 |
| edit | gpt-6-luna | insert-payload-1000-unicode | 0 | 0 | 0 | 0 | 0 | 2 |
| edit | gpt-6-luna | copy-within-100-plain | 1 | 2 | 0 | 2 | 0 | 0 |
| edit | gpt-6-luna | move-between-1000-unicode | 0 | 0 | 1 | 0 | 0 | 1 |
| edit | gpt-6-luna | unicode-fix-1-cyrillic-a-unicode | 2 | 2 | 2 | 2 | 2 | 0 |
| edit | claude-sonnet-5-5 | delete-subset-10-plain | 2 | 2 | 1 | 1 | 0 | 2 |
| edit | claude-sonnet-5-5 | copy-block-100-unicode | 2 | 1 | 2 | 2 | 2 | 2 |
| edit | claude-sonnet-5-5 | insert-block-100-unicode | 2 | 2 | 0 | 2 | 0 | 2 |
