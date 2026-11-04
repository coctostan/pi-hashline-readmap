export interface ProviderTool { name: string; description: string; parameters: unknown }
export interface ToolPrompt { snippet?: string; guidelines?: string[] }
export interface DeclarationCapture { systemPrompt: string; tools: ProviderTool[]; prompts: Record<string, ToolPrompt> }
export interface ToolCost {
  name: string;
  declarationBytes: number;
  snippetBytes: number;
  guidelineBytes: number;
  bytes: number;
  chars: number;
  tokens: number;
}
export interface Cost { bytes: number; tokens: number }
export interface DeclarationAccount { tools: ToolCost[]; shared: Cost; total: Cost }
export interface CrossReference { tool: string; where: string; names: string[]; text: string }
export interface DeclarationReport extends DeclarationAccount { host: string; version: string; crossReferences: CrossReference[] }
export function accountDeclarations(capture: DeclarationCapture): DeclarationAccount;
export function findCrossReferences(capture: Pick<DeclarationCapture, "tools" | "prompts">): CrossReference[];
export function formatDeclarationReport(report: DeclarationReport): string;
export function captureDeclarations(): Promise<DeclarationCapture & { host: string; version: string }>;
