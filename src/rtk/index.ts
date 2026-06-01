// Re-export all techniques
export { stripAnsi, stripAnsiFast } from "./ansi.js";
export { truncate, truncateLines } from "./truncate.js";
export { filterBuildOutput, isBuildCommand } from "./build.js";
export { aggregateTestOutput, isTestCommand } from "./test-output.js";
export { aggregateLinterOutput, isLinterCommand } from "./linter.js";
export { compactDiff, compactStatus, compactLog, compactGitOutput, isGitCommand } from "./git.js";
export { isPackageManagerCommand, compressPackageManagerOutput } from "./package-manager.js";
export { isDockerCommand, compressDockerOutput } from "./docker.js";
export { isFileListingCommand, compressFileListingOutput } from "./file-listing.js";
export { isHttpCommand, compressHttpOutput } from "./http-client.js";
export { isBuildToolsCommand, compressBuildToolsOutput } from "./build-tools.js";
export { isTransferCommand, compressTransferOutput } from "./transfer.js";
