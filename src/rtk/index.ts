// Re-export all techniques
export { stripAnsi, stripAnsiFast } from "./ansi";
export { truncate, truncateLines } from "./truncate";
export { filterBuildOutput, isBuildCommand } from "./build";
export { aggregateTestOutput, isTestCommand } from "./test-output";
export { aggregateLinterOutput, isLinterCommand } from "./linter";
export { compactDiff, compactStatus, compactLog, compactGitOutput, isGitCommand } from "./git";
export { isPackageManagerCommand, compressPackageManagerOutput } from "./package-manager";
export { isDockerCommand, compressDockerOutput } from "./docker";
export { isFileListingCommand, compressFileListingOutput } from "./file-listing";
export { isHttpCommand, compressHttpOutput } from "./http-client";
export { isBuildToolsCommand, compressBuildToolsOutput } from "./build-tools";
export { isTransferCommand, compressTransferOutput } from "./transfer";
