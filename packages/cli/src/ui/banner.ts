import { brandGradient, c, symbols } from "./theme";

const ASCII = String.raw`
 ____    ____   ____                          
|  _ \  / ___| |  _ \ _   _ _ __ ___  _ __    
| |_) || |  _  | |_) | | | | '_ \` _ \| '_ \   
|  __/ | |_| | |  __/| |_| | | | | | | |_) |  
|_|     \____| |_|    \__,_|_| |_| |_| .__/   
                                     |_|       
`;

const TAGLINE = "PostgreSQL → REST API generator";

export function printBanner(version: string): void {
  const lines = ASCII.split("\n");
  for (const line of lines) {
    if (line.trim().length === 0) {
      process.stdout.write("\n");
      continue;
    }
    process.stdout.write(brandGradient(line) + "\n");
  }
  console.log(
    `  ${c.bold(c.brand("PGPump"))} ${c.muted(`v${version}`)}  ${symbols.bullet}  ${c.accent(TAGLINE)}`,
  );
  console.log();
}
