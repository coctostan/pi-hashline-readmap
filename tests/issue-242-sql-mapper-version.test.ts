import { it } from "vitest";

import { MAPPER_VERSION } from "../src/readmap/mappers/sql.js";

it("invalidates persistent SQL maps after statement ranges change", () => {
  if (MAPPER_VERSION !== 2) {
    throw new Error(
      `expected SQL mapper version 2 after range changes, received ${MAPPER_VERSION}`,
    );
  }
});
