import { describe, expect, test } from "bun:test";
import { findSubsystemModelProblems } from "./subsystem-model-validation";

function payload(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    title: "t",
    components: [],
    relations: [],
    ...partial,
  };
}

describe("findSubsystemModelProblems", () => {
  test("accepts a valid document", () => {
    expect(
      findSubsystemModelProblems(
        payload({
          components: [
            { alias: "a", name: "A", construct: "function", file: "src/a.ts", purl: "pkg:github/a/b" },
            { alias: "b", name: "B", construct: "class", file: "src/b.ts", purl: "pkg:github/a/b" },
          ],
          relations: [{ id: "r1", from: "a", to: "b", relationType: "imports" }],
        }),
      ),
    ).toEqual([]);
  });

  test("rejects an off-vocabulary construct (schema)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [{ alias: "a", name: "A", construct: "widget", file: "src/a.ts", purl: "pkg:github/a/b" }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("allowed:");
    expect(problems[0]!).toContain("function");
  });

  test("rejects a module without a file (cross-field)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [{ alias: "a", name: "A", construct: "function", file: "", purl: "pkg:github/a/b", module: "src/host" }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("file is empty");
  });

  test("rejects a relation endpoint with no component (cross-field)", () => {
    const problems = findSubsystemModelProblems(
      payload({
        components: [{ alias: "a", name: "A", construct: "function", file: "src/a.ts", purl: "pkg:github/a/b" }],
        relations: [{ id: "r1", from: "a", to: "ghost", relationType: "imports" }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!).toContain("/relations/0/to");
  });
});
