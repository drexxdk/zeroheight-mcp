#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createSuccessResponse } from "../lib/common";

const obj = {
  jobId: "mllid85iz528gu",
  window: {
    started: "2026-02-13T23:18:00.36+00:00",
    finished: "2026-02-13T23:24:15.283+00:00",
  },
  pagesInserted: 0,
  imagesLinked: 0,
};

console.log("Calling createSuccessResponse...");
const res = createSuccessResponse(obj);
console.log("Returned:", JSON.stringify(res, null, 2));
