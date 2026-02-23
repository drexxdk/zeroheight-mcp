/// <reference types="vitest/globals" />
import { getBucketDebugInfo, clearStorageBucket } from "@/utils/image-utils";

type FakeClient = {
  storage: {
    listBuckets?: () => Promise<{ data: Array<{ name: string }>; error: null }>;
    from: (bucket: string) => {
      list: () => Promise<{ data: Array<{ name: string }>; error: null }>;
      remove: (items: string[]) => Promise<{ error: null }>;
    };
  };
};

function makeFakeClient(listResult: Array<{ name: string }>): FakeClient {
  return {
    storage: {
      listBuckets: async () => ({ data: [{ name: "b1" }], error: null }),
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
      client,
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
      client,
      bucketName: "my-bucket",
    });
    expect(out.deletedCount).toBe(3);
    expect(out.deleteErrors.length).toBe(0);
  });
});
