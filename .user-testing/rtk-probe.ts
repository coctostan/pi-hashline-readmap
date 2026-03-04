import { filterBashOutput, isBuildCommand, isGitCommand, isLinterCommand, isTestCommand } from '../src/rtk/bash-filter.ts';
import {
  isBuildToolsCommand,
  isPackageManagerCommand,
  isTransferCommand,
} from '../src/rtk/index.ts';

type Scenario = {
  name: string;
  cmd: string;
  output: string;
};

const scenarios: Scenario[] = [
  {
    name: 'make (enter/leave noise + final error)',
    cmd: 'make all',
    output: [
      "make[1]: Entering directory '/repo'",
      'gcc -c a.c',
      "make[1]: Leaving directory '/repo'",
      "make[1]: Entering directory '/repo/sub'",
      'gcc -c b.c',
      "make[1]: Leaving directory '/repo/sub'",
      "make[1]: Entering directory '/repo'",
      'ar rcs libx.a a.o b.o',
      "make[1]: Leaving directory '/repo'",
      'echo done step 1',
      'echo done step 2',
      'echo done step 3',
      'echo done step 4',
      'echo done step 5',
      'make: *** [all] Error 1',
    ].join('\n') + '\n',
  },
  {
    name: 'cmake --build progress',
    cmd: 'cmake --build .',
    output: [
      '[ 10%] Building CXX object foo.o',
      '[ 20%] Building CXX object bar.o',
      '[ 30%] Building CXX object baz.o',
      '[ 40%] Linking CXX static library libstuff.a',
      '[ 50%] Building CXX object qux.o',
      '[ 60%] Linking CXX executable app',
      '[ 70%] Built target stuff',
      '[ 80%] Built target app',
      '[ 90%] Built target tests',
      '[100%] Built target install',
      'done',
    ].join('\n') + '\n',
  },
  {
    name: 'gradle SUCCESSFUL',
    cmd: './gradlew build',
    output: [
      '> Task :compileJava',
      '> Task :processResources',
      '> Task :classes',
      '> Task :jar',
      '> Task :assemble',
      '> Task :compileTestJava',
      '> Task :testClasses',
      '> Task :test',
      '> Task :check',
      '> Task :build',
      'BUILD SUCCESSFUL in 12s',
    ].join('\n') + '\n',
  },
  {
    name: 'gradle FAILED',
    cmd: './gradlew build',
    output: [
      '> Task :compileJava',
      '> Task :processResources',
      '> Task :classes',
      '> Task :compileTestJava FAILED',
      '',
      'FAILURE: Build failed with an exception.',
      '',
      '* What went wrong:',
      'Execution failed for task :compileTestJava.',
      '> Compilation failed; see the compiler error output for details.',
      '',
      '* Try:',
      'Run with --stacktrace option to get the stack trace.',
      '',
      'BUILD FAILED in 7s',
    ].join('\n') + '\n',
  },
  {
    name: 'mvn package w/ downloads + error',
    cmd: 'mvn package',
    output: [
      '[INFO] Scanning for projects...',
      '[INFO] Downloading: https://repo1.maven.org/maven2/x/y/1.0/y-1.0.pom',
      '[INFO] Downloading: https://repo1.maven.org/maven2/a/b/2.0/b-2.0.pom',
      '[INFO] Downloading: https://repo1.maven.org/maven2/c/d/3.0/d-3.0.jar',
      '[INFO] Downloaded: ...',
      '[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) @ demo ---',
      '[INFO] Compiling 10 source files to target/classes',
      '[ERROR] COMPILATION ERROR :',
      '[ERROR] /repo/src/main/java/App.java:[10,1] cannot find symbol',
      '[ERROR] -> [Help 1]',
      '[INFO] ------------------------------------------------------------------------',
      '[INFO] BUILD FAILURE',
    ].join('\n') + '\n',
  },
  {
    name: 'rsync -av per-file + summary',
    cmd: 'rsync -av src/ dst/',
    output: [
      'sending incremental file list',
      'a.txt',
      'b.txt',
      'c.txt',
      'd.txt',
      'e.txt',
      'f.txt',
      'g.txt',
      'h.txt',
      'i.txt',
      'j.txt',
      '',
      'sent 12,345 bytes  received 678 bytes  26,046.00 bytes/sec',
      'total size is 9,999  speedup is 0.76',
    ].join('\n') + '\n',
  },
  {
    name: 'scp progress bars (KB/s + kB/s)',
    cmd: 'scp file host:/path',
    output: [
      'file1.bin                                      10%   100KB  1.2KB/s   0:00:50',
      'file1.bin                                      20%   200KB  1.2KB/s   0:00:40',
      'file1.bin                                      30%   300KB  1.2KB/s   0:00:30',
      'file1.bin                                      40%   400KB  1.2KB/s   0:00:20',
      'file1.bin                                      50%   500KB  1.2KB/s   0:00:10',
      'file1.bin                                      60%   600KB  1.2kB/s   0:00:09',
      'file1.bin                                      70%   700KB  1.2kB/s   0:00:08',
      'file1.bin                                      80%   800KB  1.2kB/s   0:00:07',
      'file1.bin                                      90%   900KB  1.2kB/s   0:00:06',
      'file1.bin                                     100%  1000KB  1.2kB/s   0:00:05',
      'done',
    ].join('\n') + '\n',
  },
];

function routesFor(cmd: string) {
  return {
    isBuildCommand: isBuildCommand(cmd),
    isGitCommand: isGitCommand(cmd),
    isTestCommand: isTestCommand(cmd),
    isLinterCommand: isLinterCommand(cmd),
    isBuildToolsCommand: isBuildToolsCommand(cmd),
    isPackageManagerCommand: isPackageManagerCommand(cmd),
    isTransferCommand: isTransferCommand(cmd),
  };
}

for (const s of scenarios) {
  const beforeLen = s.output.length;
  const res = filterBashOutput(s.cmd, s.output);
  const afterLen = res.output.length;
  const lines = res.output.split(/\n/).slice(0, 14);

  console.log(`\n=== ${s.name} ===`);
  console.log(`cmd: ${s.cmd}`);
  console.log(`routes: ${JSON.stringify(routesFor(s.cmd))}`);
  console.log(`savedChars: ${res.savedChars} (before=${beforeLen}, after=${afterLen})`);
  console.log('compressed output (first ~14 lines):');
  for (const l of lines) console.log(l);
  console.log(`(empty output? ${res.output === ''})`);
}
