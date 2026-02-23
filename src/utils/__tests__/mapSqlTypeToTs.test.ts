import { mapSqlTypeToTs } from "@/utils/common";

describe("mapSqlTypeToTs", () => {
  test("maps common numeric types to number", () => {
    expect(mapSqlTypeToTs({ sqlType: "integer" })).toBe("number");
    expect(mapSqlTypeToTs({ sqlType: "bigint" })).toBe("number");
    expect(mapSqlTypeToTs({ sqlType: "decimal" })).toBe("number");
  });

  test("maps string types to string", () => {
    expect(mapSqlTypeToTs({ sqlType: "text" })).toBe("string");
    expect(mapSqlTypeToTs({ sqlType: "character varying" })).toBe("string");
    expect(mapSqlTypeToTs({ sqlType: "varchar" })).toBe("string");
  });

  test("maps json/jsonb to Record<string, unknown>", () => {
    expect(mapSqlTypeToTs({ sqlType: "json" })).toBe("Record<string, unknown>");
    expect(mapSqlTypeToTs({ sqlType: "jsonb" })).toBe(
      "Record<string, unknown>",
    );
  });

  test("returns unknown for unmapped types", () => {
    expect(mapSqlTypeToTs({ sqlType: "some_custom_type" })).toBe("unknown");
  });
});
