/// <reference types="vitest/globals" />
import { getBucketDebugInfo, clearStorageBucket } from "../image-utils";
import type { Database } from "../../database.schema";

type SupabaseClient = ReturnType<
  typeof import("@supabase/supabase-js").createClient<Database>
>;

type FakeClient = {
  storage: {
    listBuckets?: () => Promise<{ data: Array<{ name: string }> } | unknown>;
    from: (bucket: string) => {
      list: () => Promise<
        { data: Array<{ name: string }>; error: null } | unknown
      >;
      remove: (items: string[]) => Promise<{ error: null } | unknown>;
    };
  };
};

function makeFakeClient(listResult: Array<{ name: string }>): FakeClient {
  return {
    storage: {
      listBuckets: async () => ({ data: [{ name: "b1" }] }),
      from: (bucket: string) => ({
        list: async () => ({ data: listResult, error: null }),
        remove: async (items: string[]) => {
          void bucket;
          void items;
          return { error: null };
        },
      }),
    },
  };
}

describe("image-utils storage helpers", () => {
  test("getBucketDebugInfo collects buckets and files", async () => {
    const client = makeFakeClient([{ name: "f1" }]);
    const res = await getBucketDebugInfo({
      client: client as unknown as SupabaseClient,
      bucketName: "my-bucket",
    });
    expect(res.buckets).toContain("b1");
    expect(res.files.length).toBe(1);
    expect(res.files[0].name).toBe("f1");
  });

  test("clearStorageBucket deletes files in batches", async () => {
    const client = makeFakeClient(
      Array.from({ length: 3 }, (_, i) => ({ name: `file${i}` })),
    );
    const out = await clearStorageBucket({
      client: client as unknown as SupabaseClient,
      bucketName: "my-bucket",
    });
    expect(out.deletedCount).toBe(3);
    expect(out.deleteErrors.length).toBe(0);
  });
});
